// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { StartingLineup } from '../../domain/lineup/types';
import { PlayerRole as SystemRole } from '../../domain/systems/types';
import { lineupRoles, resolveRoleGroup, roleGroupOf } from './player-role';

const lineup = (slots: Array<[string, SystemRole]>, liberos: string[] = []): StartingLineup => ({
  teamSide: 'home', liberoPlayerIds: liberos, displaySide: 'left',
  slots: slots.map(([playerId, tacticalRole], i) => ({ courtPosition: (i + 1) as 1, playerId, tacticalRole })),
});

describe('player roles', () => {
  it('reads roster and system roles alike', () => {
    expect(roleGroupOf('outside_hitter')).toBe('outside');
    expect(roleGroupOf(SystemRole.MIDDLE_BLOCKER_2)).toBe('middle');
    expect(roleGroupOf('defensive_specialist')).toBeNull();
  });

  it('takes the most frequent lineup role, the team list first, the libero flag last', () => {
    const roles = lineupRoles([
      lineup([['a', SystemRole.SETTER], ['b', SystemRole.OPPOSITE]], ['l']),
      lineup([['a', SystemRole.SETTER], ['b', SystemRole.OUTSIDE_HITTER_1]]),
      lineup([['b', SystemRole.OUTSIDE_HITTER_2]]),
    ]);
    expect(roles.get('a')).toBe('setter');
    expect(roles.get('b')).toBe('outside_hitter');
    expect(roles.get('l')).toBe('libero');
    expect(resolveRoleGroup({ role: 'opposite', lineupRole: roles.get('b') })).toBe('opposite');
    expect(resolveRoleGroup({ lineupRole: roles.get('b') })).toBe('outside');
    expect(resolveRoleGroup({ isLibero: true })).toBe('libero');
    expect(resolveRoleGroup({})).toBeNull();
  });
});
