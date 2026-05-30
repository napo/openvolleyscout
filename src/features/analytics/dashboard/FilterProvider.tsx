import React, { createContext, useContext } from 'react';
import type { AdvancedFilters } from '../filters/advanced-filters';
import { useFilterStore } from '../stores/filter-store';

/**
 * Context for providing filter store to dashboard and its children.
 * Allows widgets to subscribe to filter changes independently.
 */

interface FilterContextType {
  filters: AdvancedFilters;
  filterCount: number;
  hasFilter: (filterType: keyof AdvancedFilters) => boolean;
  isDefault: () => boolean;
  updateFilter: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void;
  resetFilters: () => void;
  batchUpdateFilters: (updates: Partial<AdvancedFilters>) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

interface FilterProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that exposes the filter store to dashboard widgets.
 * Wraps the entire dashboard and its children.
 */
export function FilterProvider({ children }: FilterProviderProps) {
  const filters = useFilterStore((state) => state.filters);
  const filterCount = useFilterStore((state) => state.filterCount);
  const hasFilter = useFilterStore((state) => state.hasFilter);
  const isDefault = useFilterStore((state) => state.isDefault);
  const updateFilter = useFilterStore((state) => state.updateFilter);
  const resetFilters = useFilterStore((state) => state.resetFilters);
  const batchUpdateFilters = useFilterStore((state) => state.batchUpdateFilters);

  const value: FilterContextType = {
    filters,
    filterCount,
    hasFilter,
    isDefault,
    updateFilter,
    resetFilters,
    batchUpdateFilters,
  };

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

/**
 * Hook to access filter context from dashboard widgets.
 * Must be called within a FilterProvider.
 */
export function useFilterContext(): FilterContextType {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilterContext must be used within FilterProvider');
  }
  return context;
}

/**
 * Hook to access only filter state (for widgets that don't need setters).
 */
export function useFiltersOnly(): AdvancedFilters {
  const context = useFilterContext();
  return context.filters;
}

/**
 * Hook to access only filter actions (for components that dispatch changes).
 */
export function useFilterActions() {
  const context = useFilterContext();
  return {
    updateFilter: context.updateFilter,
    resetFilters: context.resetFilters,
    batchUpdateFilters: context.batchUpdateFilters,
  };
}
