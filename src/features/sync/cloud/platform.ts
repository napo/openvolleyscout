// SPDX-License-Identifier: AGPL-3.0-or-later

/** Which platform synchronisation runs on, and the HTTP client it uses there. */

import type { Fetch } from './storage';

export type SyncPlatform = 'web' | 'desktop' | 'android' | 'ios';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export function syncPlatform(): SyncPlatform {
  if (!isTauriRuntime()) return 'web';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

/** In installed Tauri apps, cloud requests go through Rust (tauri-plugin-http), avoiding CORS limits on the app origin. */
export async function syncFetch(): Promise<Fetch> {
  if (!isTauriRuntime()) return (input, init) => fetch(input, init);
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
  return (input, init) => tauriFetch(input, init);
}
