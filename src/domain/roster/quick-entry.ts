/**
 * Parses a quick jersey-number list such as "1 2 3 5 7-9 L12, 14".
 *
 * - Numbers may be separated by spaces, commas, 、 or line breaks.
 * - "7-9" (or "7~9") expands to 7, 8, 9.
 * - A leading "L" (or "Ｌ", "l") marks a libero: "L12", "L:12", "L 12".
 * - Full-width digits are accepted.
 * Duplicates keep their first occurrence; invalid tokens are reported back.
 */
export interface QuickEntryPlayer {
  jerseyNumber: number;
  isLibero: boolean;
}

export interface QuickEntryResult {
  players: QuickEntryPlayer[];
  invalidTokens: string[];
}

const MAX_JERSEY_NUMBER = 99;
const MAX_RANGE_SIZE = 30;

function toHalfWidth(value: string): string {
  return value.replace(/[０-９Ａ-Ｚａ-ｚ：～－]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function isValidJersey(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_JERSEY_NUMBER;
}

export function parseQuickJerseyList(input: string): QuickEntryResult {
  const normalized = toHalfWidth(input)
    // "L 12" / "L: 12" → "L12"
    .replace(/([lL])\s*:?\s*(?=\d)/g, 'L');
  const tokens = normalized.split(/[\s,、;]+/).filter(Boolean);

  const players: QuickEntryPlayer[] = [];
  const seen = new Set<number>();
  const invalidTokens: string[] = [];

  const add = (jerseyNumber: number, isLibero: boolean) => {
    if (seen.has(jerseyNumber)) return;
    seen.add(jerseyNumber);
    players.push({ jerseyNumber, isLibero });
  };

  for (const token of tokens) {
    const match = /^(L)?(\d{1,2})(?:[-~](\d{1,2}))?$/.exec(token);
    if (!match) {
      invalidTokens.push(token);
      continue;
    }

    const isLibero = Boolean(match[1]);
    const start = Number(match[2]);
    const end = match[3] === undefined ? start : Number(match[3]);

    if (!isValidJersey(start) || !isValidJersey(end) || end < start || end - start >= MAX_RANGE_SIZE) {
      invalidTokens.push(token);
      continue;
    }

    for (let jersey = start; jersey <= end; jersey += 1) {
      add(jersey, isLibero);
    }
  }

  return { players, invalidTokens };
}
