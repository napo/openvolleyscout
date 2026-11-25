// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { getQuickStartMiddlePositions } from './quick-start';

describe('quick start middles', () => {
  it('follow the setter position in the default role order', () => {
    expect(getQuickStartMiddlePositions(2)).toEqual([1, 4]);
    expect(getQuickStartMiddlePositions(4)).toEqual([3, 6]);
  });

  it('are unknown without a setter', () => {
    expect(getQuickStartMiddlePositions(undefined)).toEqual([]);
  });
});
