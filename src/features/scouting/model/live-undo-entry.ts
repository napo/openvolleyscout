export interface LiveUndoEntry {
  id: string;
  label: string;
  createdAt: number;
  actionType: string;
  eventCountBefore: number;
}

function createUndoEntryId(): string {
  return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createUndoEntry(input: Omit<LiveUndoEntry, 'id' | 'createdAt'>): LiveUndoEntry {
  return {
    id: createUndoEntryId(),
    createdAt: Date.now(),
    ...input,
  };
}

export function isValidUndoEntry(entry: LiveUndoEntry, eventLogLength: number): boolean {
  return entry.eventCountBefore < eventLogLength;
}

/**
 * Undo entries after one event was inserted at `insertedAt` (not appended):
 * every entry that cut the log at or after that point moves by one, so an
 * undo still removes exactly the events its action added and keeps the
 * inserted one (e.g. a libero exchange recorded before the current rally).
 */
export function shiftUndoEntriesForInsertion(
  stack: readonly LiveUndoEntry[],
  insertedAt: number,
): LiveUndoEntry[] {
  return stack.map((entry) => (
    entry.eventCountBefore >= insertedAt
      ? { ...entry, eventCountBefore: entry.eventCountBefore + 1 }
      : entry
  ));
}
