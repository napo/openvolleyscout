// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { parseDataVolleyInput } from './code-parser';
import { buildPendingTouchesFromParsed } from './pending-touch-builder';

const homePlayers: Player[] = [
  { id: 'h1', jerseyNumber: 1, firstName: 'Home', lastName: 'Server', shortName: 'H1', playerCode: 'H1', role: 'setter', isCaptain: false, isLibero: false },
];
const awayPlayers: Player[] = [
  { id: 'a5', jerseyNumber: 5, firstName: 'Away', lastName: 'Receiver', shortName: 'A5', playerCode: 'A5', role: 'outside_hitter', isCaptain: false, isLibero: false },
];
const homeLineup = {
  teamSide: 'home',
  setterPlayerId: 'h1',
  liberoPlayerIds: [],
  slots: [
    { courtPosition: 1, playerId: 'h1' },
    { courtPosition: 2, playerId: 'h2' },
    { courtPosition: 3, playerId: 'h3' },
    { courtPosition: 4, playerId: 'h4' },
    { courtPosition: 5, playerId: 'h5' },
    { courtPosition: 6, playerId: 'h6' },
  ],
} as unknown as ActiveLineup;

describe('buildPendingTouchesFromParsed inferred serve zones', () => {
  it('assigns startZoneCode and endZoneCode consistently with ballDirection for two-zone receptions', () => {
    const parsed = parseDataVolleyInput('a05RM+~~~16');
    const touches = buildPendingTouchesFromParsed(parsed, {
      homeLineup,
      awayLineup: null,
      homePlayers,
      awayPlayers,
      currentRallyTouches: [],
      servingTeam: 'home',
      recordedAtIso: '2026-11-22T10:00:00.000Z',
      recordedAtTime: '10.00.00',
    });

    const inferredServe = touches.find((touch) => touch.skill === 'serve' && touch.source === 'inferred');
    expect(inferredServe).toBeDefined();
    expect(inferredServe?.startZoneCode).toBe('1');
    expect(inferredServe?.endZoneCode).toBe('6');
    expect(inferredServe?.ballDirection?.courtZoneStart).toBe('1');
    expect(inferredServe?.ballDirection?.courtZoneEnd).toBe('6');
  });

  it('keeps single-zone compact reception code as serve endZoneCode', () => {
    const parsed = parseDataVolleyInput('a05R+6');
    const touches = buildPendingTouchesFromParsed(parsed, {
      homeLineup,
      awayLineup: null,
      homePlayers,
      awayPlayers,
      currentRallyTouches: [],
      servingTeam: 'home',
      recordedAtIso: '2026-11-22T10:00:00.000Z',
      recordedAtTime: '10.00.00',
    });

    const inferredServe = touches.find((touch) => touch.skill === 'serve' && touch.source === 'inferred');
    expect(inferredServe).toBeDefined();
    expect(inferredServe?.startZoneCode).toBeUndefined();
    expect(inferredServe?.endZoneCode).toBe('6');
  });
});
