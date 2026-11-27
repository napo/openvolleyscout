// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Connects the local database to `CloudSyncController` / `synchronise()`.
 * The snapshot is read, and a round's changes are written, each in a single
 * IndexedDB transaction together with the deletions and the sync state, so a
 * change made on this device while a round runs is never overwritten: its
 * stamp no longer matches the one read, and the next round passes it on.
 */

import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { buildMatchSummary, loadStoredProject } from '@src/infrastructure/storage/match-project-storage';
import { useDefenseSystemStore, useReceptionSystemStore } from '@src/features/systems/model';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems/types';
import { refreshPrintBrandingFromDatabase } from '@src/features/branding/print-branding';
import type { AppAssetRecord } from '@src/infrastructure/db/match-project-db';
import { CloudSyncController } from './controller';
import type { CloudSyncArchive } from './engine';
import { notifyLocalDataChanged } from './local-change-bus';
import {
  type CloudCollection,
  type CloudSnapshot,
  type CloudSystemRecord,
  type DeletionMap,
  type SnapshotDiff,
  keyOf,
  recordStamp,
} from './merge';

const SYNC_TABLES = () => [
  matchProjectDb.matchProjects,
  matchProjectDb.matchSummaries,
  matchProjectDb.archivedTeams,
  matchProjectDb.archivedRosters,
  matchProjectDb.archivedCompetitions,
  matchProjectDb.opponentReports,
  matchProjectDb.systemBlocks,
  matchProjectDb.appAssets,
  matchProjectDb.syncDeletions,
];

/** Table holding each collection, and how to find a record in it by id. */
async function readRecord(collection: CloudCollection, id: string): Promise<unknown> {
  switch (collection) {
    case 'matches': return matchProjectDb.matchProjects.get(id);
    case 'teams': return matchProjectDb.archivedTeams.get(id);
    case 'rosters': return matchProjectDb.archivedRosters.get(id);
    case 'competitions': return matchProjectDb.archivedCompetitions.get(id);
    case 'opponentReports': return matchProjectDb.opponentReports.get(id);
    case 'receptionSystems':
    case 'defenseSystems':
      return (await matchProjectDb.systemBlocks.get(keyOf(collection, id)))?.block;
    case 'appAssets': return matchProjectDb.appAssets.get(id);
  }
}

async function writeRecord(collection: CloudCollection, record: unknown): Promise<void> {
  switch (collection) {
    case 'matches': {
      const match = normalizeMatchProject(record as MatchProject);
      await matchProjectDb.matchProjects.put(match);
      await matchProjectDb.matchSummaries.put(buildMatchSummary(match));
      return;
    }
    case 'teams': await matchProjectDb.archivedTeams.put(record as never); return;
    case 'rosters': await matchProjectDb.archivedRosters.put(record as never); return;
    case 'competitions': await matchProjectDb.archivedCompetitions.put(record as never); return;
    case 'opponentReports': await matchProjectDb.opponentReports.put(record as never); return;
    case 'receptionSystems':
    case 'defenseSystems': {
      const block = record as CloudSystemRecord;
      await matchProjectDb.systemBlocks.put({ key: keyOf(collection, block.id), kind: collection, block });
      return;
    }
    case 'appAssets': {
      const asset = record as AppAssetRecord;
      await matchProjectDb.appAssets.put({ id: asset.id, kind: asset.kind, value: asset.value, updatedAt: asset.updatedAt });
    }
  }
}

async function deleteRecord(collection: CloudCollection, id: string): Promise<void> {
  switch (collection) {
    case 'matches':
      await matchProjectDb.matchProjects.delete(id);
      await matchProjectDb.matchSummaries.delete(id);
      return;
    case 'teams': await matchProjectDb.archivedTeams.delete(id); return;
    case 'rosters': await matchProjectDb.archivedRosters.delete(id); return;
    case 'competitions': await matchProjectDb.archivedCompetitions.delete(id); return;
    case 'opponentReports': await matchProjectDb.opponentReports.delete(id); return;
    case 'receptionSystems':
    case 'defenseSystems':
      await matchProjectDb.systemBlocks.delete(keyOf(collection, id));
      return;
    case 'appAssets': await matchProjectDb.appAssets.delete(id);
  }
}

/** The stamp of a record on this device now, as `snapshotStamps` computes it. */
async function currentStamp(collection: CloudCollection, id: string): Promise<string | null> {
  const record = await readRecord(collection, id);
  if (record) return recordStamp(collection, record);
  const deletion = await matchProjectDb.syncDeletions.get(keyOf(collection, id));
  return deletion ? `del:${deletion.deletedAt}` : null;
}

const PUTS: [CloudCollection, (diff: SnapshotDiff) => readonly unknown[], (record: never) => string][] = [
  ['matches', (d) => d.putMatches, (m: MatchProject) => m.metadata.id],
  ['teams', (d) => d.putTeams, (r: { id: string }) => r.id],
  ['rosters', (d) => d.putRosters, (r: { id: string }) => r.id],
  ['competitions', (d) => d.putCompetitions, (r: { id: string }) => r.id],
  ['opponentReports', (d) => d.putOpponentReports, (r: { id: string }) => r.id],
  ['receptionSystems', (d) => d.putReceptionSystems, (r: { id: string }) => r.id],
  ['defenseSystems', (d) => d.putDefenseSystems, (r: { id: string }) => r.id],
  ['appAssets', (d) => d.putAppAssets, (r: { id: string }) => r.id],
];

