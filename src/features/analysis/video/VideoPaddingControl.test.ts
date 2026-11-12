import { describe, expect, it } from 'vitest';
import { parseVideoPadding } from './VideoPaddingControl';

describe('video padding entered on a mobile keyboard', () => {
  it('accepts decimal commas and rounds to tenths', () => {
    expect(parseVideoPadding('2,5')).toBe(2.5);
    expect(parseVideoPadding('3.14')).toBe(3.1);
    expect(parseVideoPadding('0')).toBe(0);
    expect(parseVideoPadding('30')).toBe(30);
  });
  it('keeps empty drafts and invalid or out-of-range values out of saved settings', () => {
    for (const value of ['', ' ', '-', '-1', '31', 'Infinity', '2s', '1,2,3']) expect(parseVideoPadding(value)).toBeNull();
  });
});
