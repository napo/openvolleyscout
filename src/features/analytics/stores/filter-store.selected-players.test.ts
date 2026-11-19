// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { useFilterStore } from './filter-store';

describe('selected players (player performance)', () => {
  it('starts empty, stores the picked athletes and clears them on reset', () => {
    useFilterStore.getState().resetFilters();
    expect(useFilterStore.getState().selectedPlayerIds).toEqual([]);
    useFilterStore.getState().setSelectedPlayerIds(['p1', 'p2']);
    expect(useFilterStore.getState().selectedPlayerIds).toEqual(['p1', 'p2']);
    useFilterStore.getState().resetFilters();
    expect(useFilterStore.getState().selectedPlayerIds).toEqual([]);
  });
});
