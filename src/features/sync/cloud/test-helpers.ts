// SPDX-License-Identifier: AGPL-3.0-or-later
/** In-memory archive and cloud file for the sync tests. */
import type { CloudSyncArchive } from './engine';
import { type CloudSnapshot, EMPTY_CLOUD_SNAPSHOT } from './merge';
import { type RemoteFile, type RemoteStorage, StorageError } from './storage';

export function makeMemoryArchive(initial: Partial<CloudSnapshot> = {}): CloudSyncArchive & { state: CloudSnapshot } {
  const meta = new Map<string, unknown>();
  const archive = {
    state: { ...EMPTY_CLOUD_SNAPSHOT, ...initial },
    async getMeta<T>(key: string): Promise<T | null> {
      return (meta.get(key) as T | undefined) ?? null;
    },
    async setMeta(key: string, value: unknown): Promise<void> {
      if (value === null || value === undefined) meta.delete(key);
      else meta.set(key, value);
    },
    async snapshot(): Promise<CloudSnapshot> {
      return archive.state;
    },
    async applySync(diff: Parameters<CloudSyncArchive['applySync']>[0]): Promise<number> {
      const delMatches = new Set(diff.deleteIds.matches);
      const putMatches = new Map(diff.putMatches.map((m) => [m.metadata.id, m]));
      const nextMatches = archive.state.matches
        .filter((m) => !delMatches.has(m.metadata.id))
        .map((m) => putMatches.get(m.metadata.id) ?? m);
      for (const m of diff.putMatches) {
        if (!nextMatches.some((existing) => existing.metadata.id === m.metadata.id)) {
          nextMatches.push(m);
        }
      }
      archive.state = {
        ...archive.state,
        matches: nextMatches,
        deletions: diff.deletions,
      };
      return diff.putMatches.length + diff.deleteIds.matches.length;
    },
  };
  return archive;
}

export function makeMemoryRemote(): RemoteStorage & { file: { id: string; version: string; bytes: Uint8Array } | null; conflictOnce: boolean } {
  let rev = 0;
  const remote = {
    file: null as { id: string; version: string; bytes: Uint8Array } | null,
    conflictOnce: false,
    async findArchive(): Promise<RemoteFile | null> {
      return remote.file ? { id: remote.file.id, version: remote.file.version } : null;
    },
    async version(id: string): Promise<string | null> {
      return remote.file && remote.file.id === id ? remote.file.version : null;
    },
    async download(id: string): Promise<Uint8Array> {
      if (!remote.file || remote.file.id !== id) throw new StorageError(404);
      return remote.file.bytes;
    },
    async create(bytes: Uint8Array): Promise<RemoteFile> {
      rev += 1;
      remote.file = { id: 'remote-1', version: `v${rev}`, bytes };
      return { id: remote.file.id, version: remote.file.version };
    },
    async update(id: string, bytes: Uint8Array, expected: string): Promise<RemoteFile | null> {
      if (remote.conflictOnce) {
        remote.conflictOnce = false;
        return null;
      }
      if (!remote.file || remote.file.id !== id || remote.file.version !== expected) return null;
      rev += 1;
      remote.file = { id, version: `v${rev}`, bytes };
      return { id, version: remote.file.version };
    },
    async trash(id: string): Promise<void> {
      if (remote.file?.id === id) remote.file = null;
    },
    async spaceUsage() {
      return null;
    },
  };
  return remote;
}

