// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import {
  activePrintTheme, clubPrintTheme, contrastRatio, PRINT_THEME_IDS, readPrintThemeChoice, readableInk, resolvePrintTheme, savePrintThemeChoice,
} from './print-theme';

beforeEach(() => window.localStorage.clear());

describe('print themes', () => {
  it('keeps the look of today as the default', () => {
    expect(readPrintThemeChoice()).toEqual({ id: 'ovs' });
    expect(activePrintTheme()).toMatchObject({ primary: '#142e42', accent: '#007e80' });
  });

  it('resolves every theme, with readable text on the band and on white', () => {
    for (const id of PRINT_THEME_IDS) {
      const theme = resolvePrintTheme(id);
      expect(contrastRatio(theme.primary, theme.onPrimary), `${id} band`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#ffffff', theme.accent), `${id} accent`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio('#ffffff', theme.text), `${id} text`).toBeGreaterThanOrEqual(7);
      expect(contrastRatio('#ffffff', theme.ink), `${id} ink`).toBeGreaterThanOrEqual(7);
    }
  });

  it('turns the text dark on a light club colour and fixes an accent too pale for white', () => {
    const light = clubPrintTheme({ primary: '#ffe066', accent: '#fff3b0' });
    expect(light.onPrimary).toBe('#111827');
    expect(contrastRatio('#ffffff', light.accent)).toBeGreaterThanOrEqual(3);
    expect(clubPrintTheme({ primary: '#003366', accent: '#d4af37' }).onPrimary).toBe('#ffffff');
    expect(readableInk('#ffffff')).toBe('#111827');
  });

  it('falls back to the default club colours for a wrong value', () => {
    expect(clubPrintTheme({ primary: 'red', accent: '#12' }).primary).toBe('#7a1f2b');
  });

  it('saves a choice with the club colours, and forgets it when back to OVS', () => {
    savePrintThemeChoice({ id: 'club', club: { primary: '#112233', accent: '#aa5500' } });
    expect(readPrintThemeChoice()).toEqual({ id: 'club', club: { primary: '#112233', accent: '#aa5500' } });
    expect(activePrintTheme().primary).toBe('#112233');
    // A report's own choice wins over the saved one.
    expect(activePrintTheme({ id: 'black-white' }).flat).toBe(true);
    savePrintThemeChoice({ id: 'ovs' });
    expect(window.localStorage.getItem('openvolleyscout.printTheme')).toBeNull();
  });

  it('ignores a damaged saved value', () => {
    window.localStorage.setItem('openvolleyscout.printTheme', '{"id":"neon"}');
    expect(readPrintThemeChoice()).toEqual({ id: 'ovs' });
    window.localStorage.setItem('openvolleyscout.printTheme', 'not json');
    expect(readPrintThemeChoice()).toEqual({ id: 'ovs' });
  });
});
