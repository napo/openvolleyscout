import assert from 'node:assert';
import { test } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { buildOvsBackupBundle, readOvsBackupBundle, reconstructMatchEvents } from './zip-backup-bundle';
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
  assert.deepStrictEqual(includedParsed.archives, archives);

  const excludedBytes = buildOvsBackupBundle([projectA], archives, {
    includeArchivedTeams: false,
    includeArchivedRosters: false,
    includeArchivedCompetitions: false,
  }, 'device-1');
  const excludedParsed = readOvsBackupBundle(excludedBytes);
  assert.deepStrictEqual(excludedParsed.archives, { teams: [], rosters: [], competitions: [] });
});

test('a corrupted .ovs backup file throws a recognizable error instead of crashing silently', () => {
  assert.throws(() => readOvsBackupBundle(new Uint8Array([1, 2, 3, 4])), /Invalid \.ovs backup file/);
});
