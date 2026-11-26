// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';

/** Calls `onEscape` when the Escape key is pressed anywhere: how every dialog of the app can be dismissed. */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
