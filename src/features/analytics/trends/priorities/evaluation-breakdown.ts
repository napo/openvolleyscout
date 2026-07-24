import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { buildMatchStats, type MatchStats, type TrackedSkill } from '@src/features/scouting/model/match-stats';
import { getFocusTeamSide } from '@src/features/teams/model/team-match-filter';
import { EVALUATION_SYMBOLS, symbolCount, type EvaluationSymbol } from '../../../scouting/model/indicators';

export interface MatchEvaluationPoint {
  matchId: string;
  playedAt: string | null;
  opponentName: string;
  counts: Record<EvaluationSymbol, number>;
  total: number;
}

/**
 * Builds one evaluation-symbol breakdown from an already-computed MatchStats.
 * Split out from `computeCategoryEvaluationTrend` so the counting logic can
 * be tested against hand-built `MatchStats` fixtures instead of full
 * DataVolley-style event logs.
 */
export function evaluationPointFromStats(
  stats: MatchStats,
  focusSide: TeamSide,
  skill: TrackedSkill,
  input: { matchId: string; playedAt: string | null; playerId?: string },
): MatchEvaluationPoint {
  const opponentSide: TeamSide = focusSide === 'home' ? 'away' : 'home';

  const skillStats = input.playerId
    ? stats.playerStats.find((p) => p.playerId === input.playerId && p.teamSide === focusSide)?.[skill]
    : stats.teamStats[focusSide][skill];

  const counts = Object.fromEntries(
    EVALUATION_SYMBOLS.map((symbol) => [symbol, skillStats ? symbolCount(skillStats, symbol) : 0]),
  ) as Record<EvaluationSymbol, number>;

  return {
    matchId: input.matchId,
    playedAt: input.playedAt,
    opponentName: stats.teamStats[opponentSide].teamName,
    counts,
    total: skillStats?.total ?? 0,
  };
}

/**
 * One point per match: how a single skill's touches broke down across the six
 * DataVolley evaluation symbols, for the focus team (or one of its players).
 * Chronological order (oldest first), matching `computeSeasonTrend`. Feeds
 * the per-category stacked-bar drill-down — the radar/bar overview says
 * *which* category is weak, this says *why* (too many errors? too few
 * perfects?) and whether it's trending across the selected matches.
 */
export function computeCategoryEvaluationTrend(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
  skill: TrackedSkill,
  playerId?: string,
): MatchEvaluationPoint[] {
  const points = matches.map((project): MatchEvaluationPoint => {
    const homeTeam = getMatchTeamSnapshot(project, 'home');
    const awayTeam = getMatchTeamSnapshot(project, 'away');
    const completedSets = mergeCompletedSets(
      project.scoutingSession?.completedSets,
      getCompletedSetsFromEvents(project.events),
    );
    const stats = buildMatchStats({
      homeTeam,
      awayTeam,
      eventLog: project.events,
      completedSets,
      currentRallyTouches: project.scoutingSession?.currentRallyTouches ?? [],
    });
    const focusSide = getFocusTeamSide(project, teamRef.teamId, teamRef.teamName);

    return evaluationPointFromStats(stats, focusSide, skill, {
      matchId: project.metadata.id,
      playedAt: project.metadata.playedAt ?? null,
      playerId,
    });
  });

  return points.sort((a, b) => (a.playedAt ?? '').localeCompare(b.playedAt ?? ''));
}
