// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { countRalliesByPlayer, sortPlayers } from './player-sort';

const players = [
  { id: 'a', jerseyNumber: 12, firstName: 'Anna', lastName: 'Zeta', rallies: 30 },
  { id: 'b', jerseyNumber: 3, firstName: 'Carla', lastName: 'Bianchi', rallies: 55 },
  { id: 'c', jerseyNumber: 7, firstName: 'Bea', lastName: 'Rossi', rallies: 55 },
];
const ids = (list: typeof players) => list.map((player) => player.id).join('');

describe('athlete sorting', () => {
  it('sorts by number, surname, first name and rallies (most first, ties by number)', () => {
    expect(ids(sortPlayers(players, 'number'))).toBe('bca');
    expect(ids(sortPlayers(players, 'lastName'))).toBe('bca');
    expect(ids(sortPlayers(players, 'firstName'))).toBe('acb');
    expect(ids(sortPlayers(players, 'rallies'))).toBe('bca');
  });

  it('counts each rally once per athlete', () => {
    const counts = countRalliesByPlayer([
      { touches: [{ playerId: 'a' }, { playerId: 'a' }, { playerId: 'b' }] },
      { touches: [{ playerId: 'a' }, {}] },
    ]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
  });
});
