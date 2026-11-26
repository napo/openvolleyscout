// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PlayerRole } from '@src/domain/systems';
import { getQuickStartMiddlePositions } from './quick-start';

describe('quick start middles', () => {
  it('follow the setter position in the default role order', () => {
    expect(getQuickStartMiddlePositions(2)).toEqual([1, 4]);
    expect(getQuickStartMiddlePositions(4)).toEqual([3, 6]);
  });

  it('are unknown without a setter', () => {
    expect(getQuickStartMiddlePositions(undefined)).toEqual([]);
  });

  it('follow the team role order (P-C-S: the middle comes right after the setter)', () => {
    const pcs = [
      PlayerRole.SETTER, PlayerRole.MIDDLE_BLOCKER_1, PlayerRole.OUTSIDE_HITTER_1,
      PlayerRole.OPPOSITE, PlayerRole.MIDDLE_BLOCKER_2, PlayerRole.OUTSIDE_HITTER_2,
    ];
    expect(getQuickStartMiddlePositions(2, pcs)).toEqual([3, 6]);
  });
});
