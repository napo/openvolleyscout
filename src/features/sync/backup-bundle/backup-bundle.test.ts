import assert from 'node:assert';
import { test } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { APP_VERSION } from '@src/lib/constants/app';
import { buildOvsBackupBundle, readOvsBackupBundle, reconstructMatchEvents } from './zip-backup-bundle';
import { isUsableAppAsset, printBrandingFromRecords, readAppAssetRecords } from '../../branding/app-asset-records';
import type { ArchivedDataSnapshot, BackupSelection } from './types';

function buildProject(matchId: string, events: MatchEvent[]): MatchProject {
  return {
    metadata: { id: matchId, format: 'best_of_5', schemaVersion: 4 },
    homeTeam: { id: `${matchId}-home`, code: 'HOM', name: `${matchId} Home`, players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: `${matchId}-away`, code: 'AWY', name: `${matchId} Away`, players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: {
      teamId: `${matchId}-home`,
      teamName: `${matchId} Home`,
      source: 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
    },
    awaySelection: {
      teamId: `${matchId}-away`,
      teamName: `${matchId} Away`,
      source: 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
    },
    phase: 'scouting',
    events,
    createdAt: 100,
    updatedAt: 200,
  };
}

const matchAEvents: MatchEvent[] = [
  { id: 'a-evt-0', type: 'match_created', createdAt: 1 },
  {
    id: 'a-evt-1',
    type: 'touch_recorded',
    createdAt: 2,
    touch: {
      id: 'a-touch-1',
      setNumber: 1,
      rallyNumber: 1,
      sequenceNumber: 0,
      teamSide: 'home',
      skill: 'serve',
      createdAt: 2,
    },
  },
];

const matchBEvents: MatchEvent[] = [
  { id: 'b-evt-0', type: 'match_created', createdAt: 10 },
  {
    id: 'b-evt-1',
    type: 'touch_recorded',
    createdAt: 11,
    touch: {
      id: 'b-touch-1',
      setNumber: 1,
      rallyNumber: 1,
      sequenceNumber: 0,
      teamSide: 'away',
      playerId: 'player-1',
      skill: 'attack',
      evaluation: '#',
      createdAt: 11,
    },
  },
  {
    id: 'b-evt-2',
    type: 'point_awarded',
    createdAt: 12,
    setNumber: 1,
    rallyNumber: 1,
    teamSide: 'away',
  },
];

const emptyArchives: ArchivedDataSnapshot = { teams: [], rosters: [], competitions: [] };
const selection: BackupSelection = {};

test('backup bundle round-trip preserves each match\'s own events under a combined touches/events table', () => {
  const projectA = buildProject('match-a', matchAEvents);
  const projectB = buildProject('match-b', matchBEvents);

  const bytes = buildOvsBackupBundle([projectA, projectB], emptyArchives, selection, 'device-1');
  const parsed = readOvsBackupBundle(bytes);

  assert.deepStrictEqual(parsed.manifest.matchIds, ['match-a', 'match-b']);
  assert.strictEqual(parsed.manifest.kind, 'backup');

  const eventsByMatch = reconstructMatchEvents(parsed);
  assert.deepStrictEqual(eventsByMatch['match-a'], matchAEvents);
  assert.deepStrictEqual(eventsByMatch['match-b'], matchBEvents);
});

test('backup bundle records the app version that produced it', () => {
  const parsed = readOvsBackupBundle(buildOvsBackupBundle([buildProject('match-a', matchAEvents)], emptyArchives, {}, 'device-1'));
  assert.strictEqual(parsed.manifest.appVersion, APP_VERSION);
});

test('backup bundle includes each match\'s archived video playlists', () => {
  const project = buildProject('match-a', matchAEvents);
  const playlistArchive = [{
    id: 'playlist-1',
    title: 'Rallies to review',
    createdAt: 300,
    expiresAt: 400,
    parts: ['1.example-payload'],
  }];
  project.videoAnalysis = {
    syncPoints: [],
    starredTouchIds: [],
    sharedPlaylistArchive: playlistArchive,
    paddingBeforeSeconds: 3,
    paddingAfterSeconds: 3,
    updatedAt: 300,
  };

  const parsed = readOvsBackupBundle(buildOvsBackupBundle([project], emptyArchives, {}, 'device-1'));
  assert.deepStrictEqual(parsed.matchMeta['match-a'].videoAnalysis?.sharedPlaylistArchive, playlistArchive);
});

test('backup bundle touches/events tables are combined (one Arrow table across all matches, not one per match)', () => {
  const projectA = buildProject('match-a', matchAEvents);
  const projectB = buildProject('match-b', matchBEvents);

  const bytes = buildOvsBackupBundle([projectA, projectB], emptyArchives, selection, 'device-1');
  const parsed = readOvsBackupBundle(bytes);

  // 1 touch from match-a + 1 touch from match-b
  assert.strictEqual(parsed.touchRows.length, 2);
  assert.deepStrictEqual(parsed.touchRows.map((row) => row.matchId).sort(), ['match-a', 'match-b']);

  // match_created (x2) + point_awarded (x1) across both matches
  assert.strictEqual(parsed.eventRows.length, 3);
});

test('archived data snapshot round-trips when included, and is empty when excluded from the selection', () => {
  const projectA = buildProject('match-a', matchAEvents);
  const archives: ArchivedDataSnapshot = {
    teams: [{ id: 't1', teamCode: 'T1', name: 'Team 1', staff: { headCoach: '', assistantCoach: '' }, rosterIds: [], createdAt: 1, updatedAt: 1 }],
    rosters: [{ id: 'r1', teamId: 't1', players: [] }],
    competitions: [{ id: 'c1', name: 'Cup', createdAt: 1, updatedAt: 1 }],
  };

  const includedBytes = buildOvsBackupBundle([projectA], archives, {}, 'device-1');
  const includedParsed = readOvsBackupBundle(includedBytes);
  assert.deepStrictEqual(includedParsed.archives, { ...archives, opponentReports: [] });

  const excludedBytes = buildOvsBackupBundle([projectA], archives, {
    includeArchivedTeams: false,
    includeArchivedRosters: false,
    includeArchivedCompetitions: false,
  }, 'device-1');
  const excludedParsed = readOvsBackupBundle(excludedBytes);
  assert.deepStrictEqual(excludedParsed.archives, { teams: [], rosters: [], competitions: [], opponentReports: [] });
});

test('a corrupted .ovs backup file throws a recognizable error instead of crashing silently', () => {
  assert.throws(() => readOvsBackupBundle(new Uint8Array([1, 2, 3, 4])), /Invalid \.ovs backup file/);
});

test('carries the reception and defense systems, and older backups read as having none', () => {
  const projectA = buildProject('match-a', matchAEvents);
  const systems = {
    receptionSystems: [{ id: 'reception-1', name: 'P1 a 3 in 4' }],
    defenseSystems: [{ id: 'defense-1', name: 'Break point' }],
  };
  const parsed = readOvsBackupBundle(buildOvsBackupBundle([projectA], emptyArchives, {}, 'device-1', systems));
  assert.equal(parsed.manifest.includesSystems, true);
  assert.deepEqual(parsed.systems, systems);

  const excluded = readOvsBackupBundle(buildOvsBackupBundle([projectA], emptyArchives, { includeSystems: false }, 'device-1', systems));
  assert.equal(excluded.manifest.includesSystems, false);
  assert.deepEqual(excluded.systems, { receptionSystems: [], defenseSystems: [] });

  const legacy = readOvsBackupBundle(buildOvsBackupBundle([projectA], emptyArchives, {}, 'device-1'));
  assert.deepEqual(legacy.systems, { receptionSystems: [], defenseSystems: [] });
});

test('carries opponent reports; a backup without them reads as none', () => {
  const projectA = buildProject('match-a', matchAEvents);
  const opponentReports = [{
    id: 'o1', title: 'Rivals', opponent: { name: 'Rivals' }, matchIds: ['match-a'], notes: 'n', freeTexts: {},
    drawings: [{ id: 'd1', title: 'Cover', note: 'Short serve', court: 'half' as const, orientation: 'vertical' as const, shapes: [{ id: 'a', kind: 'area' as const, x: 20, y: 30, rx: 12, ry: 8 }] }],
    boardPieceIds: ['keys:main', 'copy1', 'extra:d1'],
    pieceCopies: { copy1: 'keys:main' }, pieceEdits: { copy1: { title: 'Manual title', items: ['Custom advice'] } },
    draftCreatedAt: 1, sourceScopeKey: '["League","2026/27"]',
    sheets: [{ id: 'keys' as const, enabled: true }], createdAt: 1, updatedAt: 2,
  }];
  const parsed = readOvsBackupBundle(buildOvsBackupBundle([projectA], { ...emptyArchives, opponentReports }, {}, 'device-1'));
  assert.equal(parsed.manifest.includesOpponentReports, true);
  assert.deepEqual(parsed.archives.opponentReports, opponentReports);

  const excluded = readOvsBackupBundle(buildOvsBackupBundle(
    [projectA], { ...emptyArchives, opponentReports }, { includeOpponentReports: false }, 'device-1',
  ));
  assert.equal(excluded.manifest.includesOpponentReports, false);
  assert.deepEqual(excluded.archives.opponentReports, []);
});

test('carries the print look and the club logo; older backups read as having none', () => {
  const projectA = buildProject('match-a', matchAEvents);
  const logo = 'data:image/png;base64,iVBORw0KGgo=';
  const appAssets = [
    { id: 'printTheme', kind: 'printTheme', value: { id: 'club', club: { primary: '#112233', accent: '#aa5500' } }, updatedAt: '2026-11-27T10:00:00.000Z' },
    { id: 'image:clubLogo', kind: 'image', value: logo, updatedAt: '2026-11-27T10:01:00.000Z' },
  ];
  const parsed = readOvsBackupBundle(buildOvsBackupBundle([projectA], emptyArchives, {}, 'device-1', undefined, appAssets));
  assert.equal(parsed.manifest.includesAppAssets, true);
  assert.deepEqual(parsed.appAssets, appAssets);
  assert.deepEqual(readAppAssetRecords(parsed.appAssets), appAssets);
  assert.deepEqual(printBrandingFromRecords(readAppAssetRecords(parsed.appAssets)), {
    themeChoice: { id: 'club', club: { primary: '#112233', accent: '#aa5500' } },
    logo,
  });

  const excluded = readOvsBackupBundle(buildOvsBackupBundle([projectA], emptyArchives, { includeAppAssets: false }, 'device-1', undefined, appAssets));
  assert.equal(excluded.manifest.includesAppAssets, false);
  assert.deepEqual(excluded.appAssets, []);

  const legacy = readOvsBackupBundle(buildOvsBackupBundle([projectA], emptyArchives, {}, 'device-1'));
  assert.equal(legacy.manifest.includesAppAssets, false);
  assert.deepEqual(legacy.appAssets, []);
  assert.deepEqual(printBrandingFromRecords(readAppAssetRecords(legacy.appAssets)), { themeChoice: null, logo: null });
});

test('reads app assets by their shape only, keeps their values as they are, and uses only valid ones', () => {
  const records = readAppAssetRecords([
    { id: 'printTheme', kind: 'printTheme', value: { id: 'neon', paper: 'cream' }, updatedAt: '2026-11-27T10:00:00.000Z' },
    { id: 'image:clubLogo', kind: 'image', value: 'javascript:alert(1)', updatedAt: '2026-11-27T10:00:00.000Z' },
    { id: 'image:sponsor', kind: 'image', value: 'data:image/jpeg;base64,/9j/4AAQ', updatedAt: 'not a date' },
    { id: 'font:title', kind: 'font', value: 'Inter', updatedAt: '2026-11-27T10:00:00.000Z' },
    { id: '', kind: 'image', value: 'x', updatedAt: '2026-11-27T10:00:00.000Z' },
    null,
    'text',
  ]);
  // A value saved by a later version is not cut down, so this version never writes a trimmed copy back.
  assert.deepEqual(records, [
    { id: 'printTheme', kind: 'printTheme', value: { id: 'neon', paper: 'cream' }, updatedAt: '2026-11-27T10:00:00.000Z' },
    { id: 'image:clubLogo', kind: 'image', value: 'javascript:alert(1)', updatedAt: '2026-11-27T10:00:00.000Z' },
    { id: 'font:title', kind: 'font', value: 'Inter', updatedAt: '2026-11-27T10:00:00.000Z' },
  ]);
  // Printed documents and backup restores use only what this version can read.
  assert.deepEqual(printBrandingFromRecords(records), { themeChoice: null, logo: null });
  assert.deepEqual(records.map(isUsableAppAsset), [false, false, true]);
  assert.equal(isUsableAppAsset({ id: 'printTheme', kind: 'printTheme', value: { id: 'ovs', extra: 1 }, updatedAt: '2026-11-27T10:00:00.000Z' }), true);
  assert.equal(isUsableAppAsset({ id: 'image:clubLogo', kind: 'image', value: 'data:image/png;base64,iVBORw0KGgo=', updatedAt: '2026-11-27T10:00:00.000Z' }), true);
  assert.deepEqual(readAppAssetRecords({ not: 'a list' }), []);
});
