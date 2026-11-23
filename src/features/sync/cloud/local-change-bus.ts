// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Tells cloud sync that the archive changed, so it can schedule a round.
 * Deletions are not passed here: the storage layer remembers them in the
 * database, in the same transaction as the deletion.
 */

export type DataChangeOrigin = 'local' | 'sync';

type ChangeListener = (origin: DataChangeOrigin) => void;

const changeListeners = new Set<ChangeListener>();

/** A change made on this device (`local`) or written by cloud sync (`sync`). */
export function notifyLocalDataChanged(origin: DataChangeOrigin = 'local'): void {
  for (const listener of changeListeners) listener(origin);
}

export function subscribeDataChanges(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

type DeletionListener = (matchId: string) => void;

const deletionListeners = new Set<DeletionListener>();

/** A match deleted on this device by the user (not by cloud sync). */
export function notifyMatchDeleted(matchId: string): void {
  for (const listener of deletionListeners) listener(matchId);
}

export function subscribeMatchDeletions(listener: DeletionListener): () => void {
  deletionListeners.add(listener);
  return () => deletionListeners.delete(listener);
}
