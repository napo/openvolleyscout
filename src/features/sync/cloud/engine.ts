// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Core cloud synchronisation round:
 * download the remote `.ovs` archive, merge it with the local archive against
 * the recorded base, apply incoming changes locally, and upload the merged
 * archive conditionally when it differs from the remote version. If another
 * device updated the remote file in the meantime, retry up to 3 times.
 */

import type { CloudAuth } from './auth';
import {
  type CloudSnapshot,
  EMPTY_CLOUD_SNAPSHOT,
  type SnapshotDiff,
  type SyncBase,
  diffCloudSnapshots,
  mergeCloudSnapshots,
  snapshotStamps,
} from './merge';
import type { DeviceInfo } from './device';
import { EMPTY_PRESENCE, type PresenceResult, type ScoutingIntent, resolvePresence } from './presence';
import { type RemoteFile, type RemoteStorage, StorageError } from './storage';

// The `.ovs` codec (Arrow tables in a zip) is several hundred KB and only needed
// once a sync round actually runs, so it is fetched then instead of at startup.
let cloudFileCodec: Promise<typeof import('./file')> | null = null;
function loadCloudFileCodec(): Promise<typeof import('./file')> {
  cloudFileCodec ??= import('./file').catch((error) => {
    cloudFileCodec = null;
    throw error;
  });
  return cloudFileCodec;
}

export interface CloudSyncArchive {
  /** Everything sync copies, read in one transaction. */
  snapshot(): Promise<CloudSnapshot>;
  /**
   * Writes what a round brought. A record whose stamp on this device differs
   * from `read` (changed or deleted here after the snapshot) is left alone:
   * the next round passes it on. Returns how many changes were written.
   */
  applySync(diff: SnapshotDiff, read: ReadonlyMap<string, string>): Promise<number>;
  getMeta<T>(key: string): Promise<T | null>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export interface SyncDependencies {
  readonly archive: CloudSyncArchive;
  readonly auth: CloudAuth;
  readonly storage: (accessToken: string) => RemoteStorage;
  readonly newId?: () => string;
  readonly now?: () => Date;
  /** Scouting claims and the device list; without it the file's presence is kept as is. */
  readonly presence?: PresenceDependencies;
}

export interface PresenceDependencies {
  readonly self: () => Promise<DeviceInfo>;
  readonly intent: () => ScoutingIntent;
  readonly takeoverMs: () => number;
  /** Called with the claims as written to (or found in) the file at the end of the round. */
  readonly onResolved: (result: PresenceResult) => void;
}

export interface SyncOutcome {
  /** False when no access token could be obtained without prompting the user. */
  readonly done: boolean;
  /** Number of local record changes applied from remote. */
  readonly received: number;
  readonly uploaded: boolean;
  /** Matches edited on two devices concurrently: older version kept as a copy. */
  readonly conflicts: number;
}

export const META = {
  enabled: 'sync.enabled',
  base: 'sync.base',
  fileId: 'sync.fileId',
  lastSyncedAt: 'sync.lastSyncedAt',
  provider: 'sync.provider',
} as const;

const ATTEMPTS = 3;

const defaultNewId = () => `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function synchronise(deps: SyncDependencies, interactive = false): Promise<SyncOutcome> {
  const { archive, auth, storage } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? defaultNewId;

  for (let retryAuth = true; ; retryAuth = false) {
    const token = await auth.token(interactive);
    if (!token) return { done: false, received: 0, uploaded: false, conflicts: 0 };
    try {
      return await round(storage(token));
    } catch (e) {
      // An access token refused before expiry: invalidate and retry once.
      if (e instanceof StorageError && e.status === 401 && retryAuth) {
        auth.invalidate();
        continue;
      }
      throw e;
    }
  }

  async function round(client: RemoteStorage): Promise<SyncOutcome> {
    const { readCloudSyncFile, writeCloudSyncFile } = await loadCloudFileCodec();
    const self = deps.presence ? await deps.presence.self() : null;
    let received = 0;
    let conflicts = 0;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const knownId = await archive.getMeta<string>(META.fileId);
      const knownVersion = knownId ? await client.version(knownId) : null;
      let file: RemoteFile | null = knownId && knownVersion
        ? { id: knownId, version: knownVersion }
        : await client.findArchive();
      const remote = file ? readCloudSyncFile(await client.download(file.id)) : EMPTY_CLOUD_SNAPSHOT;
      const local = await archive.snapshot();
      const base = (await archive.getMeta<SyncBase>(META.base)) ?? {};
      const at = now();
      const { merged, base: nextBase, conflicts: found } = mergeCloudSnapshots(local, remote, base, newId, at);
      conflicts += found;

      const toLocal = diffCloudSnapshots(local, merged);
      if (toLocal.changed) received += await archive.applySync(toLocal, snapshotStamps(local));

      const presence = deps.presence && self
        ? resolvePresence(remote.presence ?? EMPTY_PRESENCE, self, deps.presence.intent(), at, deps.presence.takeoverMs())
        : null;
      const upload = !file || diffCloudSnapshots(remote, merged).changed || Boolean(presence?.changed);
      if (upload) {
        // Record remote stamps as merged even if the upload fails later, so they do not re-conflict.
        await archive.setMeta(META.base, { ...base, ...Object.fromEntries(snapshotStamps(remote)) });
        const bytes = writeCloudSyncFile(merged, presence?.presence ?? remote.presence ?? EMPTY_PRESENCE);
        if (file) {
          const updated = await client.update(file.id, bytes, file.version);
          if (!updated) continue;
          file = updated;
        } else {
          file = await client.create(bytes);
        }
      }
      await archive.setMeta(META.fileId, file!.id);
      await archive.setMeta(META.base, nextBase);
      await archive.setMeta(META.lastSyncedAt, at.toISOString());
      if (presence) deps.presence!.onResolved(presence);
      return { done: true, received, uploaded: upload, conflicts };
    }
    throw new Error('sync: the remote file keeps changing');
  }
}

/** Forgets remote file id, sync base, and provider so the next connection starts fresh. */
export async function forgetSync(archive: CloudSyncArchive): Promise<void> {
  await archive.setMeta(META.fileId, null);
  await archive.setMeta(META.base, {});
  await archive.setMeta(META.lastSyncedAt, null);
  await archive.setMeta(META.provider, null);
}
