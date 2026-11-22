// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { PlayerRole } from '@src/domain/systems';
import { ROLE_ORDER_SEQUENCES } from '@src/domain/systems/formations';
import { SCOUTING_SIDE_WIDTH } from '@src/domain/spatial';
import { rotateLineupForSideOut } from '../tactical-rotation';
import type { TeamTacticalPhase } from '../tactical-transition';
import { resolveTacticalCourtPlayers } from './tactical-position-resolver';
import { getCourtPositionCoordinate } from './court-coordinates';

const phases: TeamTacticalPhase[] = [
  'reception', 'serving_prepare', 'break_point_defense', 'break_point_setter_release',
  'after_reception_setter_release', 'side_out_defense', 'side_out_setter_release',
];
const team: Team = {
  id: 'team', code: 'T', name: 'Team', staff: { headCoach: '', assistantCoach: '' },
  players: ['O2', 'H1', 'M1', 'S2', 'H2', 'M2', 'L'].map((id, index) => ({
    id, jerseyNumber: index + 1, firstName: id, lastName: '', shortName: id, playerCode: id,
    role: id === 'L' ? 'libero' : id === 'S2' ? 'setter' : 'middle_blocker', isLibero: id === 'L',
  })),
};

// After a setter/opposite double change at P1, the new setter is at P4.
// Keep the old role tags, as in existing saved matches.
function afterDoubleChange(teamSide: TeamSide): ActiveLineup {
  return {
    teamSide, setterPlayerId: 'S2', liberoPlayerIds: ['L'], rotationIndex: 1,
    slots: ['O2', 'H1', 'M1', 'S2', 'H2', 'L'].map((playerId, index) => ({
      playerId, courtPosition: (index + 1) as CourtPosition,
      tacticalRole: ROLE_ORDER_SEQUENCES.PSC[index],
      ...(playerId === 'L' ? { isLibero: true, replacedPlayerId: 'M2' } : {}),
    })),
    personnelState: {
      onCourtPlayerIds: ['O2', 'H1', 'M1', 'S2', 'H2', 'L'], benchPlayerIds: ['M2'],
      substitutionPairs: [], substitutionHistory: [], liberoAutoMiddleReplacement: true,
      activeLiberoState: {
        teamSide, liberoPlayerId: 'L', replacedPlayerId: 'M2',
        replacedPlayerRole: PlayerRole.MIDDLE_BLOCKER_1, enteredAtRallyNumber: 1,
      },
    },
  };
}

const depthFromNet = (x: number) => Math.abs(x - 50) / SCOUTING_SIDE_WIDTH * 100;

describe('libero court coordinates after a double change', () => {
  for (const teamSide of ['home', 'away'] as const) {
    for (const displaySide of ['left', 'right'] as const) {
      it(`keeps ${teamSide} libero in the back row on the ${displaySide} half through every phase and rotation`, () => {
        let lineup = afterDoubleChange(teamSide);
        for (let rotation = 0; rotation < 6; rotation += 1) {
          for (const phase of phases) {
            const markers = resolveTacticalCourtPlayers({ teamSide, team, lineup, phase, displaySide });
            expect(markers).toHaveLength(6);
            expect(new Set(markers.map((marker) => marker.playerId)).size).toBe(6);
            const liberoSlot = lineup.slots.find((slot) => slot.playerId === 'L')!;
            if ([2, 3, 4].includes(liberoSlot.courtPosition)) {
              expect(markers.some((marker) => marker.playerId === 'L')).toBe(false);
              expect(markers.find((marker) => marker.playerId === 'M2')?.courtPosition).toBe(liberoSlot.courtPosition);
            }
            for (const marker of markers.filter((marker) => marker.playerId === 'L' || marker.isLibero)) {
              expect([1, 5, 6]).toContain(marker.courtPosition);
              expect(depthFromNet(marker.x)).toBeGreaterThan(100 / 3);
            }
          }
          lineup = rotateLineupForSideOut(lineup);
        }
      });

      it(`repairs front-row drawing coordinates from a saved system for ${teamSide} on the ${displaySide} half`, () => {
        const lineup = afterDoubleChange(teamSide);
        // A saved asset may retain the old middle labels after its role order changes.
        // Logical courtPosition remains 6, while the drawing puts that middle at the net.
        const swapMiddleRole = (role: PlayerRole) => role === PlayerRole.MIDDLE_BLOCKER_1
          ? PlayerRole.MIDDLE_BLOCKER_2
          : role === PlayerRole.MIDDLE_BLOCKER_2 ? PlayerRole.MIDDLE_BLOCKER_1 : role;
        const receptionSystemBlock = {
          ...DEFAULT_RECEPTION_SYSTEM_BLOCK,
          rotations: DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.map((entry) => ({
            ...entry, positions: entry.positions.map((position) => ({ ...position, role: swapMiddleRole(position.role) })),
          })),
        };
        const defenseSystemBlock = {
          ...DEFAULT_DEFENSE_SYSTEM_BLOCK,
          contexts: Object.fromEntries(Object.entries(DEFAULT_DEFENSE_SYSTEM_BLOCK.contexts).map(([context, entries]) => [
            context, entries.map((entry) => ({
              ...entry, positions: entry.positions.map((position) => ({ ...position, role: swapMiddleRole(position.role) })),
            })),
          ])) as typeof DEFAULT_DEFENSE_SYSTEM_BLOCK.contexts,
        };
        const before = structuredClone(lineup);
        for (const phase of phases) {
          const markers = resolveTacticalCourtPlayers({
            teamSide, team, lineup, phase, displaySide, receptionSystemBlock, defenseSystemBlock,
          });
          const libero = markers.find((marker) => marker.playerId === 'L')!;
          expect(libero.isLibero).toBe(true);
          expect(libero.courtPosition).toBe(6);
          expect(depthFromNet(libero.x)).toBeGreaterThan(100 / 3);
          expect({ x: libero.x, y: libero.y }).toEqual(getCourtPositionCoordinate(displaySide, 6));
          expect(markers).toHaveLength(6);
          // Ordinary players still use the chosen drawing.
          expect(depthFromNet(markers.find((marker) => marker.playerId === 'M1')!.x)).toBeGreaterThan(100 / 3);
        }
        expect(lineup).toEqual(before);
      });
    }
  }
});
