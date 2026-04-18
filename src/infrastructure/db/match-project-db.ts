import Dexie, { Table } from 'dexie';
import type { MatchProject } from '@src/domain/match/types';

export interface MatchProjectRecord extends MatchProject {}

export class MatchProjectDatabase extends Dexie {
  matchProjects!: Table<MatchProjectRecord, string>;

  constructor() {
    super('OpenVolleyScoutDatabase');

    this.version(1).stores({
      matchProjects: 'id, updatedAt',
    });
  }
}

export const matchProjectDb = new MatchProjectDatabase();
