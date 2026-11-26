// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A ratio (0.253) as a percentage ("25.3%"), "-" when there is no value. The analysis screens show
 * one decimal; pass 0 for the printed reports, which show whole percentages.
 */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || Number.isNaN(value) ? '-' : `${(value * 100).toFixed(digits)}%`;
}
