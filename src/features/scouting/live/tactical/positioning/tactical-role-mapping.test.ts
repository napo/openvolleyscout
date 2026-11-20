// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PlayerRole } from '@src/domain/systems/types';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { getCurrentSetterRotation, getTeamRolePlayerMap } from './tactical-role-mapping';
import { resolveTacticalCourtPlayers } from './tactical-position-resolver';

const ROLE_SEQUENCE: readonly PlayerRole[] = [
  PlayerRole.SETTER,
  PlayerRole.OUTSIDE_HITTER_1,
  PlayerRole.MIDDLE_BLOCKER_1,
  PlayerRole.OPPOSITE,
  PlayerRole.OUTSIDE_HITTER_2,
  PlayerRole.MIDDLE_BLOCKER_2,
];

const mkPlayer = (id: string, jerseyNumber: number, role: Player['role'], isLibero = false): Player => ({
  id,
  jerseyNumber,
  firstName: `P${jerseyNumber}`,
  lastName: '',
  shortName: `P${jerseyNumber}`,
  playerCode: `P${jerseyNumber}`,
  role,
  isLibero,
});

describe('tactical-role-mapping double substitution', () => {
  it('re-aligns all six roles around the new setter and keeps the back-row libero out of the front row', () => {
    const teamPlayers: Player[] = [
      mkPlayer('p26', 26, 'opposite'),
      mkPlayer('p10', 10, 'outside_hitter'),
      mkPlayer('p22', 22, 'middle_blocker'),
      mkPlayer('p14', 14, 'setter'),
      mkPlayer('p21', 21, 'outside_hitter'),
      mkPlayer('p9', 9, 'middle_blocker'),
      mkPlayer('lib5', 5, 'libero', true),
    ];

    // After ac16:26 (Z1) and ac08:14 (Z4), slots still carry the original tacticalRole tags
    // from before the double change, while setterPlayerId moved to p14 in Z4 and libero #5
    // is replacing middle #9 in back-row Z6.
    const lineup: ActiveLineup = {
      teamSide: 'away',
      rotationIndex: 1,
      setterPlayerId: 'p14',
      liberoPlayerIds: ['lib5'],
      personnelState: {
        onCourtPlayerIds: ['p26', 'p10', 'p22', 'p14', 'p21', 'lib5'],
        benchPlayerIds: ['p9'],
        substitutionPairs: [],
        substitutionHistory: [],
        liberoAutoMiddleReplacement: true,
        activeLiberoState: {
          teamSide: 'away',
          liberoPlayerId: 'lib5',
          replacedPlayerId: 'p9',
          replacedPlayerRole: PlayerRole.MIDDLE_BLOCKER_2,
          enteredAtRallyNumber: 1,
          mustExitBeforeFrontRow: false,
        },
      },
      slots: [
        { courtPosition: 1, playerId: 'p26', tacticalRole: PlayerRole.SETTER },
        { courtPosition: 2, playerId: 'p10', tacticalRole: PlayerRole.OUTSIDE_HITTER_1 },
        { courtPosition: 3, playerId: 'p22', tacticalRole: PlayerRole.MIDDLE_BLOCKER_1 },
        { courtPosition: 4, playerId: 'p14', tacticalRole: PlayerRole.OPPOSITE },
        { courtPosition: 5, playerId: 'p21', tacticalRole: PlayerRole.OUTSIDE_HITTER_2 },
        { courtPosition: 6, playerId: 'lib5', tacticalRole: PlayerRole.MIDDLE_BLOCKER_2, isLibero: true, replacedPlayerId: 'p9' },
      ],
    };

    expect(getCurrentSetterRotation(lineup, ROLE_SEQUENCE)).toBe(4);

    // Base role mapping (with p9 restored in Z6) must align every role to the physical
    // player sequence around the new setter in Z4: Z4=P, Z5=S1, Z6=C1, Z1=O, Z2=S2, Z3=C2.
    const baseLineup: ActiveLineup = {
      ...lineup,
      slots: lineup.slots.map((s) => (s.courtPosition === 6 ? { ...s, playerId: 'p9', isLibero: false, replacedPlayerId: undefined } : s)),
    };
    const roleMap = getTeamRolePlayerMap({ roleSequence: ROLE_SEQUENCE, lineup: baseLineup, teamPlayers });
    expect(roleMap.get(PlayerRole.SETTER)?.id).toBe('p14');
    expect(roleMap.get(PlayerRole.OUTSIDE_HITTER_1)?.id).toBe('p21');
    expect(roleMap.get(PlayerRole.MIDDLE_BLOCKER_1)?.id).toBe('p9');
    expect(roleMap.get(PlayerRole.OPPOSITE)?.id).toBe('p26');
    expect(roleMap.get(PlayerRole.OUTSIDE_HITTER_2)?.id).toBe('p10');
    expect(roleMap.get(PlayerRole.MIDDLE_BLOCKER_2)?.id).toBe('p22');

    // Resolved tactical court coordinates on the left side (net at x=50, backline at x=0):
    // libero #5 must remain in back-row Z6 (further from the net than front-row middle #22 in Z3).
    const resolved = resolveTacticalCourtPlayers({
      teamSide: 'away',
      team: { id: 'away', code: 'AWY', name: 'Away', players: teamPlayers, staff: { headCoach: '', assistantCoach: '' } },
      lineup,
      phase: 'side_out_defense',
      displaySide: 'left',
      defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
      receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    });

    const libero = resolved.find((p) => p.playerId === 'lib5');
    const frontMiddle = resolved.find((p) => p.playerId === 'p22');
    const newSetter = resolved.find((p) => p.playerId === 'p14');
    const newOpposite = resolved.find((p) => p.playerId === 'p26');

    expect(libero).toBeDefined();
    expect(libero?.isLibero).toBe(true);
    expect(libero?.courtPosition).toBe(6);
    expect(frontMiddle?.courtPosition).toBe(3);
    expect(newSetter?.courtPosition).toBe(4);
    expect(newOpposite?.courtPosition).toBe(1);
    // On the left half-court (0..50, net at 50), back-row libero x must be strictly smaller than front-row middle x.
    expect(libero!.x).toBeLessThan(frontMiddle!.x);
  });
});
