import assert from 'node:assert';
import { test } from 'vitest';
import type { ArchivedDataSnapshot } from '../backup-bundle/types';
import { mergeArchives } from './archive-merge';

function baseArchives(): ArchivedDataSnapshot {
  return {
    teams: [{ id: 't1', teamCode: 'T1', name: 'Team 1', staff: { headCoach: 'Coach A', assistantCoach: '' }, rosterIds: ['r1'], createdAt: 1, updatedAt: 1 }],
    rosters: [{ id: 'r1', teamId: 't1', players: [{ id: 'p1', jerseyNumber: 1, firstName: 'A', lastName: 'B', playerCode: 'AB' }] }],
    competitions: [{ id: 'c1', name: 'Cup', createdAt: 1, updatedAt: 1 }],
  };
}

test('unchanged archives merge with no conflicts', () => {
  const base = baseArchives();
  const result = mergeArchives(base, base, base);
  assert.deepStrictEqual(result.merged, base);
  assert.deepStrictEqual(result.conflicts, []);
});

test('a new team added remotely is merged in, no conflict', () => {
  const base = baseArchives();
  const remote: ArchivedDataSnapshot = {
    ...base,
    teams: [...base.teams, { id: 't2', teamCode: 'T2', name: 'Team 2', staff: { headCoach: '', assistantCoach: '' }, rosterIds: [], createdAt: 2, updatedAt: 2 }],
  };
  const result = mergeArchives(base, base, remote);
  assert.strictEqual(result.merged.teams.length, 2);
  assert.deepStrictEqual(result.conflicts, []);
});

test('the same team changed differently on both sides is a conflict under an archivedTeams:<id> path, defaults to local', () => {
  const base = baseArchives();
  const local: ArchivedDataSnapshot = {
    ...base,
    teams: [{ ...base.teams[0], name: 'Team 1 (local)' }],
  };
  const remote: ArchivedDataSnapshot = {
    ...base,
    teams: [{ ...base.teams[0], name: 'Team 1 (remote)' }],
  };
  const result = mergeArchives(base, local, remote);
  assert.strictEqual(result.merged.teams[0].name, 'Team 1 (local)');
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].path, 'archivedTeams:t1');
});

test('deleting a roster on one side, unchanged on the other, is honored (dropped)', () => {
  const base = baseArchives();
  const local: ArchivedDataSnapshot = { ...base, rosters: [] };
  const result = mergeArchives(base, local, base);
  assert.deepStrictEqual(result.merged.rosters, []);
  assert.deepStrictEqual(result.conflicts, []);
});

test('a new competition added remotely merges independently of team/roster changes', () => {
  const base = baseArchives();
  const local: ArchivedDataSnapshot = {
    ...base,
    teams: [{ ...base.teams[0], name: 'Team 1 (local rename)' }],
  };
  const remote: ArchivedDataSnapshot = {
    ...base,
    competitions: [...base.competitions, { id: 'c2', name: 'League', createdAt: 2, updatedAt: 2 }],
  };
  const result = mergeArchives(base, local, remote);
  assert.strictEqual(result.merged.teams[0].name, 'Team 1 (local rename)');
  assert.strictEqual(result.merged.competitions.length, 2);
  assert.deepStrictEqual(result.conflicts, []);
});
