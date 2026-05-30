import { describe, it, expect, beforeEach } from 'vitest';
import { useFilterStore } from './filter-store';
import type { AdvancedFilters } from '../filters/advanced-filters';
import { createDefaultAdvancedFilters } from '../filters/advanced-filters';

describe('Filter Store', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useFilterStore.setState({
      filters: createDefaultAdvancedFilters(),
      filterCount: 0,
    });
  });

  describe('Initial State', () => {
    it('should have default filters on creation', () => {
      const state = useFilterStore.getState();
      expect(state.filters.team).toBe('all');
      expect(state.filters.tacticalSituation).toBe('none');
      expect(state.filterCount).toBe(0);
    });

    it('should report no active filters initially', () => {
      const state = useFilterStore.getState();
      expect(state.isDefault()).toBe(true);
    });
  });

  describe('Single Filter Updates', () => {
    it('should update a single filter', () => {
      const { updateFilter } = useFilterStore.getState();
      updateFilter('team', 'home');

      const state = useFilterStore.getState();
      expect(state.filters.team).toBe('home');
      expect(state.filterCount).toBe(1);
    });

    it('should set tactical situation', () => {
      const { updateFilter } = useFilterStore.getState();
      updateFilter('tacticalSituation', 'side_out');

      const state = useFilterStore.getState();
      expect(state.filters.tacticalSituation).toBe('side_out');
      expect(state.filterCount).toBe(1);
    });

    it('should increment filter count on each new filter', () => {
      const { updateFilter } = useFilterStore.getState();

      updateFilter('team', 'home');
      expect(useFilterStore.getState().filterCount).toBe(1);

      updateFilter('set', '1');
      expect(useFilterStore.getState().filterCount).toBe(2);

      updateFilter('player', '5');
      expect(useFilterStore.getState().filterCount).toBe(3);
    });
  });

  describe('Batch Updates', () => {
    it('should update multiple filters at once', () => {
      const { batchUpdateFilters } = useFilterStore.getState();

      batchUpdateFilters({
        team: 'home',
        set: '1',
        tacticalSituation: 'break_point',
      });

      const state = useFilterStore.getState();
      expect(state.filters.team).toBe('home');
      expect(state.filters.set).toBe('1');
      expect(state.filters.tacticalSituation).toBe('break_point');
      expect(state.filterCount).toBe(3);
    });

    it('should not lose other filters during batch update', () => {
      const { updateFilter, batchUpdateFilters } = useFilterStore.getState();

      updateFilter('player', '10');
      expect(useFilterStore.getState().filterCount).toBe(1);

      batchUpdateFilters({ team: 'away', set: '2' });

      const state = useFilterStore.getState();
      expect(state.filters.player).toBe('10'); // Should still be set
      expect(state.filters.team).toBe('away');
      expect(state.filters.set).toBe('2');
      expect(state.filterCount).toBe(3);
    });
  });

  describe('Mutual Exclusivity', () => {
    it('should allow switching tactical situations', () => {
      const { updateFilter } = useFilterStore.getState();

      updateFilter('tacticalSituation', 'side_out');
      expect(useFilterStore.getState().filters.tacticalSituation).toBe('side_out');

      updateFilter('tacticalSituation', 'break_point');
      expect(useFilterStore.getState().filters.tacticalSituation).toBe('break_point');

      // Count should remain 1 (only one tactical situation)
      expect(useFilterStore.getState().filterCount).toBe(1);
    });

    it('should allow tactical situation + score state together', () => {
      const { updateFilter } = useFilterStore.getState();

      updateFilter('tacticalSituation', 'side_out');
      updateFilter('scoreState', 'tied');

      const state = useFilterStore.getState();
      expect(state.filters.tacticalSituation).toBe('side_out');
      expect(state.filters.scoreState).toBe('tied');
      expect(state.filterCount).toBe(2);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all filters to default', () => {
      const { updateFilter, resetFilters } = useFilterStore.getState();

      updateFilter('team', 'home');
      updateFilter('set', '1');
      updateFilter('tacticalSituation', 'side_out');

      expect(useFilterStore.getState().filterCount).toBe(3);

      resetFilters();

      const state = useFilterStore.getState();
      expect(state.filters.team).toBe('all');
      expect(state.filters.set).toBe('all');
      expect(state.filters.tacticalSituation).toBe('none');
      expect(state.filterCount).toBe(0);
      expect(state.isDefault()).toBe(true);
    });
  });

  describe('Set Filters (Bulk Replace)', () => {
    it('should replace entire filter state', () => {
      const newFilters: AdvancedFilters = {
        team: 'away',
        set: '2',
        player: 'all',
        role: 'middle',
        source: 'explicit',
        rallyPhase: 'serve',
        tacticalSituation: 'counterattack',
        scoreState: 'leading',
        rotationIndex: 3,
        playerCombinations: [],
        evaluationFilter: 'positive',
        serverNumber: undefined,
        receiverNumber: undefined,
        attackerNumber: undefined,
      };

      const { setFilters } = useFilterStore.getState();
      setFilters(newFilters);

      const state = useFilterStore.getState();
      expect(state.filters).toEqual(newFilters);
      expect(state.filterCount).toBe(5); // team, set, role, source, rallyPhase, tacticalSituation, scoreState, rotationIndex
    });
  });

  describe('Query Functions', () => {
    it('should check if specific filter is active', () => {
      const { updateFilter, hasFilter } = useFilterStore.getState();

      expect(hasFilter('team')).toBe(false);

      updateFilter('team', 'home');
      expect(hasFilter('team')).toBe(true);

      updateFilter('team', 'all');
      expect(hasFilter('team')).toBe(false);
    });

    it('should track default state accurately', () => {
      const { updateFilter, isDefault } = useFilterStore.getState();

      expect(isDefault()).toBe(true);

      updateFilter('team', 'home');
      expect(isDefault()).toBe(false);

      updateFilter('team', 'all');
      expect(isDefault()).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle rapid successive updates', () => {
      const { updateFilter } = useFilterStore.getState();

      for (let i = 0; i < 10; i++) {
        updateFilter('team', i % 2 === 0 ? 'home' : 'away');
      }

      expect(useFilterStore.getState().filters.team).toBe('away');
      expect(useFilterStore.getState().filterCount).toBe(1); // Still just one active filter
    });

    it('should handle player combination filters', () => {
      const { updateFilter } = useFilterStore.getState();

      updateFilter('playerCombinations', ['player1+player2', 'player3+player4']);

      const state = useFilterStore.getState();
      expect(state.filters.playerCombinations).toHaveLength(2);
      expect(state.filterCount).toBe(1); // Count as one filter (the combination list)
    });
  });
});
