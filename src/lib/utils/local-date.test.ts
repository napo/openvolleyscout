import { describe, expect, it } from 'vitest';
import {
  formatDisplayDate,
  formatDisplayTime,
  formatLocalDate,
  parseStoredDateTime,
  todayLocalDate,
  toLocalDateString,
} from './local-date';

describe('formatLocalDate', () => {
  it('keeps bare dates and zone-less local times on their own day', () => {
    expect(formatLocalDate('2026-09-27')).toBe('2026-09-27');
    expect(formatLocalDate('2026-09-27T00:30:00')).toBe('2026-09-27');
    expect(formatLocalDate('2026-09-27T23:30:00')).toBe('2026-09-27');
  });

  it('reads zoned instants in the local time zone', () => {
    const justAfterMidnight = new Date(2026, 8, 27, 0, 30);
    const lateEvening = new Date(2026, 8, 27, 23, 30);
    expect(formatLocalDate(justAfterMidnight.toISOString())).toBe('2026-09-27');
    expect(formatLocalDate(lateEvening.toISOString())).toBe('2026-09-27');
  });

  it('handles missing and invalid values', () => {
    expect(formatLocalDate(undefined)).toBe('');
    expect(formatLocalDate(null)).toBe('');
    expect(formatLocalDate('not a date')).toBe('not a date');
  });
});

describe('parseStoredDateTime', () => {
  it('reads a bare date as local midnight, not UTC midnight', () => {
    const date = parseStoredDateTime('2026-09-27');
    expect(date && [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 8, 27, 0]);
  });

  it('reads a zone-less date-time as local time', () => {
    const date = parseStoredDateTime('2026-09-27T20:15:30');
    expect(date && [date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([27, 20, 15, 30]);
  });

  it('returns null for missing or invalid values', () => {
    expect(parseStoredDateTime(undefined)).toBeNull();
    expect(parseStoredDateTime('garbage')).toBeNull();
  });
});

describe('todayLocalDate', () => {
  it('matches the local calendar date', () => {
    expect(todayLocalDate()).toBe(toLocalDateString(new Date()));
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatDisplayDate / formatDisplayTime', () => {
  // Expected strings come from the same system formatter, so the tests hold in any locale.
  const systemDate = (date: Date) =>
    new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const systemTime = (date: Date) =>
    new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);

  it('formats the stored day in the system regional format', () => {
    expect(formatDisplayDate('2026-09-27')).toBe(systemDate(new Date(2026, 8, 27)));
    expect(formatDisplayDate('2026-09-27T00:30:00')).toBe(systemDate(new Date(2026, 8, 27)));
  });

  it('adds the time only when the stored value has one', () => {
    const withTime = formatDisplayDate('2026-09-27T20:15:00', { withTime: true });
    expect(withTime).toContain(systemTime(new Date(2026, 8, 27, 20, 15)));
    expect(formatDisplayDate('2026-09-27', { withTime: true })).toBe(systemDate(new Date(2026, 8, 27)));
  });

  it('never invents a midnight time for date-only values', () => {
    expect(formatDisplayTime('2026-09-27')).toBe('');
    expect(formatDisplayTime('2026-09-27T20:15:00')).toBe(systemTime(new Date(2026, 8, 27, 20, 15)));
  });

  it('handles missing and invalid values', () => {
    expect(formatDisplayDate(undefined)).toBe('');
    expect(formatDisplayDate('not a date')).toBe('not a date');
    expect(formatDisplayTime(null)).toBe('');
  });
});
