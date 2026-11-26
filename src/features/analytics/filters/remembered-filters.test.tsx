// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { buildCrossRotationStatsFromRallies } from '@src/features/scouting/model/match-stats';
import { clearRememberedState, useRememberedState } from '@src/lib/hooks/useRememberedState';
import { countChangedFilters } from '@src/lib/utils/stats-scope';
import { createDefaultFilters } from '../dashboard/filters/dashboard-filters';
import { getFilteredTouches } from '../dashboard/selectors/dashboard-selectors';
import { computeSideOutDistribution, createDefaultSideOutStudyFilters, extractSideOutSequences } from '../sideout/sideout-distribution';
import { sharedPlayByPlaySets } from '../play-by-play/PlayByPlayPanel';

afterEach(() => { cleanup(); clearRememberedState(); });

describe('filters remembered between tabs', () => {
  it('are still there when the panel is opened again for the same match', () => {
    const first = renderHook(() => useRememberedState('panel', 'match-1', () => ({ set: 'all' as number | 'all' })));
    act(() => first.result.current[1]({ set: 2 }));
    first.unmount();
    const again = renderHook(() => useRememberedState('panel', 'match-1', () => ({ set: 'all' as number | 'all' })));
    expect(again.result.current[0]).toEqual({ set: 2 });
  });

  it('start again for another match, and when reset', () => {
    const first = renderHook(() => useRememberedState('panel', 'match-1', () => ({ set: 'all' as number | 'all' })));
    act(() => first.result.current[1]({ set: 2 }));
    first.unmount();
    const other = renderHook(() => useRememberedState('panel', 'match-2', () => ({ set: 'all' as number | 'all' })));
    expect(other.result.current[0]).toEqual({ set: 'all' });
    act(() => other.result.current[1]({ set: 3 }));
    act(() => other.result.current[2]());
    expect(other.result.current[0]).toEqual({ set: 'all' });
    other.unmount();
    expect(renderHook(() => useRememberedState('panel', 'match-2', () => ({ set: 'all' as number | 'all' }))).result.current[0]).toEqual({ set: 'all' });
  });

  it('another panel keeps its own choices', () => {
    const a = renderHook(() => useRememberedState('a', 's', () => 1));
    act(() => a.result.current[1](5));
    expect(renderHook(() => useRememberedState('b', 's', () => 1)).result.current[0]).toBe(1);
  });
});

describe('the reset count', () => {
  it('counts the filters that differ from their default, leaving out what is only a view', () => {
    const defaults: { team: string; set: string | number; roles: string[]; mode: string } = { team: 'home', set: 'all', roles: [], mode: 'classic' };
    expect(countChangedFilters(defaults, defaults)).toBe(0);
    expect(countChangedFilters({ ...defaults, set: 2, roles: ['S'], team: 'away' }, defaults, ['team'])).toBe(2);
  });
});

describe('cross rotation of one set', () => {
  const bytes = readFileSync('public/samples/demo-melodic-spikers-hollywood-blockers.dvw');
  const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'd.dvw' });
  const stats = buildProjectMatchStats(mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'd.dvw' }).project);

  it('counted from the rallies of the whole match gives the table of the whole match', () => {
    const rebuilt = buildCrossRotationStatsFromRallies(stats.rallyStats);
    for (const side of ['home', 'away'] as const) {
      expect(rebuilt.bySide[side].grandTotal).toEqual(stats.crossRotationStats.bySide[side].grandTotal);
      expect(rebuilt.bySide[side].rowTotals).toEqual(stats.crossRotationStats.bySide[side].rowTotals);
    }
  });

  it('the sets add up to the match', () => {
    const sets = [...new Set(stats.rallyStats.map((rally) => rally.setNumber))];
    const total = sets.reduce((sum, setNumber) => (
      sum + buildCrossRotationStatsFromRallies(stats.rallyStats.filter((rally) => rally.setNumber === setNumber)).bySide.home.grandTotal.attempts
    ), 0);
    expect(total).toBe(stats.crossRotationStats.bySide.home.grandTotal.attempts);
    expect(sets.length).toBeGreaterThan(1);
  });
});

describe('several sets, rotations and phases at once', () => {
  const bytes = readFileSync('public/samples/demo-melodic-spikers-hollywood-blockers.dvw');
  const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'd.dvw' });
  const stats = buildProjectMatchStats(mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'd.dvw' }).project);
  const count = (patch: Partial<ReturnType<typeof createDefaultFilters>>) => getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home', ...patch }).length;

  it('two sets are the sum of each, and all the sets are the whole match', () => {
    expect(count({ set: [1, 2] })).toBe(count({ set: [1] }) + count({ set: [2] }));
    expect(count({ set: [1, 2, 3] })).toBe(count({}));
  });

  it('two rotations are the sum of each, and two phases the sum of each', () => {
    expect(count({ rotation: [1, 4] })).toBe(count({ rotation: [1] }) + count({ rotation: [4] }));
    expect(count({ rallyPhase: ['break_point', 'point'] })).toBe(count({ rallyPhase: ['break_point'] }) + count({ rallyPhase: ['point'] }));
  });

  it('the side-out study and a shared play by play read several sets too', () => {
    const sequences = extractSideOutSequences(stats.rallyStats);
    const sets = (setNumbers: number[]) => computeSideOutDistribution(sequences, { ...createDefaultSideOutStudyFilters('home'), setNumbers }).totalSets;
    expect(sets([1, 3])).toBe(sets([1]) + sets([3]));
    expect(sets([])).toBe(sets([1]) + sets([2]) + sets([3]));
    // A link made before several sets could be chosen carries one set, or 0 for all.
    expect(sharedPlayByPlaySets({ setNumber: 2 })).toEqual([2]);
    expect(sharedPlayByPlaySets({ setNumber: 0 })).toEqual([]);
    expect(sharedPlayByPlaySets({ setNumber: 0, setNumbers: [1, 3] })).toEqual([1, 3]);
  });
});
