// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * OneDrive through Microsoft Graph, only what synchronisation needs.
 * Uses the `Files.ReadWrite.AppFolder` scope: sees only its own folder under
 * Apps in the user's OneDrive, with conditional writes via `If-Match` eTag.
 */

import { SYNC_FILE_NAME } from './config';
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

const ITEM = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILE_NAME}`;
const CONTENT = `${ITEM}:/content`;
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';
const VIDEO_FOLDER = `${GRAPH}/special/approot:/videos`;

export const ONEDRIVE_SCOPE = 'Files.ReadWrite.AppFolder offline_access';

interface Item {
  readonly eTag: string;
  readonly '@microsoft.graph.downloadUrl': string;
}

export class OneDriveClient implements RemoteStorage, VideoStorage {
  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchFn(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      const { error } = (await response.json().catch(() => ({}))) as { error?: { code?: string } };
      throw new StorageError(response.status, error?.code);
    }
    return response;
  }

  private async item(): Promise<Item | null> {
    try {
      return (await (await this.request(ITEM)).json()) as Item;
    } catch (e) {
      if (e instanceof StorageError && e.status === 404) return null;
      throw e;
    }
  }

  private async upload(url: string, bytes: Uint8Array, headers: Record<string, string> = {}): Promise<RemoteFile> {
    const response = await this.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', ...headers },
      body: new Blob([bytes as BlobPart]),
    });
    return { id: SYNC_FILE_NAME, version: ((await response.json()) as Item).eTag };
  }

  async findArchive(): Promise<RemoteFile | null> {
    const version = await this.version();
    return version ? { id: SYNC_FILE_NAME, version } : null;
  }

  async version(): Promise<string | null> {
    return (await this.item())?.eTag ?? null;
  }

  /** Downloads from the short-lived URL returned by Graph (browsers cannot follow /content redirects with CORS). */
  async download(): Promise<Uint8Array> {
    const item = await this.item();
    if (!item) throw new StorageError(404);
    const response = await this.fetchFn(item['@microsoft.graph.downloadUrl']);
    if (!response.ok) throw new StorageError(response.status);
    return new Uint8Array(await response.arrayBuffer());
  }

  create(bytes: Uint8Array): Promise<RemoteFile> {
    return this.upload(`${CONTENT}?${new URLSearchParams({ '@microsoft.graph.conflictBehavior': 'fail' })}`, bytes);
  }

  async update(_id: string, bytes: Uint8Array, expected: string): Promise<RemoteFile | null> {
    try {
      return await this.upload(CONTENT, bytes, { 'If-Match': expected });
    } catch (e) {
      if (e instanceof StorageError && (e.status === 412 || e.status === 404)) return null;
      throw e;
    }
  }

  async trash(): Promise<void> {
    await this.request(ITEM, { method: 'DELETE' });
  }

  /** The app-folder permission may not include the drive quota: null when refused. */
  async spaceUsage(): Promise<SpaceUsage | null> {
    try {
      const response = await this.request('https://graph.microsoft.com/v1.0/me/drive?$select=quota');
      const { quota } = (await response.json()) as { quota?: { used?: number; total?: number } };
      if (typeof quota?.used !== 'number') return null;
      return { used: quota.used, total: typeof quota.total === 'number' ? quota.total : null };
    } catch {
      return null;
    }
  }

  async listVideos(): Promise<CloudVideoFile[]> {
    const videos: CloudVideoFile[] = [];
    type Page = { value: Array<{ id: string; name: string; size?: number; file?: unknown }>; '@odata.nextLink'?: string };
    let url: string | undefined = `${VIDEO_FOLDER}:/children?$select=id,name,size,file&$top=200`;
    while (url) {
      let page: Page;
      try {
        page = (await (await this.request(url)).json()) as Page;
      } catch (e) {
        if (e instanceof StorageError && e.status === 404) return videos;
        throw e;
      }
      for (const item of page.value) {
        const matchId = item.file ? matchIdFromCloudVideoName(item.name) : null;
        if (matchId) videos.push({ id: item.id, matchId, name: item.name, size: item.size ?? 0 });
      }
      url = page['@odata.nextLink'];
    }
    return videos;
  }

  async startVideoUpload(matchId: string, fileName: string): Promise<string> {
    const name = encodeURIComponent(cloudVideoName(matchId, fileName));
    const response = await this.request(`${VIDEO_FOLDER}/${name}:/createUploadSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    });
    return ((await response.json()) as { uploadUrl: string }).uploadUrl;
  }

  private static nextOffset(body: { nextExpectedRanges?: string[] }): number | null {
    const first = body.nextExpectedRanges?.[0];
    return first ? Number(first.split('-')[0]) : null;
  }

  /** The upload URL is pre-authorised: no Authorization header (Microsoft rejects it there). */
  async videoUploadOffset(session: string, _size: number, knownOffset: number): Promise<number | null> {
    const response = await this.fetchFn(session);
    if (response.status === 404) return null;
    if (!response.ok) throw new StorageError(response.status);
    return OneDriveClient.nextOffset((await response.json()) as { nextExpectedRanges?: string[] }) ?? knownOffset;
  }

  async uploadVideoChunk(session: string, offset: number, bytes: Uint8Array, size: number): Promise<VideoChunkResult> {
    const end = offset + bytes.length;
    const response = await this.fetchFn(session, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${size}` },
      body: new Blob([bytes as BlobPart]),
    });
    if (!response.ok) throw new StorageError(response.status);
    const body = (await response.json()) as { id?: string; name?: string; size?: number; nextExpectedRanges?: string[] };
    if (response.status === 202 || !body.id) return { done: false, offset: OneDriveClient.nextOffset(body) ?? end };
    const name = body.name ?? '';
    return { done: true, file: { id: body.id, matchId: matchIdFromCloudVideoName(name) ?? '', name, size: body.size ?? size } };
  }

  /** A pre-authorised link valid for about an hour. */
  async videoStreamUrl(file: CloudVideoFile): Promise<string> {
    const item = (await (await this.request(`${GRAPH}/items/${file.id}`)).json()) as Item;
    return item['@microsoft.graph.downloadUrl'];
  }

  async trashVideo(file: CloudVideoFile): Promise<void> {
    await this.request(`${GRAPH}/items/${file.id}`, { method: 'DELETE' });
  }
}
