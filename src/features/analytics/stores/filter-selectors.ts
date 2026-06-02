import type { AdvancedFilters } from '../filters/advanced-filters';
import { useFilterStore } from './filter-store';

/**
 * Memoized selectors for filter store.
 * These prevent unnecessary widget re-renders by using Zustand's selective subscriptions.
 * When a selector function is passed to the hook, Zustand automatically memoizes the result
 * and only triggers a re-render if the return value changes.
 */

/**
 * Get all filters.
 * Use this when a widget needs to react to all filter changes.
 */
export function useAdvancedFilters(): AdvancedFilters {
  return useFilterStore((state) => state.filters);
}

/**
 * Get filter count.
 * Use this for badge displays showing active filter count.
 */
export function useFilterCount(): number {
  return useFilterStore((state) => state.filterCount);
}

/**
 * Subscribe to only basic filters (team, set, player, role, source, rallyPhase).
 * Use this when a widget only cares about basic filters.
 */
export function useBasicFilters() {
  return useFilterStore((state) => ({
    team: state.filters.team,
    set: state.filters.set,
    player: state.filters.player,
    role: state.filters.role,
    source: state.filters.source,
    rallyPhase: state.filters.rallyPhase,
  }));
}

/**
 * Subscribe to tactical situation only.
 */
export function useTacticalSituation(): string {
  return useFilterStore((state) => state.filters.tacticalSituation);
}

/**
 * Subscribe to score-state only.
 */
export function useScoreState() {
  return useFilterStore((state) => state.filters.scoreState);
}

/**
 * Subscribe to rotation index only.
 */
export function useRotationIndex() {
  return useFilterStore((state) => state.filters.rotationIndex);
}

/**
 * Subscribe to player combinations only.
 */
export function usePlayerCombinations(): string[] {
  return useFilterStore((state) => state.filters.playerCombinations ?? []);
}

/**
 * Check if any filters are active (count > 0).
 */
export function useHasActiveFilters(): boolean {
  return useFilterStore((state) => state.filterCount > 0);
}

/**
 * Get filter actions (setters).
 * Stable across re-renders (actions don't change).
 */
export function useFilterActions() {
  return useFilterStore((state) => ({
    setFilters: state.setFilters,
    updateFilter: state.updateFilter,
    resetFilters: state.resetFilters,
    batchUpdateFilters: state.batchUpdateFilters,
    setSavedPlayer: state.setSavedPlayer,
  }));
}

export function useSavedPlayer() {
  return useFilterStore((state) => state.savedPlayer);
}

/**
 * Check if a specific filter is active.
 */
export function useHasFilter(filterType: keyof AdvancedFilters): boolean {
  return useFilterStore((state) => state.hasFilter(filterType));
}

/**
 * Check if all filters are at default values.
 */
export function useIsDefaultFilters(): boolean {
  return useFilterStore((state) => state.isDefault());
}

/**
 * Get all filter state and actions (for complex widgets).
 * Use this sparingly - prefer specific selectors above.
 */
export function useFilterState() {
  return useFilterStore((state) => ({
    filters: state.filters,
    filterCount: state.filterCount,
    setFilters: state.setFilters,
    updateFilter: state.updateFilter,
    resetFilters: state.resetFilters,
    batchUpdateFilters: state.batchUpdateFilters,
    hasFilter: state.hasFilter,
    isDefault: state.isDefault,
  }));
}
