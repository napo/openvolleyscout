import { describe, expect, it } from 'vitest';
import { shiftUndoEntriesForInsertion } from './live-undo-entry';

describe('undo after an event inserted mid-log', () => {
  it('shifts the entries at or after the insertion point by one', () => {
    const stack = [
      { id: 'a', label: 'point', actionType: 'point', createdAt: 0, eventCountBefore: 3 },
      { id: 'b', label: 'rally', actionType: 'rally', createdAt: 0, eventCountBefore: 5 },
      { id: 'c', label: 'touch', actionType: 'touch', createdAt: 0, eventCountBefore: 7 },
    ];
    // A libero exchange inserted at index 5, just before the rally start.
    expect(shiftUndoEntriesForInsertion(stack, 5).map((entry) => entry.eventCountBefore)).toEqual([3, 6, 8]);
  });
});
