import assert from 'node:assert';
import { test } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { exportMatchToOvsBundle, parseOvsBundleFile } from './index';
import { flattenTouchEvents, unflattenTouchRows } from './serializer/touches-flatten';
import { flattenNonTouchEvents, unflattenEventRows } from './serializer/events-flatten';
import { decodeEventsTable, decodeTouchesTable, encodeEventsTable, encodeTouchesTable } from './serializer/arrow-codec';

const sparseTouchEvent: MatchEvent = {
  id: 'evt-1',
  type: 'touch_recorded',
  createdAt: 1700000000000,
  touch: {
    id: 'touch-1',
    setNumber: 1,
    rallyNumber: 3,
    sequenceNumber: 0,
    teamSide: 'home',
    skill: 'serve',
    createdAt: 1700000000000,
  },
};

const richTouchEvent: MatchEvent = {
  id: 'evt-2',
  type: 'touch_recorded',
  createdAt: 1700000001000,
  touch: {
    id: 'touch-2',
    setNumber: 1,
    rallyNumber: 3,
    sequenceNumber: 1,
    teamSide: 'away',
    playerId: 'player-9',
    skill: 'attack',
    evaluation: '#',
    zone: { teamSide: 'away', zoneId: 'away-r1c1' },
    direction: { start: { teamSide: 'away', zoneId: 'away-r1c1' } },
    advancedDetails: { attack: { tempo: 'first_tempo', type: 'power' } },
    combinationCode: 'X5',
    createdAt: 1700000001000,
    videoTimeSeconds: 12.5,
    numBlockers: 2,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  },
  location: { teamSide: 'away', zoneId: 'away-r1c1' },
};

test('touches round-trip through flatten/unflatten (sparse and rich)', () => {
  const rows = flattenTouchEvents([sparseTouchEvent, richTouchEvent]);
  assert.strictEqual(rows.length, 2);

  const events = unflattenTouchRows(rows).map(({ sequenceIndex: _s, ...event }) => event);
  assert.deepStrictEqual(events[0], sparseTouchEvent);
  assert.deepStrictEqual(events[1], richTouchEvent);
});

test('touches round-trip through Arrow encode/decode', () => {
  const rows = flattenTouchEvents([sparseTouchEvent, richTouchEvent]);
  const bytes = encodeTouchesTable(rows);
  const decoded = decodeTouchesTable(bytes);
  assert.deepStrictEqual(decoded, rows);
});

const nonTouchEvents: MatchEvent[] = [
  { id: 'evt-0', type: 'match_created', createdAt: 1 },
  {
    id: 'evt-3',
    type: 'set_started',
    setNumber: 1,
    createdAt: 2,
    homeLineup: { 1: 'p1', 2: 'p2', 3: 'p3', 4: 'p4', 5: 'p5', 6: 'p6' } as never,
    awayLineup: { 1: 'p7', 2: 'p8', 3: 'p9', 4: 'p10', 5: 'p11', 6: 'p12' } as never,
    servingTeam: 'home',
  },
  {
    id: 'evt-4',
    type: 'point_awarded',
    createdAt: 3,
    setNumber: 1,
    rallyNumber: 1,
    teamSide: 'home',
  },
  { id: 'evt-5', type: 'set_ended', setNumber: 1, createdAt: 4, winningTeam: 'home', homeScore: 25, awayScore: 20 },
];

test('non-touch events round-trip through flatten/unflatten', () => {
  const rows = flattenNonTouchEvents(nonTouchEvents);
  assert.strictEqual(rows.length, nonTouchEvents.length);

  const events = unflattenEventRows(rows).map(({ sequenceIndex: _s, ...event }) => event);
  assert.deepStrictEqual(events, nonTouchEvents);
});

test('non-touch events round-trip through Arrow encode/decode', () => {
  const rows = flattenNonTouchEvents(nonTouchEvents);
  const bytes = encodeEventsTable(rows);
  const decoded = decodeEventsTable(bytes);
  assert.deepStrictEqual(decoded, rows);
});

test('schema evolution: decoding fewer columns than the current schema does not throw', () => {
  // Simulate an older bundle whose touches table never had `advancedDetailsJson`.
  const rows = flattenTouchEvents([sparseTouchEvent]);
  const bytes = encodeTouchesTable(rows);
  assert.doesNotThrow(() => decodeTouchesTable(bytes));
});

test('full bundle round-trip: export then parse reconstructs the match project shape', () => {
  const project: MatchProject = {
    metadata: { id: 'match-1', format: 'best_of_5', schemaVersion: 4 },
    homeTeam: { id: 'home-team', code: 'HOM', name: 'Home', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'away-team', code: 'AWY', name: 'Away', players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: {
      teamId: 'home-team',
      teamName: 'Home',
      source: 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
    },
    awaySelection: {
      teamId: 'away-team',
      teamName: 'Away',
      source: 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
    },
    phase: 'scouting',
    events: [sparseTouchEvent, richTouchEvent, ...nonTouchEvents],
    createdAt: 100,
    updatedAt: 200,
  };

  const { bytes, fileName } = exportMatchToOvsBundle(project);
  assert.ok(fileName.endsWith('.ovs'));

  const parsed = parseOvsBundleFile(bytes);
  assert.strictEqual(parsed.matchId, 'match-1');
  assert.strictEqual(parsed.events.length, project.events.length);
  assert.deepStrictEqual(parsed.meta.metadata, project.metadata);
  assert.deepStrictEqual(parsed.meta.homeSelection, project.homeSelection);
});

test('a corrupted .ovs file throws a recognizable error instead of crashing silently', () => {
  assert.throws(() => parseOvsBundleFile(new Uint8Array([1, 2, 3, 4])), /Invalid \.ovs file/);
});
