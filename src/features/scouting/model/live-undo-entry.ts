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
