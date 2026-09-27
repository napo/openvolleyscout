import { describe, expect, it } from 'vitest';
import { formatLocalDate } from './local-date';

describe('formatLocalDate', () => {
  it('keeps bare dates and zone-less local times on their own day', () => {
    expect(formatLocalDate('2026-09-27')).toBe('2026-09-27');
    expect(formatLocalDate('2026-09-27T08:52:00')).toBe('2026-09-27');
  });

  it('reads zoned timestamps in the local time zone', () => {
    const instant = new Date(2026, 8, 27, 8, 52); // 27 Sep 08:52 local
    expect(formatLocalDate(instant.toISOString())).toBe('2026-09-27');
  });

  it('handles missing and invalid values', () => {
    expect(formatLocalDate(undefined)).toBe('');
    expect(formatLocalDate('not a date')).toBe('not a date');
  });
});
