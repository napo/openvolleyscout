// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hydratePrintBranding, setPrintBrandingPersister, subscribePrintTheme, type PrintBrandingChange,
  activePrintTheme, clubPrintTheme, isPrintLogo, readPrintLogo, savePrintLogo, contrastRatio, pdfPrintTheme, PRINT_THEME_IDS, readPrintThemeChoice, readStoredPrintThemeChoice, readableInk, resetPrintThemeChoice, resolvePrintTheme, savePrintThemeChoice,
} from './print-theme';

beforeEach(() => {
  window.localStorage.clear();
  setPrintBrandingPersister(null);
  hydratePrintBranding(null);
});

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
    // OVS chosen on purpose is kept; resetting brings the defaults back.
    savePrintThemeChoice({ id: 'ovs' });
    expect(readStoredPrintThemeChoice()).toEqual({ id: 'ovs' });
    resetPrintThemeChoice();
    expect(readStoredPrintThemeChoice()).toBeNull();
  });

  it('gives the other PDFs their usual blue until a theme is chosen', () => {
    expect(pdfPrintTheme().primary).toBe('#002554');
    savePrintThemeChoice({ id: 'ovs' });
    expect(pdfPrintTheme().primary).toBe('#142e42');
    resetPrintThemeChoice();
    expect(pdfPrintTheme({ id: 'black-white' }).flat).toBe(true);
  });

  it('keeps a small PNG or JPEG logo and refuses anything else', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(isPrintLogo(png)).toBe(true);
    expect(isPrintLogo('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isPrintLogo(`data:image/png;base64,${'A'.repeat(400_001)}`)).toBe(false);
    savePrintLogo(png);
    expect(readPrintLogo()).toBe(png);
    savePrintLogo('javascript:alert(1)');
    expect(readPrintLogo()).toBeNull();
    window.localStorage.setItem('openvolleyscout.printLogo', 'data:text/html;base64,PGI+');
    expect(readPrintLogo()).toBeNull();
  });

  it('ignores a damaged saved value', () => {
    window.localStorage.setItem('openvolleyscout.printTheme', '{"id":"neon"}');
    expect(readPrintThemeChoice()).toEqual({ id: 'ovs' });
    window.localStorage.setItem('openvolleyscout.printTheme', 'not json');
    expect(readPrintThemeChoice()).toEqual({ id: 'ovs' });
  });

  it('answers from the values loaded from the database once they are there, and tells the subscribers', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    window.localStorage.setItem('openvolleyscout.printTheme', '{"id":"black-white"}');
    const listener = vi.fn();
    const unsubscribe = subscribePrintTheme(listener);
    hydratePrintBranding({ themeChoice: { id: 'club', club: { primary: '#112233', accent: '#aa5500' } }, logo: png });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readStoredPrintThemeChoice()).toEqual({ id: 'club', club: { primary: '#112233', accent: '#aa5500' } });
    expect(readPrintLogo()).toBe(png);
    // localStorage follows, so the next start shows the same look before the database is read.
    expect(JSON.parse(window.localStorage.getItem('openvolleyscout.printTheme') ?? 'null')).toEqual({ id: 'club', club: { primary: '#112233', accent: '#aa5500' } });
    expect(window.localStorage.getItem('openvolleyscout.printLogo')).toBe(png);

    // A value removed elsewhere (cloud sync) is gone here too, even if localStorage still had it.
    window.localStorage.setItem('openvolleyscout.printLogo', png);
    hydratePrintBranding({ themeChoice: null, logo: null });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(readPrintLogo()).toBeNull();
    expect(readStoredPrintThemeChoice()).toBeNull();
    expect(window.localStorage.getItem('openvolleyscout.printLogo')).toBeNull();
    unsubscribe();
  });

  it('hands every change to the database writer and keeps it in memory', () => {
    const changes: PrintBrandingChange[] = [];
    setPrintBrandingPersister((change) => changes.push(change));
    hydratePrintBranding({ themeChoice: null, logo: null });
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    savePrintThemeChoice({ id: 'high-contrast' });
    savePrintLogo(png);
    expect(readPrintThemeChoice()).toEqual({ id: 'high-contrast' });
    expect(readPrintLogo()).toBe(png);
    resetPrintThemeChoice();
    savePrintLogo(null);
    expect(changes).toEqual([
      { id: 'printTheme', value: { id: 'high-contrast' } },
      { id: 'image:clubLogo', value: png },
      { id: 'printTheme', value: null },
      { id: 'image:clubLogo', value: null },
    ]);
    expect(readStoredPrintThemeChoice()).toBeNull();
    expect(readPrintLogo()).toBeNull();
  });

  it('drops a damaged value handed by the database', () => {
    hydratePrintBranding({ themeChoice: { id: 'neon' } as never, logo: 'data:text/html;base64,PGI+' });
    expect(readStoredPrintThemeChoice()).toBeNull();
    expect(readPrintLogo()).toBeNull();
  });
});
