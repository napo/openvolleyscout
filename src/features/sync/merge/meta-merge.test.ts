import assert from 'node:assert';
import { test } from 'vitest';
import type { OvsMetaJson } from '../ovs-bundle/types';
import { mergeMetaJson } from './meta-merge';

function baseMeta(): OvsMetaJson {
  return {
    metadata: { id: 'match-1', format: 'best_of_5', schemaVersion: 4, venue: 'Gym 1' },
    homeSelection: {
      teamId: 'home-team',
      teamName: 'Home',
      source: 'manual_entry',
      staff: { headCoach: 'Coach A', assistantCoach: '' },
      roster: [{ id: 'p1', jerseyNumber: 1, firstName: 'A', lastName: 'B', shortName: 'A.B.', playerCode: 'AB', source: 'manual_entry' }],
    },
    awaySelection: {
      teamId: 'away-team',
      teamName: 'Away',
      source: 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
    },
    phase: 'scouting',
    videoAnalysis: {
      syncPoints: [{ id: 'sp1', touchId: 't1', eventClockSeconds: 1, videoSeconds: 2, createdAt: 1 }],
      paddingBeforeSeconds: 2,
      paddingAfterSeconds: 2,
      updatedAt: 1,
    },
    createdAt: 100,
    updatedAt: 200,
  };
}

test('unchanged meta merges with no conflicts', () => {
  const base = baseMeta();
  const result = mergeMetaJson(base, base, base);
  assert.deepStrictEqual(result.conflicts, []);
  assert.deepStrictEqual(result.merged.homeSelection.roster, base.homeSelection.roster);
});

test('only-local metadata change is kept, no conflict', () => {
  const base = baseMeta();
  const local = { ...base, metadata: { ...base.metadata, venue: 'Gym 2' } };
  const result = mergeMetaJson(base, local, base);
  assert.strictEqual(result.merged.metadata.venue, 'Gym 2');
  assert.deepStrictEqual(result.conflicts, []);
});

test('the same metadata field changed differently on both sides is a conflict, defaults to local', () => {
  const base = baseMeta();
  const local = { ...base, metadata: { ...base.metadata, venue: 'Gym 2 (local)' } };
  const remote = { ...base, metadata: { ...base.metadata, venue: 'Gym 2 (remote)' } };
  const result = mergeMetaJson(base, local, remote);
  assert.strictEqual(result.merged.metadata.venue, 'Gym 2 (local)');
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].path, 'metadata.venue');
});

test('independent edits to different metadata fields both survive with no conflict', () => {
  const base = baseMeta();
  const local = { ...base, metadata: { ...base.metadata, venue: 'Gym 2' } };
  const remote = { ...base, metadata: { ...base.metadata, competition: 'Cup Final' } };
  const result = mergeMetaJson(base, local, remote);
  assert.strictEqual(result.merged.metadata.venue, 'Gym 2');
  assert.strictEqual(result.merged.metadata.competition, 'Cup Final');
  assert.deepStrictEqual(result.conflicts, []);
});

test('a new roster player added remotely is merged in, no conflict', () => {
  const base = baseMeta();
  const remote = {
    ...base,
    homeSelection: {
      ...base.homeSelection,
      roster: [
        ...base.homeSelection.roster,
        { id: 'p2', jerseyNumber: 2, firstName: 'C', lastName: 'D', shortName: 'C.D.', playerCode: 'CD', source: 'manual_entry' as const },
      ],
    },
  };
  const result = mergeMetaJson(base, base, remote);
  assert.strictEqual(result.merged.homeSelection.roster.length, 2);
  assert.deepStrictEqual(result.conflicts, []);
});

test('a video sync point edited differently on both sides is a conflict under a videoAnalysis.syncPoints path', () => {
  const base = baseMeta();
  const local = {
    ...base,
    videoAnalysis: {
      ...base.videoAnalysis!,
      syncPoints: [{ ...base.videoAnalysis!.syncPoints[0], videoSeconds: 5 }],
    },
  };
  const remote = {
    ...base,
    videoAnalysis: {
      ...base.videoAnalysis!,
      syncPoints: [{ ...base.videoAnalysis!.syncPoints[0], videoSeconds: 9 }],
    },
  };
  const result = mergeMetaJson(base, local, remote);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].path, 'videoAnalysis.syncPoints:sp1');
});

test('deleting videoAnalysis on one side does not discard a sync point legitimately added on the other', () => {
  const base = baseMeta();
  const local = { ...base, videoAnalysis: undefined };
  const remote = {
    ...base,
    videoAnalysis: {
      ...base.videoAnalysis!,
      syncPoints: [...base.videoAnalysis!.syncPoints, { id: 'sp2', touchId: 't2', eventClockSeconds: 3, videoSeconds: 4, createdAt: 2 }],
    },
  };
  const result = mergeMetaJson(base, local, remote);
  assert.ok(result.merged.videoAnalysis, 'videoAnalysis should not be dropped entirely');
  assert.deepStrictEqual(
    result.merged.videoAnalysis?.syncPoints.map((point) => point.id).sort(),
    ['sp2'],
  );
});
