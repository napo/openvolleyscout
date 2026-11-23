// SPDX-License-Identifier: AGPL-3.0-or-later

/** What synchronisation needs from a cloud service holding the archive file. */

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface RemoteFile {
  readonly id: string;
  /** Opaque revision/eTag: changes only when the remote file changes. */
  readonly version: string;
}

/** A request refused by the cloud service; status 401 means the access token is no longer valid. */
export class StorageError extends Error {
  constructor(
    readonly status: number,
    /** Provider error summary/code when available, shown to the user with the status. */
    readonly code = '',
  ) {
    super(`storage: ${status} ${code}`.trim());
  }
}

/** Space of the cloud account in bytes; `total` is null when the account has no fixed limit. */
export interface SpaceUsage {
  readonly used: number;
  readonly total: number | null;
}

export interface RemoteStorage {
  /** The archive file of the app, or null when there is none (never synchronised, or deleted by the user). */
  findArchive(): Promise<RemoteFile | null>;
  version(id: string): Promise<string | null>;
  download(id: string): Promise<Uint8Array>;
  create(bytes: Uint8Array): Promise<RemoteFile>;
  /** Writes only over the `expected` version; returns null when another device wrote first. */
  update(id: string, bytes: Uint8Array, expected: string): Promise<RemoteFile | null>;
  /** Moves the file to the bin of the service. */
  trash(id: string): Promise<void>;
  /** Used and total space of the account, or null when the service does not tell this app. */
  spaceUsage(): Promise<SpaceUsage | null>;
}

/** A match video stored in the cloud folder of the app; the file name starts with the match id. */
export interface CloudVideoFile {
  readonly id: string;
  readonly matchId: string;
  readonly name: string;
  readonly size: number;
}

export type VideoChunkResult = { readonly done: false; readonly offset: number } | { readonly done: true; readonly file: CloudVideoFile };

/** Bytes per request: a multiple of 256 KiB (Google Drive) and 320 KiB (OneDrive). */
export const VIDEO_CHUNK_BYTES = 10 * 1024 * 1024;

/** Separator between the match id and the original file name in the cloud. */
const VIDEO_NAME_SEPARATOR = '__';

export function cloudVideoName(matchId: string, fileName: string): string {
  const safe = fileName.replace(/[\\/:*?"<>|]+/g, '_').slice(-120) || 'video.mp4';
  return `${matchId}${VIDEO_NAME_SEPARATOR}${safe}`;
}

export function matchIdFromCloudVideoName(name: string): string | null {
  const index = name.indexOf(VIDEO_NAME_SEPARATOR);
  return index > 0 ? name.slice(0, index) : null;
}

/**
 * Match videos in the cloud: resumable uploads in chunks, a playable link
 * for other devices, removal. Sessions are opaque strings the caller keeps
 * to resume an interrupted upload.
 */
export interface VideoStorage {
  listVideos(): Promise<CloudVideoFile[]>;
  startVideoUpload(matchId: string, fileName: string, size: number): Promise<string>;
  /** Bytes the service already has for this session, or null when the session expired. */
  videoUploadOffset(session: string, size: number, knownOffset: number): Promise<number | null>;
  uploadVideoChunk(session: string, offset: number, bytes: Uint8Array, size: number): Promise<VideoChunkResult>;
  /** False when the service only serves the file with an Authorization header (Google Drive): no streaming. */
  readonly canStream: boolean;
  /** A link the video player can open directly (short-lived on some services). */
  videoStreamUrl(file: CloudVideoFile): Promise<string>;
  /** The request that downloads the whole file. */
  videoDownloadRequest(file: CloudVideoFile): Promise<{ url: string; headers?: Record<string, string> }>;
  trashVideo(file: CloudVideoFile): Promise<void>;
}
