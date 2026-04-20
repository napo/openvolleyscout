import { matchProjectDb } from '../db/match-project-db';

/**
 * Development-only helper to clear all persisted local app data.
 * Clears IndexedDB plus browser key-value storage used by the app shell.
 */
export async function resetLocalData() {
  await matchProjectDb.delete();

  window.localStorage.clear();
  window.sessionStorage.clear();
}
