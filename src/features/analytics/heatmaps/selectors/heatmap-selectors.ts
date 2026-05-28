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
  dashFilters: Pick<DashboardFilters, 'team' | 'set' | 'rallyPhase'>,
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

  if (skillFilter !== 'all') {
    touches = touches.filter((t) => t.skill === skillFilter);
  }

  return touches;
}

export function getHeatmapSelectionResult(
  stats: MatchStats,
  dashFilters: Pick<DashboardFilters, 'team' | 'set' | 'rallyPhase'>,
  skillFilter: HeatmapSkillFilter,
): HeatmapSelectionResult {
  const touches = getHeatmapTouches(stats, dashFilters, skillFilter);
  const events = extractHeatmapEvents(touches);
  const totalTouches = touches.length;
  const inferredCount = countInferredEvents(events);
  const coverageRate = totalTouches > 0 ? events.length / totalTouches : 0;

  return { events, totalTouches, inferredCount, coverageRate };
}
