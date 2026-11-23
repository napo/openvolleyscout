// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google Drive REST API (v3), only what synchronisation needs.
 * Uses the narrow `drive.file` scope: the app only sees the "OpenVolleyScout"
 * folder and archive file it creates, located via `appProperties` so the user
 * may move or rename them safely.
 */

import { SYNC_FILE_NAME, SYNC_FOLDER_NAME } from './config';
import {
  type CloudVideoFile,
  type Fetch,
  type RemoteFile,
  type RemoteStorage,
  type SpaceUsage,
  StorageError,
  type VideoChunkResult,
  type VideoStorage,
  cloudVideoName,
  matchIdFromCloudVideoName,
} from './storage';
import { canStreamThroughWorker, registerWorkerStream } from './video-stream-worker';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PROPERTY = 'openvolleyscout';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class DriveClient implements RemoteStorage, VideoStorage {
  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchFn(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) throw new StorageError(response.status);
    return response;
  }

  private async find(value: string, extra = ''): Promise<RemoteFile | null> {
    const q = `appProperties has { key='${PROPERTY}' and value='${value}' } and trashed=false${extra}`;
    const response = await this.request(
      `${API}?${new URLSearchParams({ q, spaces: 'drive', fields: 'files(id,version)', orderBy: 'modifiedTime desc' })}`,
    );
    const { files } = (await response.json()) as { files?: RemoteFile[] };
    return files?.[0] ?? null;
  }

  findArchive(): Promise<RemoteFile | null> {
    return this.find('archive');
  }

  async version(id: string): Promise<string | null> {
    try {
      const response = await this.request(`${API}/${id}?fields=version,trashed`);
      const file = (await response.json()) as { version: string; trashed?: boolean };
      return file.trashed ? null : file.version;
    } catch (e) {
      if (e instanceof StorageError && e.status === 404) return null;
      throw e;
    }
  }

  async download(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.request(`${API}/${id}?alt=media`)).arrayBuffer());
  }

  private async folder(): Promise<string> {
    const found = await this.find('folder', ` and mimeType='${FOLDER_MIME}'`);
    if (found) return found.id;
    const response = await this.request(`${API}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: SYNC_FOLDER_NAME,
        mimeType: FOLDER_MIME,
        appProperties: { [PROPERTY]: 'folder' },
      }),
    });
    return ((await response.json()) as { id: string }).id;
  }

  async create(bytes: Uint8Array): Promise<RemoteFile> {
    const metadata = {
      name: SYNC_FILE_NAME,
      parents: [await this.folder()],
      mimeType: 'application/zip',
      appProperties: { [PROPERTY]: 'archive' },
    };
    const boundary = `openvolleyscout${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
      bytes as BlobPart,
      `\r\n--${boundary}--`,
    ]);
    const response = await this.request(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return (await response.json()) as RemoteFile;
  }

  /** Moves the file to the bin of the user's Drive, where it remains recoverable for 30 days. */
  async trash(id: string): Promise<void> {
    await this.request(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }

  /** Drive has no conditional write header: the version is checked right before writing. */
  async update(id: string, bytes: Uint8Array, expected: string): Promise<RemoteFile | null> {
    if ((await this.version(id)) !== expected) return null;
    const response = await this.request(`${UPLOAD}/${id}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/zip' },
      body: new Blob([bytes as BlobPart]),
    });
    return (await response.json()) as RemoteFile;
  }

  async spaceUsage(): Promise<SpaceUsage | null> {
    try {
      const response = await this.request('https://www.googleapis.com/drive/v3/about?fields=storageQuota');
      const { storageQuota } = (await response.json()) as { storageQuota?: { limit?: string; usage?: string } };
      if (!storageQuota?.usage) return null;
      return { used: Number(storageQuota.usage), total: storageQuota.limit ? Number(storageQuota.limit) : null };
    } catch {
      return null;
    }
  }

  async listVideos(): Promise<CloudVideoFile[]> {
    const q = `appProperties has { key='${PROPERTY}' and value='video' } and trashed=false`;
    const videos: CloudVideoFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q, spaces: 'drive', fields: 'nextPageToken,files(id,name,size)', pageSize: '200' });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await this.request(`${API}?${params}`);
      const page = (await response.json()) as { nextPageToken?: string; files?: Array<{ id: string; name: string; size?: string }> };
      for (const file of page.files ?? []) {
        const matchId = matchIdFromCloudVideoName(file.name);
        if (matchId) videos.push({ id: file.id, matchId, name: file.name, size: Number(file.size ?? 0) });
      }
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return videos;
  }

  async startVideoUpload(matchId: string, fileName: string, size: number): Promise<string> {
    const response = await this.request(`${UPLOAD}?uploadType=resumable&fields=id,name,size`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify({
        name: cloudVideoName(matchId, fileName),
        parents: [await this.folder()],
        appProperties: { [PROPERTY]: 'video' },
      }),
    });
    const location = response.headers.get('Location') ?? response.headers.get('location');
    if (!location) throw new StorageError(0, 'no upload session');
    return location;
  }

  private async putChunk(session: string, range: string, body?: Uint8Array): Promise<Response> {
    return this.fetchFn(session, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Range': range },
      body: body ? new Blob([body as BlobPart]) : undefined,
    });
  }

  private static rangeEnd(response: Response): number | null {
    const range = response.headers.get('Range') ?? response.headers.get('range');
    const end = range ? /bytes=0-(\d+)/.exec(range)?.[1] : undefined;
    return end === undefined ? null : Number(end) + 1;
  }

  async videoUploadOffset(session: string, size: number, knownOffset: number): Promise<number | null> {
    const response = await this.putChunk(session, `bytes */${size}`);
    if (response.status === 404 || response.status === 410) return null;
    if (response.status === 308) return DriveClient.rangeEnd(response) ?? (response.headers.has('Range') ? knownOffset : 0);
    if (response.ok) return size;
    throw new StorageError(response.status);
  }

  async uploadVideoChunk(session: string, offset: number, bytes: Uint8Array, size: number): Promise<VideoChunkResult> {
    const end = offset + bytes.length;
    const response = await this.putChunk(session, `bytes ${offset}-${end - 1}/${size}`, bytes);
    if (response.status === 308) return { done: false, offset: DriveClient.rangeEnd(response) ?? end };
    if (!response.ok) throw new StorageError(response.status);
    const file = (await response.json()) as { id: string; name: string; size?: string };
    return {
      done: true,
      file: { id: file.id, matchId: matchIdFromCloudVideoName(file.name) ?? '', name: file.name, size: Number(file.size ?? size) },
    };
  }

  /**
   * Drive serves file contents only with the token in an Authorization header,
   * which a video player cannot send: the web app streams through its service
   * worker, which adds it. Elsewhere the video can only be downloaded.
   */
  get canStream(): boolean {
    return canStreamThroughWorker();
  }

  async videoStreamUrl(file: CloudVideoFile): Promise<string> {
    if (!canStreamThroughWorker()) throw new StorageError(0, 'streaming not supported');
    return registerWorkerStream(`${API}/${file.id}?alt=media`, this.accessToken);
  }

  async videoDownloadRequest(file: CloudVideoFile): Promise<{ url: string; headers?: Record<string, string> }> {
    return { url: `${API}/${file.id}?alt=media`, headers: { Authorization: `Bearer ${this.accessToken}` } };
  }

  trashVideo(file: CloudVideoFile): Promise<void> {
    return this.trash(file.id);
  }
}
