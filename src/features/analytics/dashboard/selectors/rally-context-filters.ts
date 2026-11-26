// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { matchesAny, type DashboardFilters, type ScoreSituation } from '../filters/dashboard-filters';
import { getScoreSituationSettings, isLateInSet } from '../../score-situation/score-situation-settings';
import { rallyBaseCodes } from './base-code';

/**
 * The rally-context filters of the analysis dashboards: rotation, score
 * situation, server, receiver and attacker. One implementation, so every
 * widget (team, player, situation, radar, heatmaps) filters the same way.
 *
 * Rotation and score situation are read from a team's point of view: the team
 * whose numbers are shown (for touches, the team of the touch). "Rotation 1"
 * is P1 of that team, "leading" means that team was ahead before the rally.
 * Server, receiver and attacker keep the rallies in which that player served,
 * received or attacked. Base keeps the rallies in which the team set or attacked
 * on that base / combination (setter call K1...Kn or attack code).
 */
export type RallyContextFilters = Pick<DashboardFilters, 'rotation' | 'scoreRange' | 'server' | 'receiver' | 'attacker' | 'base'>;

export type { ScoreSituation } from '../filters/dashboard-filters';

/**
 * Whether a score (before the rally, seen from one team) is in the given situation, with the
 * rules of Settings > Analysis. By default a close finish is from 20 points (12 in a deciding
 * set) with a gap of 2 or less, and leading/trailing means at least one point ahead/behind.
 */
export function matchesScoreSituation(
  own: number,
  opponent: number,
  setTargetPoints: number | undefined,
  situation: ScoreSituation,
): boolean {
  const settings = getScoreSituationSettings();
  if (situation === 'tied') return own === opponent;
  if (situation === 'leading') return own - opponent >= settings.leadMinGap;
  if (situation === 'trailing') return opponent - own >= settings.leadMinGap;
  return isLateInSet(own, opponent, setTargetPoints) && Math.abs(own - opponent) <= settings.closeMaxGap;
}

export function hasRallyContextFilter(filters: Partial<RallyContextFilters>): boolean {
  return (filters.rotation?.length ?? 0) > 0
    || (filters.scoreRange?.length ?? 0) > 0
    || (filters.server ?? 'all') !== 'all'
    || (filters.receiver ?? 'all') !== 'all'
    || (filters.attacker ?? 'all') !== 'all'
    || (filters.base ?? 'all') !== 'all';
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
  // Several rotations or score situations: the rally passes when it is in any of them.
  if (!matchesAny(filters.rotation, rally.rotations?.[teamSide])) return false;

  const scoreRange = filters.scoreRange ?? [];
  if (scoreRange.length > 0) {
    if (!rally.scoreBefore) return false;
    const own = rally.scoreBefore[teamSide];
    const opponent = rally.scoreBefore[teamSide === 'home' ? 'away' : 'home'];
    if (!scoreRange.some((situation) => matchesScoreSituation(own, opponent, rally.setTargetPoints, situation))) return false;
  }

  if ((filters.server ?? 'all') !== 'all' && !playerDid(rally, 'serve', filters.server!)) return false;
  if ((filters.receiver ?? 'all') !== 'all' && !playerDid(rally, 'receive', filters.receiver!)) return false;
  if ((filters.attacker ?? 'all') !== 'all' && !playerDid(rally, 'attack', filters.attacker!)) return false;
  if ((filters.base ?? 'all') !== 'all' && !rallyBaseCodes(rally.touches, teamSide).has(filters.base!)) return false;
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
