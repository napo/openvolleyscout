// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Deletions remembered for cloud sync. They are written in the same
 * transaction as the deletion itself (the caller's Dexie transaction must
 * include `syncDeletions`), so no deletion can be lost between the two.
 */

import { matchProjectDb } from '../db/match-project-db';

export type SyncCollection =
  | 'matches'
  | 'teams'
  | 'rosters'
  | 'competitions'
  | 'opponentReports'
  | 'receptionSystems'
  | 'defenseSystems';

export const syncKey = (collection: SyncCollection, id: string) => `${collection}:${id}`;

export async function rememberDeletion(collection: SyncCollection, id: string, deletedAt = new Date().toISOString()) {
  await matchProjectDb.syncDeletions.put({ key: syncKey(collection, id), collection, id, deletedAt });
}

export async function forgetDeletion(collection: SyncCollection, id: string) {
  await matchProjectDb.syncDeletions.delete(syncKey(collection, id));
}
