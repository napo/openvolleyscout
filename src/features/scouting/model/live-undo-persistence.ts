import type { MatchEvent } from '@src/domain/events/types';
import { isValidUndoEntry, type LiveUndoEntry } from './live-undo-entry';

/**
 * Keeps the grouped-undo stack of the open match across page reloads, so the
 * last actions can still be undone after the match is reopened (see
 * readStoredActiveProjectId in the app store).
 *
 * Only one match is kept: the stack belongs to the match being scouted.
 * Each entry is saved with the id of the first event it covers. The stack is
 * written synchronously while the events reach IndexedDB asynchronously, so
 * after a reload an entry is kept only when the saved log still starts that
 * action with the same event; otherwise it could cut unrelated events.
 */
const STORAGE_KEY = 'openvolleyscout.liveUndoStack';
const MAX_STORED_ENTRIES = 50;

interface StoredUndoEntry {
  entry: LiveUndoEntry;
  firstEventId: string;
}

interface StoredUndoStack {
  projectId: string;
  entries: StoredUndoEntry[];
}

export function saveUndoStack(
  projectId: string,
  eventLog: readonly MatchEvent[],
  undoStack: readonly LiveUndoEntry[],
): void {
  const entries = undoStack.slice(-MAX_STORED_ENTRIES).flatMap((entry) => {
    const firstEventId = eventLog[entry.eventCountBefore]?.id;
    return firstEventId ? [{ entry, firstEventId }] : [];
  });

  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const stored: StoredUndoStack = { projectId, entries };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Undo history is a convenience: losing it only disables undo after a reload.
  }
}

export function loadUndoStack(projectId: string, eventLog: readonly MatchEvent[]): LiveUndoEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const stored = JSON.parse(raw) as Partial<StoredUndoStack>;
    if (stored.projectId !== projectId || !Array.isArray(stored.entries)) return [];

    return stored.entries
      .filter((item): item is StoredUndoEntry => (
        typeof item?.entry?.eventCountBefore === 'number'
        && isValidUndoEntry(item.entry, eventLog.length)
        && eventLog[item.entry.eventCountBefore]?.id === item.firstEventId
      ))
      .map((item) => item.entry);
  } catch {
    return [];
  }
}
