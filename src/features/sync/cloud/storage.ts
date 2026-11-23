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
