// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * OneDrive through Microsoft Graph, only what synchronisation needs.
 * Uses the `Files.ReadWrite.AppFolder` scope: sees only its own folder under
 * Apps in the user's OneDrive, with conditional writes via `If-Match` eTag.
 */

import { SYNC_FILE_NAME } from './config';
import { type Fetch, type RemoteFile, type RemoteStorage, StorageError } from './storage';

const ITEM = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILE_NAME}`;
const CONTENT = `${ITEM}:/content`;

export const ONEDRIVE_SCOPE = 'Files.ReadWrite.AppFolder offline_access';

interface Item {
  readonly eTag: string;
  readonly '@microsoft.graph.downloadUrl': string;
}

export class OneDriveClient implements RemoteStorage {
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
}
