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
  /** Pale background of boxes and cells. */
  soft: string;
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
    id: 'ovs', primary: '#142e42', onPrimary: '#ffffff', accent: '#007e80', soft: '#f8fafc', border: '#cbd5e1', neutral: '#cbd5e1', ...BASE, flat: false,
  },
  'ovs-blue': {
    id: 'ovs-blue', primary: '#002554', onPrimary: '#ffffff', accent: '#0169D8', soft: '#eef5ff', border: '#7f93b4', neutral: '#c9d6ea', text: '#111827', muted: '#6b7280', flat: false,
  },
  'black-white': {
    id: 'black-white', primary: '#e5e7eb', onPrimary: '#111827', accent: '#111827', soft: '#ffffff', border: '#6b7280', neutral: '#d1d5db', text: '#000000', muted: '#374151', flat: true,
  },
  'high-contrast': {
    id: 'high-contrast', primary: '#000000', onPrimary: '#ffffff', accent: '#0047b3', soft: '#ffffff', border: '#000000', neutral: '#9ca3af', text: '#000000', muted: '#1f2937', flat: false,
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
    soft: mixColors(primary, '#ffffff', 0.94),
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

export interface PrintThemeChoice {
  id: PrintThemeId;
  club?: ClubColors;
}

const isThemeId = (value: unknown): value is PrintThemeId => PRINT_THEME_IDS.includes(value as PrintThemeId);

/** The choice kept in this browser for every printed document; the OVS look until the user picks another. */
export function readPrintThemeChoice(): PrintThemeChoice {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) as Partial<PrintThemeChoice> : null;
    if (parsed && isThemeId(parsed.id)) {
      const club = parsed.club && isHexColor(parsed.club.primary) && isHexColor(parsed.club.accent) ? parsed.club : undefined;
      return { id: parsed.id, ...(club ? { club } : {}) };
    }
  } catch {
    // Unreadable or blocked storage: the default look.
  }
  return { id: 'ovs' };
}

const listeners = new Set<() => void>();
export function subscribePrintTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function savePrintThemeChoice(choice: PrintThemeChoice): void {
  try {
    if (choice.id === 'ovs') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  listeners.forEach((listener) => listener());
}

/** The theme to print with: the report's own choice when it has one, else the default of the app. */
export function activePrintTheme(own?: PrintThemeChoice): PrintTheme {
  const choice = own ?? readPrintThemeChoice();
  return resolvePrintTheme(choice.id, choice.club);
}
