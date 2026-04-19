import Dexie, { Table } from 'dexie';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedTeam, ArchivedRoster } from '@src/domain/team/types';

export interface MatchProjectRecord extends MatchProject {}
export interface ArchivedTeamRecord extends ArchivedTeam {}
export interface ArchivedRosterRecord extends ArchivedRoster {}

export class MatchProjectDatabase extends Dexie {
  matchProjects!: Table<MatchProjectRecord, string>;
  archivedTeams!: Table<ArchivedTeamRecord, string>;
  archivedRosters!: Table<ArchivedRosterRecord, string>;

  constructor() {
    super('OpenVolleyScoutDatabase');

    this.version(2).stores({
      matchProjects: 'metadata.id, updatedAt',
      archivedTeams: '++, name, updatedAt',
      archivedRosters: '++, teamId',
    });
  }
}

export const matchProjectDb = new MatchProjectDatabase();
