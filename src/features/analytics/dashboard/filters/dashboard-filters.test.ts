// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createDefaultAdvancedFilters } from '../../filters/advanced-filters';
import {
  createDefaultFilters,
  getActiveFilterCount,
  isDefaultFilters,
  normalizeDashboardFilters,
  type DashboardFilters,
} from './dashboard-filters';

/** Filters as an older version saved them, with the combined "Base / Combination" list. */
function legacy(extra: Record<string, unknown>): DashboardFilters {
  const { setterCalls: _s, combinationCodes: _c, attackBallTypes: _a, ...rest } = createDefaultFilters();
  return { ...rest, ...extra } as unknown as DashboardFilters;
}

describe('normalizeDashboardFilters: Base, Combination and Set type', () => {
  it('splits the old combined list: K codes to Base, the others to Combination', () => {
    const next = normalizeDashboardFilters(legacy({ base: ['K1', 'KC', 'X5', ' v6 ', 'k7', 'X5'] }));
    expect(next.setterCalls).toEqual(['K1', 'KC', 'K7']);
    expect(next.combinationCodes).toEqual(['X5', 'V6']);
    expect(next.attackBallTypes).toEqual([]);
    expect('base' in next).toBe(false);
  });

  it('reads the single values and "all" of older versions', () => {
    expect(normalizeDashboardFilters(legacy({ base: 'all' }))).toMatchObject({ setterCalls: [], combinationCodes: [] });
    expect(normalizeDashboardFilters(legacy({ base: 'K1' }))).toMatchObject({ setterCalls: ['K1'], combinationCodes: [] });
    expect(normalizeDashboardFilters(legacy({ base: 'X5' }))).toMatchObject({ setterCalls: [], combinationCodes: ['X5'] });
    expect(normalizeDashboardFilters(legacy({}))).toMatchObject({ setterCalls: [], combinationCodes: [], attackBallTypes: [] });
  });

  it('merges the old list with the new ones and moves a K code out of the combinations', () => {
    const next = normalizeDashboardFilters(legacy({ base: ['K1', 'X5'], setterCalls: ['K2'], combinationCodes: ['V6', 'K3'] }));
    expect(next.setterCalls).toEqual(['K1', 'K2', 'K3']);
    expect(next.combinationCodes).toEqual(['X5', 'V6']);
  });

  it('is idempotent', () => {
    const once = normalizeDashboardFilters(legacy({ base: ['K1', 'X5'], attackBallTypes: ['q', 'H'] }));
    expect(normalizeDashboardFilters(once)).toEqual(once);
  });

  it('keeps only the seven set type letters, upper-cased and once', () => {
    expect(normalizeDashboardFilters(legacy({ attackBallTypes: ['q', 'Z', 'H', 'Q', 3, 'all'] })).attackBallTypes).toEqual(['Q', 'H']);
    expect(normalizeDashboardFilters(legacy({ attackBallTypes: 'm' })).attackBallTypes).toEqual(['M']);
  });

  it('leaves the new filters of a current link as they are', () => {
    const current = { ...createDefaultAdvancedFilters(), setterCalls: ['K1'], combinationCodes: ['X5'], attackBallTypes: ['Q' as const] };
    expect(normalizeDashboardFilters(current)).toMatchObject({ setterCalls: ['K1'], combinationCodes: ['X5'], attackBallTypes: ['Q'] });
  });
});

describe('active filter count with the code filters', () => {
  it('counts Base, Combination and Set type once each', () => {
    const defaults = createDefaultFilters();
    expect(getActiveFilterCount(defaults)).toBe(0);
    expect(isDefaultFilters(defaults)).toBe(true);
    expect(getActiveFilterCount({ ...defaults, setterCalls: ['K1', 'K2'] })).toBe(1);
    expect(getActiveFilterCount({ ...defaults, setterCalls: ['K1'], combinationCodes: ['X5'], attackBallTypes: ['Q', 'H'] })).toBe(3);
    expect(isDefaultFilters({ ...defaults, attackBallTypes: ['Q'] })).toBe(false);
    expect(isDefaultFilters({ ...defaults, combinationCodes: ['X5'] })).toBe(false);
  });

  it('starts the filter store with the three lists empty', () => {
    expect(createDefaultAdvancedFilters()).toMatchObject({ setterCalls: [], combinationCodes: [], attackBallTypes: [] });
    expect('base' in createDefaultAdvancedFilters()).toBe(false);
  });
});
