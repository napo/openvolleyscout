// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The serve count badges sit in the strip behind the baseline, one per serve start zone.
 * The heatmap court is six sub-rows tall and the baseline runs along it, so the five
 * DataVolley serve start zones (manual 13.2) take rows 0 to 4: 5, 7, 6, 9, 1. The
 * conflict zones 7 and 9 sit halfway between their neighbours instead of sharing the
 * badge of 5 and 1.
 */
export const SERVE_START_BADGE_ROW: Readonly<Record<string, number>> = { '5': 0, '7': 1, '6': 2, '9': 3, '1': 4 };

/** Badge row of a serve start zone code (`'9'`, `'9B'`), or null for anything else. */
export function serveStartBadgeRow(code: string | undefined): number | null {
  const digit = code?.trim().charAt(0);
  return digit !== undefined && digit in SERVE_START_BADGE_ROW ? SERVE_START_BADGE_ROW[digit] : null;
}
