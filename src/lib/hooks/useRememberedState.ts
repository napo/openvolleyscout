// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useState } from 'react';

/**
 * State of a panel that outlives the panel: the filters of an analysis tab are still there when the
 * user comes back from another tab. Kept in memory for the session, per panel and per `scope` (the
 * match or the selection of matches on screen): another scope starts from the initial value.
 */
const memory = new Map<string, { scope: string; value: unknown }>();

export function useRememberedState<T>(
  panel: string,
  scope: string,
  initial: () => T,
): [T, (next: T | ((previous: T) => T)) => void, () => void] {
  const [value, setValue] = useState<{ scope: string; value: T }>(() => {
    const remembered = memory.get(panel);
    return remembered && remembered.scope === scope
      ? { scope, value: remembered.value as T }
      : { scope, value: initial() };
  });
  // The scope changed under a mounted panel (another match): start again.
  let current = value;
  if (value.scope !== scope) {
    current = { scope, value: initial() };
    setValue(current);
  }

  const set = useCallback((next: T | ((previous: T) => T)) => {
    setValue((previous) => {
      const nextValue = typeof next === 'function' ? (next as (previous: T) => T)(previous.value) : next;
      memory.set(panel, { scope, value: nextValue });
      return { scope, value: nextValue };
    });
  }, [panel, scope]);

  const reset = useCallback(() => {
    const fresh = initial();
    memory.set(panel, { scope, value: fresh });
    setValue({ scope, value: fresh });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, scope]);

  return [current.value, set, reset];
}

/** Forgets everything remembered (tests). */
export function clearRememberedState(): void {
  memory.clear();
}
