// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { serveStartBadgeRow } from './serve-start-badges';

describe('serveStartBadgeRow', () => {
  it('gives each of the five serve start zones its own row, in baseline order', () => {
    expect(['5', '7', '6', '9', '1'].map(serveStartBadgeRow)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps the rows the badges already had for 5, 6 and 1', () => {
    expect(serveStartBadgeRow('5')).toBe(0);
    expect(serveStartBadgeRow('6')).toBe(2);
    expect(serveStartBadgeRow('1')).toBe(4);
  });

  it('reads the zone from codes with a subzone and rejects anything else', () => {
    expect(serveStartBadgeRow('9B')).toBe(3);
    expect(serveStartBadgeRow('8')).toBeNull();
    expect(serveStartBadgeRow('')).toBeNull();
    expect(serveStartBadgeRow(undefined)).toBeNull();
  });
});
