// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { predictAttackerPlayerId } from './predict-attacker';

const p = (playerId: string, x: number, y: number, isLibero = false) => ({ id: playerId, playerId, courtPosition: 1 as const, jerseyNumber: playerId, x, y, isLibero });

describe('predictAttackerPlayerId', () => {
  const players = [p('a', 56, 25), p('b', 56, 50), p('c', 56, 75), p('lib', 57, 74, true)];

  it('picks the closest player to the attack start', () => {
    expect(predictAttackerPlayerId({ players, attackStart: { x: 58, y: 72 } })).toBe('c');
  });

  it('skips liberos and excluded players', () => {
    expect(predictAttackerPlayerId({ players, attackStart: { x: 57, y: 74 }, excludedPlayerIds: ['c'] })).toBe('b');
  });

  it('has no guess without a start point', () => {
    expect(predictAttackerPlayerId({ players, attackStart: null })).toBeNull();
  });
});
