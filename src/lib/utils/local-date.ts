/**
 * Calendar-date helpers that work in the device's time zone.
 *
 * Match times (`metadata.playedAt`) are stored in three shapes:
 * - zoned ISO instants ("2026-09-27T22:30:00.000Z"), from the match setup form;
 * - zone-less local date-times ("2026-09-27T20:30:00"), from DataVolley files;
 * - bare dates ("2026-09-27"), from DataVolley files without a time and from
 *   Tiebreak Tech imports.
 *
 * Slicing the first ten characters of a UTC instant, or reading it with the
 * UTC getters, shows the previous or next day whenever the local offset
 * crosses midnight (e.g. in Italy between 00:00 and 01:00/02:00). A bare date
 * can't go through `new Date()` either: the spec parses it as UTC midnight,
 * which is the previous day anywhere west of Greenwich.
 */

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Parses a stored match time into a Date whose local getters give the intended day and time. */
export function parseStoredDateTime(value: string | undefined | null): Date | null {
  if (!value) return null;

  const bareDate = BARE_DATE.exec(value);
  if (bareDate) {
    return new Date(Number(bareDate[1]), Number(bareDate[2]) - 1, Number(bareDate[3]));
  }

  // Zoned strings are instants; zone-less date-times are local time per the spec.
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** YYYY-MM-DD of a Date in local time. */
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Today's date (YYYY-MM-DD) in local time. */
export function todayLocalDate(): string {
  return toLocalDateString(new Date());
}

/** Local calendar date (YYYY-MM-DD) of a stored match time; '' when missing. */
export function formatLocalDate(value: string | undefined | null): string {
  if (!value) return '';
  if (BARE_DATE.test(value)) return value;

  const date = parseStoredDateTime(value);
  return date ? toLocalDateString(date) : value.slice(0, 10);
}
