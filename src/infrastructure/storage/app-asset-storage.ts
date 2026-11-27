// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The print look and the images of the app (the club logo) in the database,
 * where backups and cloud sync read and write them with the rest of the data.
 * A deletion leaves a deletion for cloud sync, written in the same transaction.
 */

import { matchProjectDb, type AppAssetRecord } from '../db/match-project-db';
import { forgetDeletion, rememberDeletion, syncKey } from './sync-deletions';

const time = (value: string | undefined): number => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function loadAppAssets(): Promise<AppAssetRecord[]> {
  return matchProjectDb.appAssets.toArray();
}

/**
 * Saves a value with a fresh `updatedAt`, always later than the one it
 * replaces (so a device whose clock is behind still wins with its newer
 * change). Saving the same value again changes nothing. Returns whether it wrote.
 */
export async function putAppAsset(
  record: Pick<AppAssetRecord, 'id' | 'kind' | 'value'>,
  now: Date = new Date(),
): Promise<boolean> {
  return matchProjectDb.transaction('rw', matchProjectDb.appAssets, matchProjectDb.syncDeletions, async () => {
    const existing = await matchProjectDb.appAssets.get(record.id);
    const value = JSON.parse(JSON.stringify(record.value)) as unknown;
    if (existing && existing.kind === record.kind && JSON.stringify(existing.value) === JSON.stringify(value)) return false;
    const updatedAt = new Date(Math.max(now.getTime(), existing ? time(existing.updatedAt) + 1 : 0)).toISOString();
    await matchProjectDb.appAssets.put({ id: record.id, kind: record.kind, value, updatedAt });
    await forgetDeletion('appAssets', record.id);
    return true;
  });
}

/** Deletes a value and remembers the deletion for cloud sync. Returns whether there was one. */
export async function deleteAppAsset(id: string, now: Date = new Date()): Promise<boolean> {
  return matchProjectDb.transaction('rw', matchProjectDb.appAssets, matchProjectDb.syncDeletions, async () => {
    const existing = await matchProjectDb.appAssets.get(id);
    if (!existing) return false;
    await matchProjectDb.appAssets.delete(id);
    await rememberDeletion('appAssets', id, new Date(Math.max(now.getTime(), time(existing.updatedAt) + 1)).toISOString());
    return true;
  });
}

/** Whether `record` (from a backup) holds another value than the one here (or there is none here). */
export async function differsFromLocalAppAsset(record: Pick<AppAssetRecord, 'id' | 'kind' | 'value'>): Promise<boolean> {
  const existing = await matchProjectDb.appAssets.get(record.id);
  return !existing || existing.kind !== record.kind || JSON.stringify(existing.value) !== JSON.stringify(record.value);
}

/**
 * Restores values from a backup the user chose to import: each one that
 * differs from the value here takes its place, also when the value here was
 * changed or removed after the backup was made (that is what a restore is
 * for). It is saved as a new change, dated now, so cloud sync passes it on to
 * the other devices. Returns how many were written.
 */
export async function restoreAppAssets(
  records: readonly Pick<AppAssetRecord, 'id' | 'kind' | 'value'>[],
  now: Date = new Date(),
): Promise<number> {
  let written = 0;
  for (const record of records) {
    if (await putAppAsset({ id: record.id, kind: record.kind, value: record.value }, now)) written += 1;
  }
  return written;
}

/**
 * Copies a value this browser kept outside the database (from before the
 * database held it) into the database, only when the database has no value
 * and no deletion for it. It is dated `updatedAt` (a very old time), so any
 * real change or deletion made on another device wins over it in cloud sync.
 * Returns whether it wrote.
 */
export async function adoptLegacyAppAsset(
  record: Pick<AppAssetRecord, 'id' | 'kind' | 'value'>,
  updatedAt: string,
): Promise<boolean> {
  return matchProjectDb.transaction('rw', matchProjectDb.appAssets, matchProjectDb.syncDeletions, async () => {
    const [existing, deletion] = await Promise.all([
      matchProjectDb.appAssets.get(record.id),
      matchProjectDb.syncDeletions.get(syncKey('appAssets', record.id)),
    ]);
    if (existing || deletion) return false;
    await matchProjectDb.appAssets.put({ id: record.id, kind: record.kind, value: record.value, updatedAt });
    return true;
  });
}
