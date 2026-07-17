import assert from 'node:assert';
import { test } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import { detectOpenSetDivergence, mergeEventLog } from './event-log-merge';

const e1: MatchEvent = { id: 'e1', type: 'match_created', createdAt: 1 };
const e2: MatchEvent = {
  id: 'e2',
  type: 'set_started',
  setNumber: 1,
  createdAt: 2,
  homeLineup: {} as never,
  awayLineup: {} as never,
  servingTeam: 'home',
};
const e3: MatchEvent = { id: 'e3', type: 'rally_started', createdAt: 3 };

test('linear continuation: remote appended new events for the same set, no local changes', () => {
  const base = [e1, e2];
  const local = [e1, e2];
  const e4: MatchEvent = { id: 'e4', type: 'point_awarded', setNumber: 1, rallyNumber: 1, teamSide: 'home', createdAt: 4 };
  const e5: MatchEvent = { id: 'e5', type: 'rally_started', createdAt: 5 };
  const remote = [e1, e2, e4, e5];

  const result = mergeEventLog(base, local, remote);
  assert.deepStrictEqual(result.merged, [e1, e2, e4, e5]);
  assert.deepStrictEqual(result.divergenceConflicts, []);
});

test('undo (truncation) on one side merges as a clean deletion', () => {
  const base = [e1, e2, e3];
  const local = [e1, e2]; // undo dropped e3
  const remote = [e1, e2, e3];

  const result = mergeEventLog(base, local, remote);
  assert.deepStrictEqual(result.merged, [e1, e2]);
  assert.deepStrictEqual(result.divergenceConflicts, []);
});

test('both sides continued the same open set: flagged as a blocking divergence, not silently interleaved', () => {
  const base = [e1, e2];
  const localOnly: MatchEvent = { id: 'local-only', type: 'rally_started', setNumber: 1, createdAt: 10 } as MatchEvent;
  const remoteOnly: MatchEvent = { id: 'remote-only', type: 'rally_started', setNumber: 1, createdAt: 10 } as MatchEvent;
  const local = [e1, e2, localOnly];
  const remote = [e1, e2, remoteOnly];

  const result = mergeEventLog(base, local, remote);
  assert.strictEqual(result.merged, null);
  assert.strictEqual(result.divergenceConflicts.length, 1);
  assert.strictEqual(result.divergenceConflicts[0].setNumber, 1);
});

test('detectOpenSetDivergence finds nothing when only one side extended a set', () => {
  const base = [e1, e2];
  const local = [e1, e2];
  const remote = [e1, e2, { id: 'remote-only', type: 'rally_started', setNumber: 1, createdAt: 10 } as MatchEvent];
  assert.deepStrictEqual(detectOpenSetDivergence(base, local, remote), []);
});

test('resolving the divergence in favor of local drops the remote continuation for that set', () => {
  const base = [e1, e2];
  const localOnly: MatchEvent = { id: 'local-only', type: 'rally_started', setNumber: 1, createdAt: 10 } as MatchEvent;
  const remoteOnly: MatchEvent = { id: 'remote-only', type: 'rally_started', setNumber: 1, createdAt: 11 } as MatchEvent;
  const local = [e1, e2, localOnly];
  const remote = [e1, e2, remoteOnly];

  const result = mergeEventLog(base, local, remote, { 1: 'local' });
  assert.deepStrictEqual(result.merged, [e1, e2, localOnly]);
  assert.deepStrictEqual(result.divergenceConflicts, []);
});
