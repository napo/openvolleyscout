import type { BallTouch } from '@src/domain/touch/types';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../../dashboard/filters/dashboard-filters';
import type { HeatmapSkillFilter } from '../filters/heatmap-filters';
import { getFilteredRallies } from '../../dashboard/selectors/dashboard-selectors';
import {
  extractHeatmapEvents,
  countInferredEvents,
  type HeatmapEvent,
} from '../aggregation/heatmap-aggregation';

export interface HeatmapSelectionResult {
  events: HeatmapEvent[];
  totalTouches: number;
  inferredCount: number;
  coverageRate: number;
}

export function getHeatmapTouches(
  stats: MatchStats,
  dashFilters: DashboardFilters,
  skillFilter: HeatmapSkillFilter,
): BallTouch[] {
  const rallies = getFilteredRallies(stats, {
    set: dashFilters.set,
    rallyPhase: dashFilters.rallyPhase,
  });

  let touches = rallies.flatMap((r) => r.touches);

  if (dashFilters.team !== 'all') {
    touches = touches.filter((t) => t.teamSide === dashFilters.team);
  }

  if (dashFilters.source !== 'all') {
    const want = dashFilters.source;
    touches = touches.filter((t) => (t.source ?? 'explicit') === want);
  }

  if (dashFilters.player !== 'all') {
    touches = touches.filter((t) => t.playerId === dashFilters.player);
  }

  if (dashFilters.role !== 'all') {
    const rolePlayerIds = new Set(
      stats.playerStats
        .filter((p) => p.role === dashFilters.role)
        .map((p) => p.playerId),
    );
    touches = touches.filter((t) => t.playerId != null && rolePlayerIds.has(t.playerId));
  }

  if (skillFilter !== 'all') {
    touches = touches.filter((t) => t.skill === skillFilter);
  }

  return touches;
}

export function getHeatmapTouchesForTeam(
  stats: MatchStats,
  dashFilters: DashboardFilters,
  skillFilter: HeatmapSkillFilter,
  teamSide: 'home' | 'away',
): BallTouch[] {
  const teamFilters: DashboardFilters = { ...dashFilters, team: teamSide };
  return getHeatmapTouches(stats, teamFilters, skillFilter);
}

export function getHeatmapSelectionResult(
  stats: MatchStats,
  dashFilters: DashboardFilters,
  skillFilter: HeatmapSkillFilter,
): HeatmapSelectionResult {
  const touches = getHeatmapTouches(stats, dashFilters, skillFilter);
  const events = extractHeatmapEvents(touches);
  const totalTouches = touches.length;
  const inferredCount = countInferredEvents(events);
  const coverageRate = totalTouches > 0 ? events.length / totalTouches : 0;

  return { events, totalTouches, inferredCount, coverageRate };
}

export function getHeatmapSelectionResultForTeam(
  stats: MatchStats,
  dashFilters: DashboardFilters,
  skillFilter: HeatmapSkillFilter,
  teamSide: 'home' | 'away',
): HeatmapSelectionResult {
  const touches = getHeatmapTouchesForTeam(stats, dashFilters, skillFilter, teamSide);
  const events = extractHeatmapEvents(touches);
  const totalTouches = touches.length;
  const inferredCount = countInferredEvents(events);
  const coverageRate = totalTouches > 0 ? events.length / totalTouches : 0;

  return { events, totalTouches, inferredCount, coverageRate };
}
