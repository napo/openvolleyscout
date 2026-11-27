// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const VERSION_9_SCHEMA = {
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
};

describe('database version 10', () => {
  it('copies the print look and the club logo kept in localStorage into the database', async () => {
    await Dexie.delete('OpenVolleyScoutDatabase');
    const old = new Dexie('OpenVolleyScoutDatabase');
    old.version(9).stores(VERSION_9_SCHEMA);
    await old.open();
    old.close();

    window.localStorage.setItem('openvolleyscout.printTheme', JSON.stringify({ id: 'club', club: { primary: '#112233', accent: '#aa5500' }, extra: 1 }));
    window.localStorage.setItem('openvolleyscout.printLogo', LOGO);

    const { matchProjectDb } = await import('./match-project-db');
    await matchProjectDb.open();
    const rows = await matchProjectDb.appAssets.toArray();
    expect(rows.map(({ id, kind, value }) => ({ id, kind, value }))).toEqual([
      { id: 'image:clubLogo', kind: 'image', value: LOGO },
      { id: 'printTheme', kind: 'printTheme', value: { id: 'club', club: { primary: '#112233', accent: '#aa5500' } } },
    ]);
    // Dated at the oldest time, so a change or a deletion made on another device wins in cloud sync.
    expect(rows.every((row) => row.updatedAt === new Date(0).toISOString())).toBe(true);
    matchProjectDb.close();
  });

  it('copies nothing that is not a valid look or logo', async () => {
    const { readLegacyAppAssets } = await import('./match-project-db');
    window.localStorage.setItem('openvolleyscout.printTheme', '{"id":"neon"}');
    window.localStorage.setItem('openvolleyscout.printLogo', 'data:text/html;base64,PGI+');
    expect(readLegacyAppAssets()).toEqual([]);
    window.localStorage.clear();
    expect(readLegacyAppAssets()).toEqual([]);
  });
});
