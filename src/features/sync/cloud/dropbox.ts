// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Dropbox API (v2), only what synchronisation needs.
 * Uses the "App folder" permission: sees only its own folder in the user's
 * Dropbox, with conditional writes checked against the revision (`rev`).
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

const API = 'https://api.dropboxapi.com/2/files';
const CONTENT = 'https://content.dropboxapi.com/2/files';
const PATH = `/${SYNC_FILE_NAME}`;
const VIDEO_FOLDER = '/videos';

/** `sharing.write`: short shared links (a public link to a small file in the app folder). */
export const DROPBOX_SCOPE = 'files.content.read files.content.write files.metadata.read sharing.write';

class DropboxError extends StorageError {
  constructor(
    status: number,
    readonly summary: string,
  ) {
    super(status, summary);
  }
}

export class DropboxClient implements RemoteStorage, VideoStorage {
  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
  ) {}

  private async request(url: string, init: RequestInit): Promise<Response> {
    const response = await this.fetchFn(url, {
      method: 'POST',
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.accessToken}` },
    });
    if (response.ok) return response;
    const { error_summary: summary = '' } = (await response.json().catch(() => ({}))) as { error_summary?: string };
    throw new DropboxError(response.status, summary);
  }

  private rpc(name: string, args: object): Promise<Response> {
    return this.request(`${API}/${name}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  }

  private async upload(bytes: Uint8Array, mode: unknown): Promise<RemoteFile> {
    const response = await this.request(`${CONTENT}/upload`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: PATH, mode, autorename: false, mute: true, strict_conflict: true }),
      },
      body: new Blob([bytes as BlobPart]),
    });
    return { id: PATH, version: ((await response.json()) as { rev: string }).rev };
  }

  async findArchive(): Promise<RemoteFile | null> {
    const version = await this.version();
    return version ? { id: PATH, version } : null;
  }

  async version(): Promise<string | null> {
    try {
      return ((await (await this.rpc('get_metadata', { path: PATH })).json()) as { rev: string }).rev;
    } catch (e) {
      if (e instanceof DropboxError && e.status === 409 && e.summary.includes('not_found')) return null;
      throw e;
    }
  }

  async download(): Promise<Uint8Array> {
    const response = await this.request(`${CONTENT}/download`, {
      headers: { 'Dropbox-API-Arg': JSON.stringify({ path: PATH }) },
    });
    return new Uint8Array(await response.arrayBuffer());
  }

  create(bytes: Uint8Array): Promise<RemoteFile> {
    return this.upload(bytes, 'add');
  }

  async update(_id: string, bytes: Uint8Array, expected: string): Promise<RemoteFile | null> {
    try {
      return await this.upload(bytes, { '.tag': 'update', update: expected });
    } catch (e) {
      if (e instanceof DropboxError && e.status === 409 && e.summary.includes('conflict')) return null;
      throw e;
    }
  }

  async trash(): Promise<void> {
    await this.rpc('delete_v2', { path: PATH });
  }

  /** Needs the "account_info.read" permission, which the app does not ask for: null when refused. */
  async spaceUsage(): Promise<SpaceUsage | null> {
    try {
      const response = await this.request('https://api.dropboxapi.com/2/users/get_space_usage', {});
      const { used, allocation } = (await response.json()) as { used?: number; allocation?: { allocated?: number } };
      if (typeof used !== 'number') return null;
      return { used, total: typeof allocation?.allocated === 'number' ? allocation.allocated : null };
    } catch {
      return null;
    }
  }

  async listVideos(): Promise<CloudVideoFile[]> {
    const videos: CloudVideoFile[] = [];
    type Entry = { '.tag': string; id: string; name: string; size?: number };
    let page: { entries: Entry[]; cursor: string; has_more: boolean };
    try {
      page = (await (await this.rpc('list_folder', { path: VIDEO_FOLDER })).json()) as typeof page;
    } catch (e) {
      if (e instanceof DropboxError && e.status === 409 && e.summary.includes('not_found')) return [];
      throw e;
    }
    for (;;) {
      for (const entry of page.entries) {
        const matchId = entry['.tag'] === 'file' ? matchIdFromCloudVideoName(entry.name) : null;
        if (matchId) videos.push({ id: entry.id, matchId, name: entry.name, size: entry.size ?? 0 });
      }
      if (!page.has_more) return videos;
      page = (await (await this.rpc('list_folder/continue', { cursor: page.cursor })).json()) as typeof page;
    }
  }

  /** The session also carries the target name: Dropbox needs it only when the upload is finished. */
  async startVideoUpload(matchId: string, fileName: string): Promise<string> {
    const response = await this.request(`${CONTENT}/upload_session/start`, {
      headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ close: false }) },
      body: new Blob([]),
    });
    const { session_id: id } = (await response.json()) as { session_id: string };
    return JSON.stringify({ id, path: `${VIDEO_FOLDER}/${cloudVideoName(matchId, fileName)}` });
  }

  /** Dropbox does not report the offset on request: the known one is checked by the next chunk. */
  async videoUploadOffset(_session: string, _size: number, knownOffset: number): Promise<number | null> {
    return knownOffset;
  }

  async uploadVideoChunk(session: string, offset: number, bytes: Uint8Array, size: number): Promise<VideoChunkResult> {
    const { id, path } = JSON.parse(session) as { id: string; path: string };
    const last = offset + bytes.length >= size;
    const cursor = { session_id: id, offset };
    const arg = last
      ? { cursor, commit: { path, mode: 'add', autorename: true, mute: true } }
      : { cursor, close: false };
    const response = await this.fetchFn(`${CONTENT}/upload_session/${last ? 'finish' : 'append_v2'}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify(arg),
      },
      body: new Blob([bytes as BlobPart]),
    });
    if (response.status === 409) {
      const body = (await response.json().catch(() => ({}))) as { error?: { lookup_failed?: { correct_offset?: number }; correct_offset?: number } };
      const correct = body.error?.lookup_failed?.correct_offset ?? body.error?.correct_offset;
      if (typeof correct === 'number') return { done: false, offset: correct };
      throw new DropboxError(409, JSON.stringify(body.error ?? {}));
    }
    if (!response.ok) throw new DropboxError(response.status, '');
    if (!last) return { done: false, offset: offset + bytes.length };
    const file = (await response.json()) as { id: string; name: string; size: number };
    return { done: true, file: { id: file.id, matchId: matchIdFromCloudVideoName(file.name) ?? '', name: file.name, size: file.size } };
  }

  /** A direct link valid for four hours. */
  async videoStreamUrl(file: CloudVideoFile): Promise<string> {
    return ((await (await this.rpc('get_temporary_link', { path: file.id })).json()) as { link: string }).link;
  }

  readonly canStream = true;

  async videoDownloadRequest(file: CloudVideoFile): Promise<{ url: string; headers?: Record<string, string> }> {
    return { url: await this.videoStreamUrl(file) };
  }

  async trashVideo(file: CloudVideoFile): Promise<void> {
    await this.rpc('delete_v2', { path: file.id });
  }

  /**
   * A small shared-link file in the app folder with a public link. Returns its
   * reference as `<link id>~<rlkey>~<name>`, enough to download it without
   * signing in (see `dropboxSharedFileUrl`).
   */
  async createSharedFile(text: string, name: string): Promise<string> {
    const stamp = `${name.replace(/\.json$/, '').replace(/[^\w-]+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `/shares/${stamp}.json`;
    await this.request(`${CONTENT}/upload`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: true }),
      },
      body: new Blob([text]),
    });
    const response = await this.request('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, settings: { requested_visibility: 'public', audience: 'public', access: 'viewer' } }),
    });
    const { url } = (await response.json()) as { url: string };
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/scl\/fi\/([\w-]+)\/([\w-]+)\.json$/);
    const rlkey = parsed.searchParams.get('rlkey');
    if (!match || !rlkey) throw new StorageError(0, 'unexpected shared link');
    return `${match[1]}~${rlkey}~${match[2]}`;
  }
}
