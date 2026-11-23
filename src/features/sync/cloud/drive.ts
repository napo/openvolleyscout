// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google Drive REST API (v3), only what synchronisation needs.
 * Uses the narrow `drive.file` scope: the app only sees the "OpenVolleyScout"
 * folder and archive file it creates, located via `appProperties` so the user
 * may move or rename them safely.
 */

import { SYNC_FILE_NAME, SYNC_FOLDER_NAME } from './config';
import { type Fetch, type RemoteFile, type RemoteStorage, StorageError } from './storage';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PROPERTY = 'openvolleyscout';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class DriveClient implements RemoteStorage {
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
}
