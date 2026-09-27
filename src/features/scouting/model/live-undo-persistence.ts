import { isValidUndoEntry, type LiveUndoEntry } from './live-undo-entry';

/**
 * Keeps the grouped-undo stack across reloads. iPad Safari reloads background
 * tabs, and the match itself is restored from IndexedDB; without this the
 * scout could no longer undo the last action afterwards.
 * Entries only hold "event count before", so they stay valid as long as the
 * saved event log still has more events than that.
 */
const KEY_PREFIX = 'syncscout-live.undo.';

export function saveUndoStack(projectId: string, stack: LiveUndoEntry[]): void {
  try {
    if (stack.length === 0) {
      window.localStorage.removeItem(KEY_PREFIX + projectId);
    } else {
      window.localStorage.setItem(KEY_PREFIX + projectId, JSON.stringify(stack.slice(-50)));
    }
  } catch {
    // Undo history is a convenience; losing it only disables undo after a reload.
  }
}

export function loadUndoStack(projectId: string, eventLogLength: number): LiveUndoEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + projectId);
    if (!raw) return [];
    const stack = JSON.parse(raw) as LiveUndoEntry[];
    if (!Array.isArray(stack)) return [];
    // Drop entries the saved log can no longer satisfy (e.g. a save that did not finish).
    return stack.filter((entry) => (
      typeof entry?.eventCountBefore === 'number' && isValidUndoEntry(entry, eventLogLength)
    ));
  } catch {
    return [];
  }
}
