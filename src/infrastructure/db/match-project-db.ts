import Dexie, { Table } from 'dexie';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedTeam, ArchivedRoster } from '@src/domain/team/types';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import type { MatchSyncStateRecord } from './match-sync-state-types';
import type { ArchiveSyncStateRecord } from './archive-sync-state-types';

export interface MatchProjectRecord extends MatchProject {}
export interface ArchivedTeamRecord extends ArchivedTeam {}
export interface ArchivedRosterRecord extends ArchivedRoster {}
export interface CompetitionArchiveRecord extends CompetitionArchiveEntry {}
export type { MatchSyncStateRecord };
export type { ArchiveSyncStateRecord };

export class MatchProjectDatabase extends Dexie {
  matchProjects!: Table<MatchProjectRecord, string>;
  archivedTeams!: Table<ArchivedTeamRecord, string>;
  archivedRosters!: Table<ArchivedRosterRecord, string>;
  archivedCompetitions!: Table<CompetitionArchiveRecord, string>;
  matchSyncState!: Table<MatchSyncStateRecord, string>;
  archiveSyncState!: Table<ArchiveSyncStateRecord, string>;

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
  }
}

export const matchProjectDb = new MatchProjectDatabase();
