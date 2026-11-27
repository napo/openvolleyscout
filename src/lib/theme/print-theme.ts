// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The look of what is printed or exported (the tactical report and every PDF): the frame around the content,
 * not the colours that carry a meaning (traffic lights, evaluation scales, direction arrows). It is separate
 * from the light/dark theme of the app, because a printed sheet stays light.
 */
export type PrintThemeId = 'ovs' | 'ovs-blue' | 'club' | 'black-white' | 'high-contrast';

export const PRINT_THEME_IDS: readonly PrintThemeId[] = ['ovs', 'ovs-blue', 'club', 'black-white', 'high-contrast'];

export interface PrintTheme {
  id: PrintThemeId;
  /** Band at the top of a page, titles and the main text of the frame. */
  primary: string;
  /** Text on the band: white, or dark when the band is light. */
  onPrimary: string;
  /** Accent: highlighted values, small headings, the highest bar of a chart. */
  accent: string;
  /** Pale background of highlighted boxes (the main priorities). */
  accentSoft: string;
  /** Text of the frame (titles, values) on white. */
  ink: string;
  /** Pale background of boxes and cells. */
  soft: string;
  /** Background of total rows in tables. */
  totals: string;
  /** Lines and borders. */
  border: string;
  /** Neutral bars and secondary shapes of a chart. */
  neutral: string;
  /** Running text. */
  text: string;
  /** Secondary text (captions, column headings). */
  muted: string;
  /** Black-and-white themes drop the pale fills. */
  flat: boolean;
}

