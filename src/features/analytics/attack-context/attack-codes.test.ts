// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import {
  collectAttackCodeOptions,
  hasAttackCodeFilter,
  matchesAttackCodes,
  rallyMatchesAttackCodes,
  resolveAttackBallType,
  resolveAttackCombination,
  resolveTouchAttackCodes,
  setterCallOf,
  sortAttackCodes,
} from './attack-codes';

let counter = 0;
function touch(teamSide: TeamSide, skill: SkillType, extra: Partial<BallTouch> = {}): BallTouch {
  counter += 1;
  return { id: `t${counter}`, setNumber: 1, rallyNumber: 1, sequenceNumber: counter, createdAt: counter, teamSide, skill, ...extra };
}

describe('resolveAttackBallType', () => {
  it('reads the attack type first, then the skill type code, trimmed and upper-cased', () => {
    expect(resolveAttackBallType(touch('home', 'attack', { attackType: 'Q', skillTypeCode: 'H' }))).toBe('Q');
    expect(resolveAttackBallType(touch('home', 'attack', { skillTypeCode: ' q ' }))).toBe('Q');
    expect(resolveAttackBallType(touch('home', 'attack', { attackType: '' }))).toBeNull();
    expect(resolveAttackBallType(touch('home', 'attack'))).toBeNull();
  });
});

describe('setterCallOf', () => {
  it('takes the set call, then a K code in the set combination, then the attack call, then a K code in the attack combination', () => {
    const attack = touch('home', 'attack', { setterCallCode: 'K2', combinationCode: 'K7' });
    expect(setterCallOf(touch('home', 'set', { setterCallCode: 'k1', combinationCode: 'K9' }), attack)).toBe('K1');
    expect(setterCallOf(touch('home', 'set', { combinationCode: 'K9' }), attack)).toBe('K9');
    expect(setterCallOf(touch('home', 'set'), attack)).toBe('K2');
    expect(setterCallOf(null, touch('home', 'attack', { combinationCode: ' k7' }))).toBe('K7');
    expect(setterCallOf(undefined)).toBeNull();
  });

  it('ignores codes that are not setter calls', () => {
    expect(setterCallOf(touch('home', 'set', { setterCallCode: 'X5', combinationCode: 'V6' }), touch('home', 'attack', { combinationCode: 'X5' }))).toBeNull();
  });
});

describe('resolveAttackCombination', () => {
  it("is the attack's own combination, never a setter call", () => {
    expect(resolveAttackCombination(touch('home', 'attack', { combinationCode: 'x5' }))).toBe('X5');
    expect(resolveAttackCombination(touch('home', 'attack', { combinationCode: 'K7' }))).toBeNull();
    expect(resolveAttackCombination(touch('home', 'attack', { combinationCode: '' }))).toBeNull();
    expect(resolveAttackCombination(touch('home', 'attack', { setterCallCode: 'K1' }))).toBeNull();
  });
});

describe('resolveTouchAttackCodes', () => {
  it('gives an attack the call of its set, its own combination and its letter', () => {
    const sorted = [touch('home', 'receive'), touch('home', 'set', { setterCallCode: 'K1' }), touch('home', 'attack', { combinationCode: 'X5', attackType: 'm' })];
    expect(resolveTouchAttackCodes(sorted, 2)).toEqual({ setterCall: 'K1', combinationCode: 'X5', ballType: 'M' });
  });

  it('finds the set through a cover', () => {
    const sorted = [touch('home', 'set', { setterCallCode: 'K2' }), touch('home', 'cover'), touch('home', 'attack')];
    expect(resolveTouchAttackCodes(sorted, 2).setterCall).toBe('K2');
  });

  it('finds no set across a touch of the other team', () => {
    const sorted = [touch('home', 'set', { setterCallCode: 'K2' }), touch('away', 'block'), touch('home', 'attack')];
    expect(resolveTouchAttackCodes(sorted, 2).setterCall).toBeNull();
  });

  it('gives a set only its call, and any other touch nothing', () => {
    const sorted = [touch('home', 'receive'), touch('home', 'set', { setterCallCode: 'K1', combinationCode: 'X5' })];
    expect(resolveTouchAttackCodes(sorted, 1)).toEqual({ setterCall: 'K1', combinationCode: null, ballType: null });
    expect(resolveTouchAttackCodes(sorted, 0)).toEqual({ setterCall: null, combinationCode: null, ballType: null });
    expect(resolveTouchAttackCodes(sorted, 5)).toEqual({ setterCall: null, combinationCode: null, ballType: null });
  });
});

