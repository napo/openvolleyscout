// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { readThemeChoice, resolveTheme, saveThemeChoice } from './theme';

beforeEach(() => window.localStorage.clear());

describe('theme choice', () => {
  it('is light until the user chooses something else', () => {
    expect(readThemeChoice()).toBe('light');
    expect(resolveTheme(readThemeChoice(), true)).toBe('light');
  });

  it('keeps an explicit choice, including following the system', () => {
    saveThemeChoice('dark');
    expect(readThemeChoice()).toBe('dark');
    saveThemeChoice('system');
    expect(readThemeChoice()).toBe('system');
    expect(resolveTheme('system', true)).toBe('dark');
  });
});
