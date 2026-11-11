// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { getSkipTarget } from './use-transport-controls';

describe('getSkipTarget', () => {
  it('jumps back and forward', () => {
    expect(getSkipTarget(60, -10, 600)).toBe(50);
    expect(getSkipTarget(60, 5, 600)).toBe(65);
  });

  it('never goes before the start', () => {
    expect(getSkipTarget(3, -5, 600)).toBe(0);
  });

  it('stops at the end when the length is known', () => {
    expect(getSkipTarget(595, 10, 600)).toBe(600);
  });

  it('jumps freely when the length is unknown (e.g. a stream)', () => {
    expect(getSkipTarget(595, 10, null)).toBe(605);
  });
});