async function refreshSystemStores(): Promise<void> {
  const rows = await matchProjectDb.systemBlocks.toArray();
  const of = (kind: CloudCollection) => rows.filter((row) => row.kind === kind).map((row) => row.block);
  useReceptionSystemStore.getState().replaceReceptionSystemBlocks(of('receptionSystems') as unknown as ReceptionSystemBlock[]);
  useDefenseSystemStore.getState().replaceDefenseSystemBlocks(of('defenseSystems') as unknown as DefenseSystemBlock[]);
}

export function createLiveCloudSyncArchive(): CloudSyncArchive {
  return {
    async getMeta<T>(key: string): Promise<T | null> {
      return ((await matchProjectDb.syncMeta.get(key))?.value as T | undefined) ?? null;
    },

    async setMeta(key: string, value: unknown): Promise<void> {
      if (value === null || value === undefined) await matchProjectDb.syncMeta.delete(key);
      else await matchProjectDb.syncMeta.put({ key, value });
    },

    async snapshot(): Promise<CloudSnapshot> {
      return matchProjectDb.transaction('r', SYNC_TABLES(), async () => {
        const [matches, teams, rosters, competitions, opponentReports, systems, appAssets, deletionRows] = await Promise.all([
          matchProjectDb.matchProjects.toArray(),
          matchProjectDb.archivedTeams.toArray(),
          matchProjectDb.archivedRosters.toArray(),
          matchProjectDb.archivedCompetitions.toArray(),
          matchProjectDb.opponentReports.toArray(),
          matchProjectDb.systemBlocks.toArray(),
          matchProjectDb.appAssets.toArray(),
          matchProjectDb.syncDeletions.toArray(),
        ]);
        const deletions: DeletionMap = {};
        for (const row of deletionRows) deletions[row.key] = row.deletedAt;
        return {
          matches: matches.map((match) => loadStoredProject(match)),
          teams,
          rosters,
          competitions,
          opponentReports,
          receptionSystems: systems.filter((row) => row.kind === 'receptionSystems').map((row) => row.block),
          defenseSystems: systems.filter((row) => row.kind === 'defenseSystems').map((row) => row.block),
          appAssets,
          deletions,
        };
      });
    },

    async applySync(diff: SnapshotDiff, read: ReadonlyMap<string, string>): Promise<number> {
      let systemsChanged = false;
      let appAssetsChanged = false;
      const written = await matchProjectDb.transaction('rw', SYNC_TABLES(), async () => {
        let count = 0;
        /** Records this round already wrote or deleted: their stamp changed because of it. */
        const applied = new Set<string>();
        const unchangedHere = async (collection: CloudCollection, id: string) =>
          (await currentStamp(collection, id)) === (read.get(keyOf(collection, id)) ?? null);

        for (const [collection, items, idOf] of PUTS) {
          for (const record of items(diff)) {
            const id = idOf(record as never);
            if (!(await unchangedHere(collection, id))) continue;
            await writeRecord(collection, record);
            await matchProjectDb.syncDeletions.delete(keyOf(collection, id));
            applied.add(keyOf(collection, id));
            if (collection === 'receptionSystems' || collection === 'defenseSystems') systemsChanged = true;
            if (collection === 'appAssets') appAssetsChanged = true;
            count += 1;
          }
        }

        for (const [collection, ids] of Object.entries(diff.deleteIds) as [CloudCollection, string[]][]) {
          for (const id of ids) {
            if (!(await unchangedHere(collection, id))) continue;
            await deleteRecord(collection, id);
            applied.add(keyOf(collection, id));
            if (collection === 'receptionSystems' || collection === 'defenseSystems') systemsChanged = true;
            if (collection === 'appAssets') appAssetsChanged = true;
            count += 1;
          }
        }

        // Deletions: take the merged ones, drop those the merge forgot, but only
        // where this device did not change the record after the snapshot.
        const rows = await matchProjectDb.syncDeletions.toArray();
        const keys = new Set([...rows.map((row) => row.key), ...Object.keys(diff.deletions)]);
        for (const key of keys) {
          const split = key.indexOf(':');
          const collection = key.slice(0, split) as CloudCollection;
          const id = key.slice(split + 1);
          if (!applied.has(key) && !(await unchangedHere(collection, id))) continue;
          const deletedAt = diff.deletions[key];
          if (deletedAt) await matchProjectDb.syncDeletions.put({ key, collection, id, deletedAt });
          else await matchProjectDb.syncDeletions.delete(key);
        }
        return count;
      });
      if (systemsChanged) await refreshSystemStores();
      if (appAssetsChanged) await refreshPrintBrandingFromDatabase();
      if (written > 0) notifyLocalDataChanged('sync');
      return written;
    },
  };
}

export const cloudSyncController = new CloudSyncController(createLiveCloudSyncArchive());
