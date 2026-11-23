import Dexie, { Table } from 'dexie';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedTeam, ArchivedRoster } from '@src/domain/team/types';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import type { OpponentReport } from '@src/domain/opponent-report/types';
import type { MatchSyncStateRecord } from './match-sync-state-types';
import type { ArchiveSyncStateRecord } from './archive-sync-state-types';
import type { MatchSummaryRecord } from './match-summary-types';

export interface MatchProjectRecord extends MatchProject {}
export interface ArchivedTeamRecord extends ArchivedTeam {}
export interface ArchivedRosterRecord extends ArchivedRoster {}
export interface CompetitionArchiveRecord extends CompetitionArchiveEntry {}
export interface OpponentReportRecord extends OpponentReport {}
export type { MatchSyncStateRecord };
export type { ArchiveSyncStateRecord };
export type { MatchSummaryRecord };

/** A deletion remembered for cloud sync, keyed by `${collection}:${id}`. */
export interface SyncDeletionRecord {
  key: string;
  collection: string;
  id: string;
  deletedAt: string;
}

/** Cloud sync state (remote file id, base stamps, provider...). */
export interface SyncMetaRecord {
  key: string;
  value: unknown;
}

/** A reception or defense system, keyed by `${kind}:${block.id}`. */
export interface SystemBlockRecord {
  key: string;
  kind: 'receptionSystems' | 'defenseSystems';
  block: { id: string; [field: string]: unknown };
}

/** localStorage keys used before version 8 moved them into the database. */
export const LEGACY_STORAGE_KEYS = {
  syncMetaPrefix: 'openvolleyscout.cloudSync.',
  receptionSystems: 'openvolleyscout.receptionSystemBlocks',
  defenseSystems: 'openvolleyscout.defenseSystemBlocks',
} as const;

function readLegacyJson(key: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export class MatchProjectDatabase extends Dexie {
  matchProjects!: Table<MatchProjectRecord, string>;
  matchSummaries!: Table<MatchSummaryRecord, string>;
  archivedTeams!: Table<ArchivedTeamRecord, string>;
  archivedRosters!: Table<ArchivedRosterRecord, string>;
  archivedCompetitions!: Table<CompetitionArchiveRecord, string>;
  matchSyncState!: Table<MatchSyncStateRecord, string>;
  archiveSyncState!: Table<ArchiveSyncStateRecord, string>;
  opponentReports!: Table<OpponentReportRecord, string>;
  syncDeletions!: Table<SyncDeletionRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;
  systemBlocks!: Table<SystemBlockRecord, string>;

  constructor() {
    super('OpenVolleyScoutDatabase');

    this.version(3).stores({
      matchProjects: 'metadata.id, updatedAt',
      archivedTeams: 'id, name, updatedAt',
      archivedRosters: 'id, teamId',
      archivedCompetitions: 'id, name, updatedAt',
    });

    this.version(4).stores({
      matchProjects: 'metadata.id, updatedAt',
      archivedTeams: 'id, name, updatedAt',
      archivedRosters: 'id, teamId',
      archivedCompetitions: 'id, name, updatedAt',
      matchSyncState: 'id, matchId, peerDeviceId',
    });

    this.version(5).stores({
      matchProjects: 'metadata.id, updatedAt',
      archivedTeams: 'id, name, updatedAt',
      archivedRosters: 'id, teamId',
      archivedCompetitions: 'id, name, updatedAt',
      matchSyncState: 'id, matchId, peerDeviceId',
      archiveSyncState: 'id, peerDeviceId',
    });

    this.version(6).stores({
      matchProjects: 'metadata.id, updatedAt',
      archivedTeams: 'id, name, updatedAt',
      archivedRosters: 'id, teamId',
      archivedCompetitions: 'id, name, updatedAt',
      matchSyncState: 'id, matchId, peerDeviceId',
      archiveSyncState: 'id, peerDeviceId',
      opponentReports: 'id, updatedAt',
    });

    this.version(7).stores({
      matchProjects: 'metadata.id, updatedAt',
      matchSummaries: 'id, updatedAt, playedAt, homeTeamId, awayTeamId',
      archivedTeams: 'id, name, updatedAt',
      archivedRosters: 'id, teamId',
      archivedCompetitions: 'id, name, updatedAt',
      matchSyncState: 'id, matchId, peerDeviceId',
      archiveSyncState: 'id, peerDeviceId',
      opponentReports: 'id, updatedAt',
    });

    // Cloud sync keeps its deletions and state next to the data, so a deletion
    // and its tombstone are written together; systems move here from localStorage.
    this.version(8).stores({
      matchProjects: 'metadata.id, updatedAt',
      matchSummaries: 'id, updatedAt, playedAt, homeTeamId, awayTeamId',
      archivedTeams: 'id, name, updatedAt',
      archivedRosters: 'id, teamId',
      archivedCompetitions: 'id, name, updatedAt',
      matchSyncState: 'id, matchId, peerDeviceId',
      archiveSyncState: 'id, peerDeviceId',
      opponentReports: 'id, updatedAt',
      syncDeletions: 'key',
      syncMeta: 'key',
      systemBlocks: 'key, kind',
    }).upgrade(async (tx) => {
      const prefix = LEGACY_STORAGE_KEYS.syncMetaPrefix;
      for (const name of ['sync.enabled', 'sync.base', 'sync.fileId', 'sync.lastSyncedAt', 'sync.provider']) {
        const value = readLegacyJson(`${prefix}${name}`);
        if (value !== null) await tx.table('syncMeta').put({ key: name, value });
      }
      const deletions = readLegacyJson(`${prefix}sync.deletions`);
      if (deletions && typeof deletions === 'object' && !Array.isArray(deletions)) {
        for (const [key, deletedAt] of Object.entries(deletions as Record<string, unknown>)) {
          const split = key.indexOf(':');
          if (split > 0 && typeof deletedAt === 'string') {
            await tx.table('syncDeletions').put({ key, collection: key.slice(0, split), id: key.slice(split + 1), deletedAt });
          }
        }
      }
      for (const kind of ['receptionSystems', 'defenseSystems'] as const) {
        const blocks = readLegacyJson(LEGACY_STORAGE_KEYS[kind]);
        if (!Array.isArray(blocks)) continue;
        for (const block of blocks) {
          if (block && typeof block === 'object' && typeof (block as { id?: unknown }).id === 'string') {
            await tx.table('systemBlocks').put({ key: `${kind}:${(block as { id: string }).id}`, kind, block });
          }
        }
      }
    });
  }
}

export const matchProjectDb = new MatchProjectDatabase();