export interface ClubColors {
  primary: string;
  accent: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

const toHex = (values: readonly number[]) => `#${values.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;

/** Mix of two colours: `amount` of `towards` over `from` (0 to 1). */
export function mixColors(from: string, towards: string, amount: number): string {
  const a = channels(from), b = channels(towards);
  return toHex(a.map((value, index) => value + (b[index] - value) * amount));
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** White or near-black, whichever reads better on this background. */
export function readableInk(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#111827') ? '#ffffff' : '#111827';
}

/** Darkens a colour until it reads on white (at least `minimum`), keeping its hue. */
function legibleOnWhite(color: string, minimum: number): string {
  let result = color;
  for (let step = 0; step < 20 && contrastRatio(result, '#ffffff') < minimum; step += 1) result = mixColors(result, '#000000', 0.12);
  return result;
}

export const DEFAULT_CLUB_COLORS: ClubColors = { primary: '#7a1f2b', accent: '#c28a00' };

const BASE = { text: '#111827', muted: '#475569' } as const;

export const PRINT_THEMES: Record<Exclude<PrintThemeId, 'club'>, PrintTheme> = {
  ovs: {
    id: 'ovs', primary: '#142e42', onPrimary: '#ffffff', accent: '#007e80', accentSoft: '#eaf3f3', ink: '#142e42', soft: '#f8fafc', totals: '#e3edee', border: '#cbd5e1', neutral: '#cbd5e1', ...BASE, flat: false,
  },
  'ovs-blue': {
    id: 'ovs-blue', primary: '#002554', onPrimary: '#ffffff', accent: '#0169d8', accentSoft: '#e6f0fb', ink: '#002554', soft: '#eef5ff', totals: '#dfe8f7', border: '#7f93b4', neutral: '#c9d6ea', text: '#111827', muted: '#6b7280', flat: false,
  },
  'black-white': {
    id: 'black-white', primary: '#e5e7eb', onPrimary: '#111827', accent: '#111827', accentSoft: '#f3f4f6', ink: '#000000', soft: '#ffffff', totals: '#e5e7eb', border: '#6b7280', neutral: '#d1d5db', text: '#000000', muted: '#374151', flat: true,
  },
  'high-contrast': {
    id: 'high-contrast', primary: '#000000', onPrimary: '#ffffff', accent: '#0047b3', accentSoft: '#e6edf7', ink: '#000000', soft: '#ffffff', totals: '#e5e7eb', border: '#000000', neutral: '#9ca3af', text: '#000000', muted: '#1f2937', flat: false,
  },
};

/** The theme of a club: its two colours, the rest derived, with text that stays readable on the band and on white. */
export function clubPrintTheme(colors: Partial<ClubColors> = {}): PrintTheme {
  const primary = isHexColor(colors.primary) ? colors.primary.toLowerCase() : DEFAULT_CLUB_COLORS.primary;
  const accent = isHexColor(colors.accent) ? colors.accent.toLowerCase() : DEFAULT_CLUB_COLORS.accent;
  return {
    id: 'club',
    primary,
    onPrimary: readableInk(primary),
    // The accent colours text and thin lines on white: keep it readable there.
    accent: legibleOnWhite(accent, 3),
    accentSoft: mixColors(legibleOnWhite(accent, 3), '#ffffff', 0.9),
    // A dark club colour also writes the titles; a light one leaves them near-black.
    ink: contrastRatio(primary, '#ffffff') >= 7 ? primary : '#111827',
    soft: mixColors(primary, '#ffffff', 0.94),
    totals: mixColors(primary, '#ffffff', 0.86),
    border: mixColors(primary, '#ffffff', 0.7),
    neutral: mixColors(primary, '#ffffff', 0.78),
    ...BASE,
    flat: false,
  };
}

export function resolvePrintTheme(id: PrintThemeId | undefined, club?: Partial<ClubColors>): PrintTheme {
  if (id === 'club') return clubPrintTheme(club);
  return PRINT_THEMES[id && id in PRINT_THEMES ? id as Exclude<PrintThemeId, 'club'> : 'ovs'];
}

const STORAGE_KEY = 'openvolleyscout.printTheme';
const LOGO_KEY = 'openvolleyscout.printLogo';

/** Ids of the print look and of the club logo among the app assets kept with the data. */
export const PRINT_THEME_ASSET_ID = 'printTheme';
export const CLUB_LOGO_ASSET_ID = 'image:clubLogo';

export interface PrintThemeChoice {
  id: PrintThemeId;
  club?: ClubColors;
}

const isThemeId = (value: unknown): value is PrintThemeId => PRINT_THEME_IDS.includes(value as PrintThemeId);

/** A saved choice checked field by field, or null when it is not one. */
export function parsePrintThemeChoice(value: unknown): PrintThemeChoice | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<PrintThemeChoice>;
  if (!isThemeId(parsed.id)) return null;
  const club = parsed.club && isHexColor(parsed.club.primary) && isHexColor(parsed.club.accent)
    ? { primary: parsed.club.primary, accent: parsed.club.accent }
    : undefined;
  return { id: parsed.id, ...(club ? { club } : {}) };
}

/** Largest stored logo (a 256 px PNG weighs far less). */
export const MAX_LOGO_LENGTH = 400_000;

/** A club logo as stored: a PNG or JPEG data URL, small enough for every document. */
export function isPrintLogo(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_LOGO_LENGTH && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/** The print look and the club logo, as saved with the data of the app. */
export interface PrintBranding {
  themeChoice: PrintThemeChoice | null;
  logo: string | null;
}

/** One change made in Settings, handed to whoever keeps the data (the database). */
export type PrintBrandingChange =
  | { id: typeof PRINT_THEME_ASSET_ID; value: PrintThemeChoice | null }
  | { id: typeof CLUB_LOGO_ASSET_ID; value: string | null };

/**
 * The values loaded from the database. Until they are loaded (the first
 * render, tests, scripts) the copy kept in localStorage is read instead; this
 * module stays free of the database so it runs anywhere.
 */
let hydrated: PrintBranding | null = null;
let persister: ((change: PrintBrandingChange) => void) | null = null;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export function subscribePrintTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function mirror(key: string, value: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage full: the copy in memory and in the database is enough.
  }
}

/** Receives every change made with the save and reset functions below, to write it to the database. */
export function setPrintBrandingPersister(next: ((change: PrintBrandingChange) => void) | null): void {
  persister = next;
}

/**
 * Takes the values saved with the data (at start-up, after cloud sync or a
 * restored backup) and tells the subscribers. `null` goes back to reading
 * localStorage only.
 */
export function hydratePrintBranding(branding: PrintBranding | null): void {
  if (branding === null) {
    hydrated = null;
  } else {
    const themeChoice = parsePrintThemeChoice(branding.themeChoice);
    const logo = isPrintLogo(branding.logo) ? branding.logo : null;
    hydrated = { themeChoice, logo };
    mirror(STORAGE_KEY, themeChoice ? JSON.stringify(themeChoice) : null);
    mirror(LOGO_KEY, logo);
  }
  notify();
}

/** The choice kept for every printed document, or null when the user never picked one. */
export function readStoredPrintThemeChoice(): PrintThemeChoice | null {
  if (hydrated) return hydrated.themeChoice;
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return raw ? parsePrintThemeChoice(JSON.parse(raw)) : null;
  } catch {
    // Unreadable or blocked storage: the default look.
  }
  return null;
}

/** The tactical report's choice: the OVS look until the user picks another. */
export function readPrintThemeChoice(): PrintThemeChoice {
  return readStoredPrintThemeChoice() ?? { id: 'ovs' };
}

/** The look of the other PDFs (match report, exports): the OVS blue they always had, until the user picks a theme. */
export function pdfPrintTheme(own?: PrintThemeChoice): PrintTheme {
  const choice = own ?? readStoredPrintThemeChoice();
  return choice ? resolvePrintTheme(choice.id, choice.club) : PRINT_THEMES['ovs-blue'];
}

/** Forgets the choice: the defaults of each document come back. */
export function resetPrintThemeChoice(): void {
  mirror(STORAGE_KEY, null);
  if (hydrated) hydrated = { ...hydrated, themeChoice: null };
  notify();
  persister?.({ id: PRINT_THEME_ASSET_ID, value: null });
}

export function savePrintThemeChoice(choice: PrintThemeChoice): void {
  const next = parsePrintThemeChoice(choice);
  if (!next) return;
  mirror(STORAGE_KEY, JSON.stringify(next));
  if (hydrated) hydrated = { ...hydrated, themeChoice: next };
  notify();
  persister?.({ id: PRINT_THEME_ASSET_ID, value: next });
}

/** The theme to print with: the report's own choice when it has one, else the default of the app. */
export function activePrintTheme(own?: PrintThemeChoice): PrintTheme {
  const choice = own ?? readPrintThemeChoice();
  return resolvePrintTheme(choice.id, choice.club);
}

/** The club logo printed in the band of reports and in the header of PDFs, or null. */
export function readPrintLogo(): string | null {
  if (hydrated) return hydrated.logo;
  try {
    const value = typeof window !== 'undefined' ? window.localStorage.getItem(LOGO_KEY) : null;
    return isPrintLogo(value) ? value : null;
  } catch {
    return null;
  }
}

export function savePrintLogo(logo: string | null): void {
  const next = logo && isPrintLogo(logo) ? logo : null;
  mirror(LOGO_KEY, next);
  if (hydrated) hydrated = { ...hydrated, logo: next };
  notify();
  persister?.({ id: CLUB_LOGO_ASSET_ID, value: next });
}
