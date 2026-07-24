import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { buildMatchStats, type MatchStats } from '@src/features/scouting/model/match-stats';
import { getFocusTeamSide } from '@src/features/teams/model/team-match-filter';
import { buildAggregatedTeamMatchStats, type MatchEntry } from '@src/features/teams/model/aggregated-stats';

/**
 * Shared "which matches, who won" plumbing for the priorities diagnoses
 * (team technical, player technical). Kept separate from the individual
 * diagnosis modules so both can pool the same win/loss-split window without
 * duplicating the MatchProject → MatchStats extraction.
 */
export interface MatchWithResult {
  stats: MatchStats;
  focusTeamSide: TeamSide;
  won: boolean;
  setsPlayed: number;
}

export interface PooledWindow {
  /** Focus team always normalized to 'home', matching `buildAggregatedTeamMatchStats`. */
  stats: MatchStats;
  setsPlayed: number;
}

export function buildMatchesWithResults(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
): MatchWithResult[] {
  return matches.map((project) => {
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
    const focusTeamSide = getFocusTeamSide(project, teamRef.teamId, teamRef.teamName);
    const opponentSide: TeamSide = focusTeamSide === 'home' ? 'away' : 'home';
    return {
      stats,
      focusTeamSide,
      won: stats.setsWon[focusTeamSide] > stats.setsWon[opponentSide],
      setsPlayed: stats.setsWon.home + stats.setsWon.away,
    };
  });
}

/** Pools a subset of matches into one MatchStats with the focus team normalized to 'home'. */
export function poolEntries(entries: readonly MatchWithResult[], focusName: string): PooledWindow | null {
  if (entries.length === 0) return null;
  const matchEntries: MatchEntry[] = entries.map((e) => ({ stats: e.stats, focusTeamSide: e.focusTeamSide }));
  const pooled = buildAggregatedTeamMatchStats(matchEntries, focusName, '__priorities_benchmark_pool__');
  const setsPlayed = entries.reduce((sum, e) => sum + e.setsPlayed, 0);
  return { stats: pooled, setsPlayed };
}
