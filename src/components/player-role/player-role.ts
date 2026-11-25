// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The role of an athlete for the filters: setter, outside hitter, opposite, middle, libero.
 * Taken from the team list first, then from the role the base system gave the athlete in
 * the starting lineups, then from the libero flag.
 *
 * Runs under ts-node too: relative and type-only imports only.
 */
import type { PlayerRole } from '../../domain/common/enums';
import type { StartingLineup } from '../../domain/lineup/types';

export type RoleGroup = 'setter' | 'outside' | 'opposite' | 'middle' | 'libero';
export const ROLE_GROUPS: readonly RoleGroup[] = ['setter', 'outside', 'opposite', 'middle', 'libero'];

export const ROLE_GROUP_SHORT_KEYS = {
  setter: 'roleShortSetter',
  outside: 'roleShortOutside',
  opposite: 'roleShortOpposite',
  middle: 'roleShortMiddle',
  libero: 'roleShortLibero',
} as const satisfies Record<RoleGroup, string>;

export const ROLE_GROUP_NAME_KEYS = {
  setter: 'roleNameSetter',
  outside: 'roleNameOutside',
  opposite: 'roleNameOpposite',
  middle: 'roleNameMiddle',
  libero: 'roleNameLibero',
} as const satisfies Record<RoleGroup, string>;

/** Accepts both the roster roles (outside_hitter) and the system roles (OUTSIDE_HITTER_1). */
export function roleGroupOf(role: string | undefined | null): RoleGroup | null {
  if (!role) return null;
  const value = role.toLowerCase();
  if (value.startsWith('setter')) return 'setter';
  if (value.startsWith('outside')) return 'outside';
  if (value.startsWith('opposite')) return 'opposite';
  if (value.startsWith('middle')) return 'middle';
  if (value.startsWith('libero')) return 'libero';
  return null;
}

/** The role each athlete played most often in the starting lineups (from the base system). */
export function lineupRoles(lineups: readonly StartingLineup[]): Map<string, PlayerRole> {
  const counts = new Map<string, Map<RoleGroup, number>>();
  for (const lineup of lineups) {
    for (const slot of lineup.slots) {
      const group = roleGroupOf(slot.tacticalRole);
      if (!group || !slot.playerId) continue;
      const byRole = counts.get(slot.playerId) ?? new Map<RoleGroup, number>();
      byRole.set(group, (byRole.get(group) ?? 0) + 1);
      counts.set(slot.playerId, byRole);
    }
    for (const id of lineup.liberoPlayerIds ?? []) {
      const byRole = counts.get(id) ?? new Map<RoleGroup, number>();
      byRole.set('libero', (byRole.get('libero') ?? 0) + 1);
      counts.set(id, byRole);
    }
  }
  const toRole: Record<RoleGroup, PlayerRole> = {
    setter: 'setter', outside: 'outside_hitter', opposite: 'opposite', middle: 'middle_blocker', libero: 'libero',
  };
  const result = new Map<string, PlayerRole>();
  for (const [playerId, byRole] of counts) {
    const best = [...byRole.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) result.set(playerId, toRole[best[0]]);
  }
  return result;
}

export interface RoleSource {
  role?: string | null;
  /** Role from the lineups, used when the team list has none. */
  lineupRole?: string | null;
  isLibero?: boolean;
}

export function resolveRoleGroup(player: RoleSource): RoleGroup | null {
  return roleGroupOf(player.role) ?? roleGroupOf(player.lineupRole) ?? (player.isLibero ? 'libero' : null);
}
