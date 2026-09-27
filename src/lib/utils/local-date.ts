/**
 * Calendar date (YYYY-MM-DD) of a stored match time, in the device's time zone.
 *
 * Match times are stored either as ISO strings with a zone ("…Z", from the
 * match setup form) or as zone-less local strings ("2026-09-27T08:52:00",
 * from DataVolley files). Taking the first ten characters of a UTC string
 * gives the wrong day in Japan before 09:00, so the date is read in local time.
 */
export function formatLocalDate(value: string | undefined | null): string {
  if (!value) return '';
  // A bare date is already a calendar date (new Date() would read it as UTC).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
