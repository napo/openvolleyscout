// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import { isHighBall } from './attack-context';

const touch = (extra: Partial<BallTouch>): BallTouch => ({
  id: 't', setNumber: 1, rallyNumber: 1, sequenceNumber: 0, teamSide: 'home', skill: 'attack', createdAt: 0, ...extra,
});

describe('isHighBall', () => {
  it('recognises the DataVolley letter H on the set or on the attack', () => {
    expect(isHighBall(touch({ skill: 'set', setType: 'H' }), touch({}))).toBe(true);
    expect(isHighBall(touch({ skill: 'set', skillTypeCode: 'H' }), touch({}))).toBe(true);
    expect(isHighBall(null, touch({ attackType: 'H' }))).toBe(true);
    expect(isHighBall(null, touch({ skillTypeCode: 'H' }))).toBe(true);
  });

  it('still recognises the older high_ball wording', () => {
    expect(isHighBall(touch({ skill: 'set', setType: 'high_ball' }), touch({}))).toBe(true);
  });

  it('does not match other ball types', () => {
    expect(isHighBall(touch({ skill: 'set', setType: 'Q' }), touch({ attackType: 'M' }))).toBe(false);
    expect(isHighBall(null, touch({}))).toBe(false);
  });
});
