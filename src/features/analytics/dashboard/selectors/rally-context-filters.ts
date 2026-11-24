// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';

/**
 * The rally-context filters of the analysis dashboards: rotation, score
 * situation, server, receiver and attacker. One implementation, so every
 * widget (team, player, situation, radar, heatmaps) filters the same way.
 *
 * Rotation and score situation are read from a team's point of view: the team
 * whose numbers are shown (for touches, the team of the touch). "Rotation 1"
 * is P1 of that team, "leading" means that team was ahead before the rally.
 * Server, receiver and attacker keep the rallies in which that player served,
 * received or attacked.
 */
export type RallyContextFilters = Pick<DashboardFilters, 'rotation' | 'scoreRange' | 'server' | 'receiver' | 'attacker'>;

/** Points from which a set is in its final phase: 20 in sets to 25, 12 in a deciding set to 15. */
function finalPhaseThreshold(setTargetPoints: number | undefined): number {
  return setTargetPoints === 15 ? 12 : 20;
}

export function hasRallyContextFilter(filters: Partial<RallyContextFilters>): boolean {
  return (filters.rotation ?? 'all') !== 'all'
    || (filters.scoreRange ?? 'all') !== 'all'
    || (filters.server ?? 'all') !== 'all'
    || (filters.receiver ?? 'all') !== 'all'
    || (filters.attacker ?? 'all') !== 'all';
}

function playerDid(rally: RallyStats, skill: BallTouch['skill'], playerId: string): boolean {
  return rally.touches.some((touch) => touch.skill === skill && touch.playerId === playerId);
}

/** Whether `rally` matches the filters seen from `teamSide`. Rallies without the needed context never match an active filter. */
export function rallyMatchesContext(
  rally: RallyStats,
  filters: Partial<RallyContextFilters>,
  teamSide: TeamSide,
): boolean {
  const rotation = filters.rotation ?? 'all';
  if (rotation !== 'all' && rally.rotations?.[teamSide] !== rotation) return false;

  const scoreRange = filters.scoreRange ?? 'all';
  if (scoreRange !== 'all') {
    if (!rally.scoreBefore) return false;
    const own = rally.scoreBefore[teamSide];
    const opponent = rally.scoreBefore[teamSide === 'home' ? 'away' : 'home'];
    const matches = scoreRange === 'tied' ? own === opponent
      : scoreRange === 'leading' ? own > opponent
        : scoreRange === 'trailing' ? own < opponent
          : Math.max(own, opponent) >= finalPhaseThreshold(rally.setTargetPoints) && Math.abs(own - opponent) <= 2;
    if (!matches) return false;
  }

  if ((filters.server ?? 'all') !== 'all' && !playerDid(rally, 'serve', filters.server!)) return false;
  if ((filters.receiver ?? 'all') !== 'all' && !playerDid(rally, 'receive', filters.receiver!)) return false;
  if ((filters.attacker ?? 'all') !== 'all' && !playerDid(rally, 'attack', filters.attacker!)) return false;
  return true;
}

/** The rallies matching the filters from `teamSide`'s point of view. */
export function filterRalliesForTeam(
  rallies: readonly RallyStats[],
  filters: Partial<RallyContextFilters>,
  teamSide: TeamSide,
): RallyStats[] {
  if (!hasRallyContextFilter(filters)) return rallies as RallyStats[];
  return rallies.filter((rally) => rallyMatchesContext(rally, filters, teamSide));
}

/** Keeps the touches whose rally matches the filters from the touch's own team. */
export function filterTouchesByRallyContext(
  rallies: readonly RallyStats[],
  touches: readonly BallTouch[],
  filters: Partial<RallyContextFilters>,
): BallTouch[] {
  if (!hasRallyContextFilter(filters)) return touches as BallTouch[];
  const rallyByTouch = new Map<BallTouch, RallyStats>();
  rallies.forEach((rally) => rally.touches.forEach((touch) => rallyByTouch.set(touch, rally)));
  return touches.filter((touch) => {
    const rally = rallyByTouch.get(touch);
    return rally !== undefined && rallyMatchesContext(rally, filters, touch.teamSide);
  });
}
