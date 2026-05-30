import { create } from 'zustand';
import type { AdvancedFilters } from '../filters/advanced-filters';
import {
  createDefaultAdvancedFilters,
  getAdvancedFilterCount,
  hasAdvancedFilter,
} from '../filters/advanced-filters';

/**
 * Zustand store for unified advanced filters.
 * Manages all filter state for dashboard widgets and heatmaps.
 * Prevents cascading re-renders by using selective subscriptions.
 */

interface FilterStoreState {
  filters: AdvancedFilters;
  filterCount: number;

  // Actions
  setFilters: (filters: AdvancedFilters) => void;
  updateFilter: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void;
  resetFilters: () => void;
  batchUpdateFilters: (updates: Partial<AdvancedFilters>) => void;

  // Utilities
  hasFilter: (filterType: keyof AdvancedFilters) => boolean;
  isDefault: () => boolean;
}

export const useFilterStore = create<FilterStoreState>((set, get) => ({
  filters: createDefaultAdvancedFilters(),
  filterCount: 0,

  setFilters: (filters: AdvancedFilters) => {
    set({
      filters,
      filterCount: getAdvancedFilterCount(filters),
    });
  },

  updateFilter: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
    set((state) => {
      const updated = { ...state.filters, [key]: value };
      return {
        filters: updated,
        filterCount: getAdvancedFilterCount(updated),
      };
    });
  },

  resetFilters: () => {
    const defaults = createDefaultAdvancedFilters();
    set({
      filters: defaults,
      filterCount: 0,
    });
  },

  batchUpdateFilters: (updates: Partial<AdvancedFilters>) => {
    set((state) => {
      const updated = { ...state.filters, ...updates };
      return {
        filters: updated,
        filterCount: getAdvancedFilterCount(updated),
      };
    });
  },

  hasFilter: (filterType: keyof AdvancedFilters) => {
    return hasAdvancedFilter(get().filters, filterType);
  },

  isDefault: () => {
    const state = get();
    return state.filterCount === 0;
  },
}));
