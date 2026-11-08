/**
 * Unfinished set setup (lineups, step), kept per match and set in browser
 * storage so it survives a reload or an app restart. Removed when the set
 * starts, and pruned for matches that no longer exist.
 */
import type { SetStartSetupState } from './set-start';

const SET_SETUP_DRAFT_PREFIX = 'openvolleyscout.setSetupDraft.';
export const SET_START_STEPS = ['home', 'away', 'serving', 'confirm'] as const;
export type SetStartStep = typeof SET_START_STEPS[number];

export interface SetSetupDraft { state: SetStartSetupState; step: SetStartStep }

export function readSetSetupDraft(key: string | undefined): SetSetupDraft | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(SET_SETUP_DRAFT_PREFIX + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<SetSetupDraft>;
    if (!draft.state?.home || !draft.state.away || !SET_START_STEPS.includes(draft.step as SetStartStep)) return null;
    return draft as SetSetupDraft;
  } catch {
    return null;
  }
}

export function writeSetSetupDraft(key: string | undefined, draft: SetSetupDraft | null): void {
  if (!key) return;
  try {
    if (draft) window.localStorage.setItem(SET_SETUP_DRAFT_PREFIX + key, JSON.stringify(draft));
    else window.localStorage.removeItem(SET_SETUP_DRAFT_PREFIX + key);
  } catch {
    // Storage may be unavailable (private mode): the setup simply is not restored.
  }
}

/** Removes drafts of matches that are no longer stored (keys are `<matchId>:<setNumber>`). */
export function pruneSetSetupDrafts(existingMatchIds: Iterable<string>, storage: Storage | undefined = globalThis.localStorage): number {
  if (!storage) return 0;
  const keep = new Set(existingMatchIds);
  try {
    const stale: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(SET_SETUP_DRAFT_PREFIX)) continue;
      const matchId = key.slice(SET_SETUP_DRAFT_PREFIX.length).replace(/:[^:]*$/, '');
      if (!keep.has(matchId)) stale.push(key);
    }
    stale.forEach((key) => storage.removeItem(key));
    return stale.length;
  } catch {
    return 0;
  }
}
