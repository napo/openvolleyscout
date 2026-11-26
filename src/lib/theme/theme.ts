// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The look of the app: light, dark, or following the system. The choice is kept in this browser;
 * the resolved theme is written on <html> (data-theme) where the stylesheets read it.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'openvolleyscout.theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

const isChoice = (value: unknown): value is ThemeChoice => THEME_CHOICES.includes(value as ThemeChoice);

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return isChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(choice: ThemeChoice, prefersDark = systemPrefersDark()): ResolvedTheme {
  return choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;
}

export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice);
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

const listeners = new Set<() => void>();
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Applies the saved choice now, and again when the system changes while the choice is "system". */
export function initTheme(): void {
  applyTheme(readThemeChoice());
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', () => {
    if (readThemeChoice() === 'system') applyTheme('system');
  });
}
