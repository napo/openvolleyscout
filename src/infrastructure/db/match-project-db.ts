import Dexie, { Table } from 'dexie';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedTeam, ArchivedRoster } from '@src/domain/team/types';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';

export interface MatchProjectRecord extends MatchProject {}
export interface ArchivedTeamRecord extends ArchivedTeam {}
export interface ArchivedRosterRecord extends ArchivedRoster {}
export interface CompetitionArchiveRecord extends CompetitionArchiveEntry {}

export class MatchProjectDatabase extends Dexie {
  matchProjects!: Table<MatchProjectRecord, string>;
  archivedTeams!: Table<ArchivedTeamRecord, string>;
  archivedRosters!: Table<ArchivedRosterRecord, string>;
  archivedCompetitions!: Table<CompetitionArchiveRecord, string>;

  constructor() {
    super('OpenVolleyScoutDatabase');

    this.version(3).stores({
      matchProjects: 'metadata.id, updatedAt',
      archivedTeams: 'id, name, updatedAt',
      archivedRosters: 'id, teamId',
      archivedCompetitions: 'id, name, updatedAt',
    });
  }
}

export const matchProjectDb = new MatchProjectDatabase();
