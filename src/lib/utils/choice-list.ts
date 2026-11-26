// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The values chosen in a filter that takes several at once (an empty list = all), also when the
 * filter was saved by an older version as one value or 'all'.
 */
export function choiceList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item !== 'all' && item !== '');
  return typeof value === 'string' && value !== 'all' && value !== '' ? [value] : [];
}

/** Whether `id` passes such a filter. */
export function matchesChoice(value: unknown, id: string | null | undefined): boolean {
  const chosen = choiceList(value);
  return chosen.length === 0 || (id != null && chosen.includes(id));
}
