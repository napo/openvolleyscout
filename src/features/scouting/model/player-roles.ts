// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchProject } from '@src/domain/match/types';
import type { PlayerRoleLookup } from '@src/domain/lineup/setter-after-substitution';

/** Roster roles of both teams, by player id: lets a replay tell a setter from a stand-in. */
export function createPlayerRoleLookup(
  project: Pick<MatchProject, 'homeSelection' | 'awaySelection' | 'homeTeam' | 'awayTeam'> | null | undefined,
): PlayerRoleLookup {
  const roles = new Map<string, string>();
  const add = (players: ReadonlyArray<{ id: string; role?: string }> | undefined) => {
    players?.forEach((player) => { if (player.role) roles.set(player.id, player.role); });
  };
  add(project?.homeTeam?.players);
  add(project?.awayTeam?.players);
  add(project?.homeSelection?.roster);
  add(project?.awaySelection?.roster);
  return (playerId) => roles.get(playerId);
}
