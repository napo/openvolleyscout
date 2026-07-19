import { useEffect, useState } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';

/**
 * Detects, once on mount, whether a desktop-only Tauri command reports a
 * capability as available (e.g. a bundled sidecar, a platform feature).
 * Always false outside Tauri (web build) or if the command errors.
 */
export function useTauriCapability(command: string): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<boolean>(command).then(setAvailable).catch(() => {});
  }, [command]);

  return available;
}
