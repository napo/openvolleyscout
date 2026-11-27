// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  ATTACK_BALL_TYPES,
  isAttackBallType,
  normalizeTouchCode,
  splitBaseCodeSelection,
} from './code-tables';

describe('attack ball types', () => {
  it('lists the seven DataVolley letters', () => {
    expect([...ATTACK_BALL_TYPES]).toEqual(['H', 'M', 'Q', 'T', 'U', 'N', 'O']);
  });

  it('accepts only the exact letters', () => {
    expect(isAttackBallType('Q')).toBe(true);
    expect(isAttackBallType('O')).toBe(true);
    expect(isAttackBallType('q')).toBe(false);
    expect(isAttackBallType('X')).toBe(false);
    expect(isAttackBallType('')).toBe(false);
    expect(isAttackBallType(null)).toBe(false);
    expect(isAttackBallType(undefined)).toBe(false);
  });
});

describe('normalizeTouchCode', () => {
  it('trims and upper-cases, and gives null for an empty code', () => {
    expect(normalizeTouchCode(' k1 ')).toBe('K1');
    expect(normalizeTouchCode('x5')).toBe('X5');
    expect(normalizeTouchCode('   ')).toBeNull();
    expect(normalizeTouchCode('')).toBeNull();
    expect(normalizeTouchCode(null)).toBeNull();
    expect(normalizeTouchCode(undefined)).toBeNull();
  });
});

describe('splitBaseCodeSelection', () => {
  it('moves the K codes of an old combined list to the setter calls', () => {
    expect(splitBaseCodeSelection(['K1', 'X5', 'k7'], { setterCalls: ['K2'] })).toEqual({
      setterCalls: ['K1', 'K7', 'K2'],
      combinationCodes: ['X5'],
    });
  });

  it('accepts a single value, "all" and nothing', () => {
    expect(splitBaseCodeSelection('K2')).toEqual({ setterCalls: ['K2'], combinationCodes: [] });
    expect(splitBaseCodeSelection('V6')).toEqual({ setterCalls: [], combinationCodes: ['V6'] });
    expect(splitBaseCodeSelection('all')).toEqual({ setterCalls: [], combinationCodes: [] });
    expect(splitBaseCodeSelection(undefined)).toEqual({ setterCalls: [], combinationCodes: [] });
    expect(splitBaseCodeSelection(42)).toEqual({ setterCalls: [], combinationCodes: [] });
  });

  it('upper-cases, trims and keeps each code once', () => {
    expect(splitBaseCodeSelection([' x5', 'X5', 'k1', 'K1', ''])).toEqual({
      setterCalls: ['K1'],
      combinationCodes: ['X5'],
    });
  });

  it('moves a K code found among the current combinations and keeps the current lists', () => {
    expect(splitBaseCodeSelection(undefined, { setterCalls: ['K2'], combinationCodes: ['V6', 'K1'] })).toEqual({
      setterCalls: ['K2', 'K1'],
      combinationCodes: ['V6'],
    });
    expect(splitBaseCodeSelection(['X5'], { combinationCodes: ['X5', 'C1'] })).toEqual({
      setterCalls: [],
      combinationCodes: ['X5', 'C1'],
    });
  });

  it('is idempotent', () => {
    const once = splitBaseCodeSelection(['K1', 'x5', 'KE'], { setterCalls: ['K7'], combinationCodes: ['V6', 'K2'] });
    expect(splitBaseCodeSelection(undefined, once)).toEqual(once);
    expect(splitBaseCodeSelection([], once)).toEqual(once);
  });
});