describe('matchesAttackCodes', () => {
  const codes = { setterCall: 'K1', combinationCode: 'X5', ballType: 'Q' };

  it('passes when every chosen list holds (AND), an empty list meaning all', () => {
    expect(matchesAttackCodes(codes, {})).toBe(true);
    expect(matchesAttackCodes(codes, { setterCalls: ['K1'], combinationCodes: ['X5', 'V6'], attackBallTypes: ['Q'] })).toBe(true);
    expect(matchesAttackCodes(codes, { setterCalls: ['K1'], combinationCodes: ['V6'] })).toBe(false);
    expect(matchesAttackCodes(codes, { attackBallTypes: ['H'] })).toBe(false);
  });

  it('compares the chosen values case-insensitively and fails on a missing code', () => {
    expect(matchesAttackCodes(codes, { setterCalls: ['k1'], attackBallTypes: [' q'] })).toBe(true);
    expect(matchesAttackCodes({ ...codes, combinationCode: null }, { combinationCodes: ['X5'] })).toBe(false);
  });

  it('knows when a filter is set', () => {
    expect(hasAttackCodeFilter({})).toBe(false);
    expect(hasAttackCodeFilter({ setterCalls: [], combinationCodes: [''] })).toBe(false);
    expect(hasAttackCodeFilter({ attackBallTypes: ['H'] })).toBe(true);
  });
});

describe('rallyMatchesAttackCodes', () => {
  const rally = () => [
    touch('away', 'serve'),
    touch('home', 'receive'),
    touch('home', 'set', { setterCallCode: 'K1' }),
    touch('home', 'attack', { combinationCode: 'V6', attackType: 'Q' }),
    touch('away', 'dig'),
    touch('away', 'set', { setterCallCode: 'K7' }),
    touch('away', 'attack', { combinationCode: 'C1', attackType: 'Q' }),
    touch('home', 'dig'),
    touch('home', 'set', { setterCallCode: 'K2' }),
    touch('home', 'attack', { combinationCode: 'X5', attackType: 'H' }),
  ];

  it('keeps every rally without a filter', () => {
    expect(rallyMatchesAttackCodes(rally(), 'home', {})).toBe(true);
  });

  it('matches a Base through any set or attack of the team', () => {
    expect(rallyMatchesAttackCodes(rally(), 'home', { setterCalls: ['K2'] })).toBe(true);
    expect(rallyMatchesAttackCodes([touch('home', 'set', { setterCallCode: 'K1' })], 'home', { setterCalls: ['K1'] })).toBe(true);
    expect(rallyMatchesAttackCodes(rally(), 'home', { setterCalls: ['K7'] })).toBe(false);
  });

  it('wants Base and Combination on the same attack', () => {
    expect(rallyMatchesAttackCodes(rally(), 'home', { setterCalls: ['K1'], combinationCodes: ['X5'] })).toBe(false);
    expect(rallyMatchesAttackCodes(rally(), 'home', { setterCalls: ['K2'], combinationCodes: ['X5'] })).toBe(true);
  });

  it('filters by set type alone', () => {
    expect(rallyMatchesAttackCodes(rally(), 'home', { attackBallTypes: ['H'] })).toBe(true);
    expect(rallyMatchesAttackCodes(rally(), 'home', { attackBallTypes: ['M'] })).toBe(false);
    expect(rallyMatchesAttackCodes(rally(), 'home', { setterCalls: ['K1'], attackBallTypes: ['H'] })).toBe(false);
  });

  it("ignores the other team's touches", () => {
    expect(rallyMatchesAttackCodes(rally(), 'home', { combinationCodes: ['C1'] })).toBe(false);
    expect(rallyMatchesAttackCodes(rally(), 'away', { combinationCodes: ['C1'], setterCalls: ['K7'] })).toBe(true);
  });

  it('reads the touches in rally order whatever the order given', () => {
    const touches = rally();
    expect(rallyMatchesAttackCodes([...touches].reverse(), 'home', { setterCalls: ['K2'], combinationCodes: ['X5'] })).toBe(true);
  });
});

describe('collectAttackCodeOptions', () => {
  it('gives the Base and Combination codes as two sorted lists', () => {
    const rallies = [
      { touches: [touch('home', 'set', { setterCallCode: 'KE' }), touch('home', 'attack', { combinationCode: 'X9' })] },
      { touches: [touch('home', 'set', { setterCallCode: 'K2' }), touch('home', 'attack', { combinationCode: 'X5' }), touch('away', 'attack', { combinationCode: 'C1', setterCallCode: 'K7' })] },
      { touches: [touch('home', 'attack', { combinationCode: 'K1' })] },
    ];
    expect(collectAttackCodeOptions(rallies, (item) => item.teamSide === 'home')).toEqual({
      setterCalls: ['K1', 'K2', 'KE'],
      combinationCodes: ['X5', 'X9'],
    });
    expect(collectAttackCodeOptions(rallies, (item) => item.teamSide === 'home' && item.skill === 'attack').setterCalls).toEqual(['K1', 'K2', 'KE']);
    expect(collectAttackCodeOptions(rallies, (item) => item.teamSide === 'away')).toEqual({ setterCalls: ['K7'], combinationCodes: ['C1'] });
  });
});

describe('sortAttackCodes', () => {
  it('keeps each code once, in natural order', () => {
    expect(sortAttackCodes(['X5', 'K9', 'K10', 'K2', 'KC', 'X5'])).toEqual(['K2', 'K9', 'K10', 'KC', 'X5']);
  });
});
