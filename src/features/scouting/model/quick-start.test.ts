// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PlayerRole } from '@src/domain/systems';
import { buildQuickStartLineups, parseLineupJersey } from './quick-start';

const player = (jerseyNumber: number, isLibero = false) => ({ id: `p${jerseyNumber}`, jerseyNumber, isLibero, firstName: '', lastName: '' });
const home = { players: [1, 2, 3, 4, 5, 6, 7].map((n) => player(n)).concat(player(13, true), player(14, true)) } as never;
const away = { players: [] } as never;

describe('quick start lineups', () => {
  it('places jerseys, leaves the rest empty and keeps liberos off court', () => {
    const { home: lineup } = buildQuickStartLineups(home, away, { lineup: { 2: 2, 3: 3, 4: 13 } });
    const at = (position: number) => lineup.slots.find((slot) => slot.courtPosition === position)?.playerId || undefined;
    expect(at(2)).toBe('p2');
    expect(at(3)).toBe('p3');
    expect(at(4)).toBeUndefined();
    expect(at(1)).toBeUndefined();
  });

  it('rebuilds the role order from the setter', () => {
    const { home: lineup } = buildQuickStartLineups(home, away, { lineup: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 }, setterPosition: 4 });
    expect(lineup.setterPlayerId).toBe('p4');
    expect(lineup.slots.find((slot) => slot.courtPosition === 4)?.tacticalRole).toBe(PlayerRole.SETTER);
  });

  it('reads only plain jersey numbers', () => {
    expect(parseLineupJersey(' 7 ')).toBe(7);
    expect(parseLineupJersey('')).toBeUndefined();
    expect(parseLineupJersey('1a')).toBeUndefined();
  });

  it('takes the liberos named on the page', () => {
    const { home: lineup } = buildQuickStartLineups(home, away, { lineup: { 1: 1 }, liberos: [14] });
    expect(lineup.liberoPlayerIds).toEqual(['p14']);
    expect(lineup.liberoAutoMiddleReplacement).toBe(true);
  });

  it('propagates liberoAutoMiddleReplacement off/on to both starting lineups', () => {
    const off = buildQuickStartLineups(home, away, {
      lineup: { 1: 1 },
      liberos: [13],
      liberoAutoMiddleReplacement: false,
    });
    expect(off.home.liberoAutoMiddleReplacement).toBe(false);
    expect(off.away.liberoAutoMiddleReplacement).toBe(false);

    const on = buildQuickStartLineups(home, away, {
      lineup: { 1: 1 },
      liberos: [13],
      liberoAutoMiddleReplacement: true,
    });
    expect(on.home.liberoAutoMiddleReplacement).toBe(true);
    expect(on.away.liberoAutoMiddleReplacement).toBe(true);
  });
});
