import { getMatchRoster } from '@src/domain/match/helpers';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import type { TeamMatch } from './opponent-matches';
import type { ReportMatchInput } from './report-metrics';

/** The selected matches, reduced to what the report metrics read. */
export function buildReportMatchInputs(matches: readonly TeamMatch[]): ReportMatchInput[] {
  return matches.map(({ project, side }) => {
    const stats = buildProjectMatchStats(project);
    return {
      matchId: project.metadata.id,
      side,
      events: project.events,
      rallies: stats.rallyStats,
      rotationStats: stats.rotationStats[side],
      roster: getMatchRoster(project, side),
    };
  });
}
