import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { buildMatchStats } from '@src/features/scouting/model/match-stats';
import { getFocusTeamSide } from '@src/features/teams/model/team-match-filter';
import {
  computeTeamRadarValues,
  RADAR_AXES,
  type RadarAxisId,
  type RadarValues,
} from '../../radar/model/radar-metrics';

export interface SeasonTrendPoint {
  matchId: string;
  playedAt: string | null;
  opponentName: string;
  values: RadarValues;
}

export interface SeasonTrendDelta {
  axis: RadarAxisId;
  latest: number | null;
  average: number | null;
  delta: number | null;
}

/**
 * Builds one radar-value snapshot per match for the given team, ordered
 * chronologically (oldest first). Unlike `buildAggregatedTeamMatchStats`
 * (which pools every match into a single total), this keeps each match's
 * indicators separate so callers can plot a trend over time.
 */
export function computeSeasonTrend(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
): SeasonTrendPoint[] {
  const points = matches.map((project): SeasonTrendPoint => {
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
    const opponentSide = focusSide === 'home' ? 'away' : 'home';
    return {
      matchId: project.metadata.id,
      playedAt: project.metadata.playedAt ?? null,
      opponentName: stats.teamStats[opponentSide].teamName,
      values: computeTeamRadarValues(stats, focusSide),
    };
  });

  return points.sort((a, b) => (a.playedAt ?? '').localeCompare(b.playedAt ?? ''));
}

/**
 * Compares the most recent point in the trend against the average of every
 * other point, per axis — the "current vs season average" delta used to
 * flag what's improving/declining for a coach.
 */
export function computeDeltaVsAverage(trend: readonly SeasonTrendPoint[]): SeasonTrendDelta[] {
  if (trend.length < 2) {
    return RADAR_AXES.map((axis) => ({
      axis: axis.id,
      latest: trend[0]?.values[axis.id] ?? null,
      average: null,
      delta: null,
    }));
  }

  const latestPoint = trend[trend.length - 1];
  const priorPoints = trend.slice(0, -1);

  return RADAR_AXES.map((axis) => {
    const latest = latestPoint.values[axis.id] ?? null;
    const priorValues = priorPoints
      .map((p) => p.values[axis.id])
      .filter((v): v is number => v !== null && v !== undefined);
    const average = priorValues.length > 0
      ? priorValues.reduce((sum, v) => sum + v, 0) / priorValues.length
      : null;
    const delta = latest !== null && average !== null ? latest - average : null;
    return { axis: axis.id, latest, average, delta };
  });
}
