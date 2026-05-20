import type { TeamSide } from '@src/domain/common/enums';

export function getTeamScopedPlayerKey(teamSide: TeamSide, playerId: string): string {
  return `${teamSide}:${playerId}`;
}
