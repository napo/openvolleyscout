// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PlayerRole } from '@src/domain/systems/types';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { getCurrentSetterRotation, getTeamRolePlayerMap } from './tactical-role-mapping';

const ROLE_SEQUENCE: readonly PlayerRole[] = [
  PlayerRole.SETTER,
  PlayerRole.OUTSIDE_HITTER_1,
  PlayerRole.MIDDLE_BLOCKER_1,
  PlayerRole.OPPOSITE,
  PlayerRole.OUTSIDE_HITTER_2,
  PlayerRole.MIDDLE_BLOCKER_2,
];

const mkPlayer = (id: string, jerseyNumber: number, role: Player['role']): Player => ({
  id,
  jerseyNumber,
  firstName: `P${jerseyNumber}`,
  lastName: '',
  shortName: `P${jerseyNumber}`,
  playerCode: `P${jerseyNumber}`,
  role,
});

describe('tactical-role-mapping double substitution', () => {
  it('swaps setter and opposite tactical roles after a setter-opposite double change', () => {
    const teamPlayers: Player[] = [
      mkPlayer('p26', 26, 'opposite'),
      mkPlayer('p10', 10, 'outside_hitter'),
      mkPlayer('p22', 22, 'middle_blocker'),
      mkPlayer('p14', 14, 'setter'),
      mkPlayer('p21', 21, 'outside_hitter'),
      mkPlayer('p9', 9, 'middle_blocker'),
    ];

    // After ac16:26 (Z1) and ac08:14 (Z4), slots still carry the original tacticalRole tags
    // from before the double change, while setterPlayerId moved to p14 in Z4.
    const lineup: ActiveLineup = {
      teamSide: 'away',
      rotationIndex: 1,
      setterPlayerId: 'p14',
      liberoPlayerIds: [],
      personnelState: {
        onCourtPlayerIds: ['p26', 'p10', 'p22', 'p14', 'p21', 'p9'],
        benchPlayerIds: [],
        substitutionPairs: [],
        substitutionHistory: [],
        liberoAutoMiddleReplacement: false,
      },
      slots: [
        { courtPosition: 1, playerId: 'p26', tacticalRole: PlayerRole.SETTER },
        { courtPosition: 2, playerId: 'p10', tacticalRole: PlayerRole.OUTSIDE_HITTER_1 },
        { courtPosition: 3, playerId: 'p22', tacticalRole: PlayerRole.MIDDLE_BLOCKER_1 },
        { courtPosition: 4, playerId: 'p14', tacticalRole: PlayerRole.OPPOSITE },
        { courtPosition: 5, playerId: 'p21', tacticalRole: PlayerRole.OUTSIDE_HITTER_2 },
        { courtPosition: 6, playerId: 'p9', tacticalRole: PlayerRole.MIDDLE_BLOCKER_2 },
      ],
    };

    expect(getCurrentSetterRotation(lineup, ROLE_SEQUENCE)).toBe(4);
    const roleMap = getTeamRolePlayerMap({ roleSequence: ROLE_SEQUENCE, lineup, teamPlayers });
    expect(roleMap.get(PlayerRole.SETTER)?.id).toBe('p14');
    expect(roleMap.get(PlayerRole.OPPOSITE)?.id).toBe('p26');
    expect(roleMap.get(PlayerRole.OUTSIDE_HITTER_1)?.id).toBe('p10');
    expect(roleMap.get(PlayerRole.MIDDLE_BLOCKER_1)?.id).toBe('p22');
  });
});
