// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Reads and writes the photos of the athletes among the app assets of the
 * database, so they are saved, backed up and synced with the rest of the data
 * (cloud sync and backups already carry every app asset). Each change tells
 * cloud sync that the data changed.
 */

import { notifyLocalDataChanged } from '@src/features/sync/cloud/local-change-bus';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { deleteAppAsset, deleteAppAssets, putAppAsset } from '@src/infrastructure/storage/app-asset-storage';
import { athletePhotoAssetId, isAthletePhoto } from './athlete-photos';

/** The stored photos of these archived athletes, by archived player id (athletes with no photo are left out). */
export async function loadAthletePhotos(archivedPlayerIds: Iterable<string>): Promise<Map<string, string>> {
  const ids = [...new Set(archivedPlayerIds)].filter(Boolean);
  const photos = new Map<string, string>();
  if (ids.length === 0) return photos;
  const records = await matchProjectDb.appAssets.bulkGet(ids.map(athletePhotoAssetId));
  records.forEach((record, index) => {
    if (record && record.kind === 'image' && isAthletePhoto(record.value)) photos.set(ids[index], record.value);
  });
  return photos;
}

/** The stored photo of one archived athlete, or null. */
export async function loadAthletePhoto(archivedPlayerId: string): Promise<string | null> {
  return (await loadAthletePhotos([archivedPlayerId])).get(archivedPlayerId) ?? null;
}

async function writePhoto(archivedPlayerId: string, dataUrl: string | null): Promise<boolean> {
  if (!archivedPlayerId) throw new Error('An athlete photo needs the id of the athlete');
  if (dataUrl === null) return deleteAppAsset(athletePhotoAssetId(archivedPlayerId));
  if (!isAthletePhoto(dataUrl)) throw new Error('Not an athlete photo: a PNG or JPEG data URL is expected');
  return putAppAsset({ id: athletePhotoAssetId(archivedPlayerId), kind: 'image', value: dataUrl });
}

/**
 * Saves (or, with null, removes) the photo of an archived athlete. Rejects a
 * value that is not a stored photo (see `isAthletePhoto`). Returns whether
 * anything changed.
 */
export async function saveAthletePhoto(archivedPlayerId: string, dataUrl: string | null): Promise<boolean> {
  const changed = await writePhoto(archivedPlayerId, dataUrl);
  if (changed) notifyLocalDataChanged();
  return changed;
}

/** Removes the photo of an archived athlete. Returns whether there was one. */
export async function removeAthletePhoto(archivedPlayerId: string): Promise<boolean> {
  return saveAthletePhoto(archivedPlayerId, null);
}

/** Removes the photos of several athletes (a deleted team, the athletes taken off a roster). Returns how many. */
export async function removeAthletePhotos(archivedPlayerIds: Iterable<string>): Promise<number> {
  const removed = await deleteAppAssets([...archivedPlayerIds].filter(Boolean).map(athletePhotoAssetId));
  if (removed > 0) notifyLocalDataChanged();
  return removed;
}

/**
 * Writes the photo changes made in a roster, by archived player id (a data URL
 * to save, null to remove), with one notice to cloud sync at the end. Every
 * value is checked before anything is written. Returns how many changed.
 */
export async function saveAthletePhotoChanges(changes: ReadonlyMap<string, string | null>): Promise<number> {
  for (const [id, value] of changes) {
    if (!id) throw new Error('An athlete photo needs the id of the athlete');
    if (value !== null && !isAthletePhoto(value)) throw new Error('Not an athlete photo: a PNG or JPEG data URL is expected');
  }
  let changed = 0;
  for (const [id, value] of changes) {
    if (await writePhoto(id, value)) changed += 1;
  }
  if (changed > 0) notifyLocalDataChanged();
  return changed;
}
