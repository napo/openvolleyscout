// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { resolveSelectedPlayers, togglePlayerId } from './dashboard-selectors';

const stats = {
  playerStats: [
    { playerId: 'h1', teamSide: 'home', playerName: 'A', jerseyNumber: 1 },
    { playerId: 'h2', teamSide: 'home', playerName: 'B', jerseyNumber: 2 },
    { playerId: 'a1', teamSide: 'away', playerName: 'C', jerseyNumber: 3 },
  ],
} as unknown as MatchStats;

describe('resolveSelectedPlayers', () => {
  it('keeps the order the athletes were picked in', () => {
    expect(resolveSelectedPlayers(stats, ['a1', 'h1']).map((p) => p.playerId)).toEqual(['a1', 'h1']);
  });

  it('drops unknown ids and duplicates', () => {
    expect(resolveSelectedPlayers(stats, ['h2', 'zz', 'h2']).map((p) => p.playerId)).toEqual(['h2']);
  });

  it('on a team page drops athletes of the other team', () => {
    expect(resolveSelectedPlayers(stats, ['h1', 'a1', 'h2'], 'home').map((p) => p.playerId)).toEqual(['h1', 'h2']);
  });

  it('returns nothing for an empty selection', () => {
    expect(resolveSelectedPlayers(stats, [])).toEqual([]);
  });
});

describe('togglePlayerId', () => {
  it('adds an absent athlete at the end and removes a present one', () => {
    expect(togglePlayerId(['h1'], 'h2')).toEqual(['h1', 'h2']);
    expect(togglePlayerId(['h1', 'h2'], 'h1')).toEqual(['h2']);
  });

  it('does not mutate its input', () => {
    const input = ['h1'];
    togglePlayerId(input, 'h2');
    expect(input).toEqual(['h1']);
  });
});
