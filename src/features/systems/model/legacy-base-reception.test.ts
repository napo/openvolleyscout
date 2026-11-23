// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CourtPosition } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { PlayerRole } from '@src/domain/systems';
import { resolveTacticalCourtPlayers } from '@src/features/scouting/live/tactical/positioning/tactical-position-resolver';
import { normalizeReceptionSystemBlock } from './reception-system-store';

// The base system as saved by releases before 0.7.0: rotation 3 had MB1
// receiving in zone 6 and MB2 at the net in 2; rotations 4 and 6 had overlaps.
const OLD_ROTATIONS: Record<number, Array<[PlayerRole, number, number]>> = {
  3: [
    [PlayerRole.MIDDLE_BLOCKER_1, 50.8462, 67.9087], [PlayerRole.MIDDLE_BLOCKER_2, 77, 22.3558],
    [PlayerRole.OPPOSITE, 73, 81.25], [PlayerRole.OUTSIDE_HITTER_1, 24.2308, 57.6923],
    [PlayerRole.OUTSIDE_HITTER_2, 75.1539, 59.0144], [PlayerRole.SETTER, 51.1538, 9.976],
  ],
  4: [
    [PlayerRole.MIDDLE_BLOCKER_1, 12.6923, 24.1587], [PlayerRole.MIDDLE_BLOCKER_2, 84.0769, 58.0529],
    [PlayerRole.OPPOSITE, 83.6154, 86.7789], [PlayerRole.OUTSIDE_HITTER_1, 54.5385, 63.8221],
    [PlayerRole.OUTSIDE_HITTER_2, 24.8462, 58.6538], [PlayerRole.SETTER, 5.7692, 6.4904],
  ],
};

function savedOldBaseSystem() {
  return JSON.parse(JSON.stringify({
    ...DEFAULT_RECEPTION_SYSTEM_BLOCK,
    rotations: DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.map((rotation) => (
      OLD_ROTATIONS[rotation.rotation]
        ? {
            rotation: rotation.rotation,
            positions: OLD_ROTATIONS[rotation.rotation].map(([role, x, y]) => ({ role, dataVolleyZone: '6', x, y })),
          }
        : rotation
    )),
  }));
}

describe('saved copy of an old base reception system', () => {
  it('is upgraded to the current base rotations', () => {
    const block = normalizeReceptionSystemBlock(savedOldBaseSystem())!;
    expect(block.rotations).toEqual(DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations);
  });

  it('keeps a rotation the user has redrawn', () => {
    const saved = savedOldBaseSystem();
    saved.rotations[2].positions[0].x = 40;
    const block = normalizeReceptionSystemBlock(saved)!;
    expect(block.rotations[2].positions.find((position) => position.role === PlayerRole.MIDDLE_BLOCKER_1)!.x).toBe(40);
    expect(block.rotations[3]).toEqual(DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations[3]);
  });

  it('keeps the middle at the net and the libero receiving, setter in 3, libero in for MB2', () => {
    // Reported case: setter at P3, MB1 (26) front row in 2, libero (2) in for MB2 (14) in 5.
    const players = [1, 8, 14, 4, 11, 26, 2].map((jerseyNumber) => ({
      id: `p${jerseyNumber}`, jerseyNumber, firstName: '', lastName: '', shortName: '', playerCode: '',
      isLibero: jerseyNumber === 2,
    }));
    const team: Team = { id: 't', name: 'T', code: 'T', staff: { headCoach: '', assistantCoach: '' }, players };
    const slot = (courtPosition: number, jersey: number, tacticalRole: PlayerRole, extra = {}) => ({
      courtPosition: courtPosition as CourtPosition, playerId: `p${jersey}`, tacticalRole, ...extra,
    });
    const lineup: ActiveLineup = {
      teamSide: 'home', setterPlayerId: 'p1', liberoPlayerIds: ['p2'],
      slots: [
        slot(1, 11, PlayerRole.OUTSIDE_HITTER_2), slot(2, 26, PlayerRole.MIDDLE_BLOCKER_1),
        slot(3, 1, PlayerRole.SETTER), slot(4, 8, PlayerRole.OUTSIDE_HITTER_1),
        slot(5, 2, PlayerRole.MIDDLE_BLOCKER_2, { isLibero: true, replacedPlayerId: 'p14' }),
        slot(6, 4, PlayerRole.OPPOSITE),
      ],
      personnelState: {
        onCourtPlayerIds: ['p11', 'p26', 'p1', 'p8', 'p2', 'p4'], benchPlayerIds: ['p14'],
        substitutionPairs: [], substitutionHistory: [], liberoAutoMiddleReplacement: true,
        activeLiberoState: {
          teamSide: 'home', liberoPlayerId: 'p2', replacedPlayerId: 'p14',
          replacedPlayerRole: PlayerRole.MIDDLE_BLOCKER_2, enteredAtRallyNumber: 11,
        },
      },
    } as ActiveLineup;
    const markers = resolveTacticalCourtPlayers({
      teamSide: 'home', team, lineup, phase: 'reception', displaySide: 'right',
      receptionSystemBlock: normalizeReceptionSystemBlock(savedOldBaseSystem()),
    });
    const depth = (jersey: number) => markers.find((marker) => marker.jerseyNumber === jersey)!.x - 50;
    expect(depth(26)).toBeLessThan(depth(8));
    expect(depth(26)).toBeLessThan(depth(2));
    expect(markers.find((marker) => marker.jerseyNumber === 2)!.isLibero).toBe(true);
  });
});
