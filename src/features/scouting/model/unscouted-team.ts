// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A team entered by name only (empty match roster) is not scouted player by
 * player: its touches are recorded for the team, with no player, like the
 * DataVolley `$$` code and like a team-only DVW import.
 *
 * On the court such a team shows one "team" marker instead of six empty
 * positions, so the live flow keeps working unchanged: wherever it asks for a
 * player of that team, the scout taps the team marker. The marker's id never
 * reaches stored data (see stripTeamPlaceholderPlayer).
 */
import type { Team } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';

export const TEAM_PLACEHOLDER_PLAYER_ID = '__team__';

export function isUnscoutedTeam(team: Pick<Team, 'players'> | null | undefined): boolean {
  return Boolean(team) && team!.players.length === 0;
}

export function isTeamPlaceholderPlayerId(playerId: string | null | undefined): boolean {
  return playerId === TEAM_PLACEHOLDER_PLAYER_ID;
}

/** Short label for the team marker: the first letters of the team name. */
export function getTeamMarkerLabel(teamName: string): string {
  const letters = teamName.replace(/[^\p{L}\p{N}]/gu, '');
  return (letters.slice(0, 3) || '?').toUpperCase();
}

/** Drops the team marker id: the touch belongs to the team, with no player. */
export function stripTeamPlaceholderPlayer<T extends Pick<BallTouch, 'playerId'>>(touch: T): T {
  if (!isTeamPlaceholderPlayerId(touch.playerId)) return touch;
  const { playerId: _omit, ...rest } = touch;
  return rest as T;
}
