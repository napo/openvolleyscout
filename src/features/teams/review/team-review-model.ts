// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Data of the team review booklet: one team over the matches selected in the
 * team data study. Reuses match stats, season trend, team/player technical
 * priorities, rotation diagnosis, and synced video playlists.
 */
import { EVALUATION_SYMBOLS } from '@src/features/scouting/model/indicators';
import { createEmptySkillStats, type SkillStats } from '@src/features/scouting/model/match-stats';
import { getActiveIndicators } from '@src/features/scouting/model/indicator-settings';
import type { PlayerRole, TeamSide } from '@src/domain/common/enums';
import { getMatchRoster } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { APP_METADATA } from '@src/lib/constants/app';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import type { TeamStats } from '@src/features/scouting/model/match-stats';
import { getFocusTeamSide } from '@src/features/teams/model/team-match-filter';
import { computeDeltaVsAverage, computeSeasonTrend, type SeasonTrendDelta, type SeasonTrendPoint } from '@src/features/analytics/trends/model/season-trend';
import { computeTeamTechnicalDiagnosis, rankTeamTechnicalDiagnosis, type TeamTechnicalDiagnosis } from '@src/features/analytics/trends/priorities/technical-team';
import {
  computePlayerTechnicalDiagnosisFromResults,
  rankPlayerTechnicalDiagnosis,
  type PlayerTechnicalDiagnosis,
} from '@src/features/analytics/trends/priorities/technical-player';
import { buildMatchesWithResults } from '@src/features/analytics/trends/priorities/match-window';
import { computeRotationDiagnosis, getWeakRotations, type RotationDiagnosis, type WeakRotation } from '@src/features/analytics/trends/priorities/tactical-rotation';
import { buildAggregatedTeamMatchStats, type MatchEntry } from '@src/features/teams/model/aggregated-stats';
import { computePlayerRadarValues, computeTeamRadarValues, type RadarValues } from '@src/features/analytics/radar/model/radar-metrics';
import { computeSituationMetrics } from '@src/features/analytics/dashboard/situation/situation-metrics';
import { extractHeatmapEvents, type HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { extractSideOutSequences } from '@src/features/analytics/sideout/sideout-distribution';
import { toReportPlayer } from '@src/features/opponent-reports/model/report-metrics';
import { buildReportMatchInputs } from '@src/features/opponent-reports/model/report-inputs';
import { buildPlayerSkillVideoLinks } from '@src/features/opponent-reports/model/attacker-video-links';

export type TeamReviewDetailLevel = 'standard' | 'extended';

export interface TeamReviewConfig {
  detailLevel: TeamReviewDetailLevel;
  includeMatches: boolean;
  includeTeamOverview: boolean;
  includeTeamSections: boolean;
  includeTeamTrend: boolean;
  includeTeamPriorities: boolean;
  includePlayers: boolean;
  includePlayerComparison: boolean;
  includePlayerTrend: boolean;
  includePlayerPriorities: boolean;
}

export const DEFAULT_TEAM_REVIEW_CONFIG: TeamReviewConfig = {
  detailLevel: 'standard',
  includeMatches: true,
  includeTeamOverview: true,
  includeTeamSections: true,
  includeTeamTrend: true,
  includeTeamPriorities: true,
  includePlayers: true,
  includePlayerComparison: true,
  includePlayerTrend: true,
  includePlayerPriorities: true,
};

export interface TeamReviewMatch {
  id: string;
  playedAt: string | null;
  opponent: string;
  setsFor: number;
  setsAgainst: number;
  setPartials: string[];
  pointsFor: number;
  pointsAgainst: number;
}

export interface TeamReviewSkillBreakdown {
  points: number;
  errors: number;
  attack: {
    total: number; points: number; positive: number; negative: number; blocked: number; errors: number;
    /** Every attack by evaluation symbol: the efficiency rule chosen in Settings reads it. */
    stats: SkillStats;
  };
  receive: { total: number; perfect: number; positive: number; ok: number; negative: number; slash: number; errors: number };
  serve: { total: number; aces: number; positive: number; negative: number; errors: number };
  block: { total: number; points: number; touches: number; errors: number };
  dig: { total: number; positive: number; errors: number };
}

export interface TeamReviewSkillHeatmaps {
  attack: HeatmapEvent[];
  serve: HeatmapEvent[];
  receive: HeatmapEvent[];
}

export interface TeamReviewSideOutByReception {
  evaluation: '#' | '+' | '!' | '-';
  attempts: number;
  wins: number;
}

export interface TeamReviewTeamSummary extends TeamReviewSkillBreakdown {
  sideOut: { attempts: number; wins: number };
  breakPoint: { attempts: number; wins: number };
  firstBallSideOutPct: number | null;
  firstBallPlayPct: number | null;
  attackAfterDigKillPct: number | null;
}

export interface TeamReviewPlayerMatchPoint {
  matchId: string;
  playedAt: string | null;
  opponent: string;
  points: number;
  attackTotal: number;
  attackKill: number | null;
  attackEff: number | null;
  receiveTotal: number;
  receivePos: number | null;
  serveTotal: number;
  serveAces: number;
}

export interface TeamReviewPlayer extends TeamReviewSkillBreakdown {
  key: string;
  jersey: string;
  name: string;
  role?: PlayerRole;
  primaryPlayerId: string;
  playerIds: string[];
  matches: number;
  matchPoints: TeamReviewPlayerMatchPoint[];
  priorities: PlayerTechnicalDiagnosis[];
  radar?: RadarValues;
  heatmaps: TeamReviewSkillHeatmaps;
  /** Shared playlist of the player's actions, when matches have a synced YouTube video. */
  videoUrl?: string;
}

export interface TeamReviewData {
  teamName: string;
  matches: TeamReviewMatch[];
  wins: number;
  losses: number;
  teamSummary: TeamReviewTeamSummary;
  teamRadar: RadarValues;
  teamHeatmaps: TeamReviewSkillHeatmaps;
  sideOutByReception: TeamReviewSideOutByReception[];
  trend: SeasonTrendPoint[];
  deltas: SeasonTrendDelta[];
  /** Weakest categories against the matches won in the same window, worst first. */
  priorities: TeamTechnicalDiagnosis[];
  rotations: RotationDiagnosis[];
  weakRotations: WeakRotation[];
  players: TeamReviewPlayer[];
}

const MAX_PRIORITIES = 6;
const MAX_PLAYER_PRIORITIES = 4;

const SYMBOL_FIELDS = { '#': 'hash', '+': 'plus', '!': 'exclamation', '-': 'minus', '/': 'slash', '=': 'equal' } as const;

function emptySkillBreakdown(): TeamReviewSkillBreakdown {
  return {
    points: 0,
    errors: 0,
    attack: { total: 0, points: 0, positive: 0, negative: 0, blocked: 0, errors: 0, stats: createEmptySkillStats() },
    receive: { total: 0, perfect: 0, positive: 0, ok: 0, negative: 0, slash: 0, errors: 0 },
    serve: { total: 0, aces: 0, positive: 0, negative: 0, errors: 0 },
    block: { total: 0, points: 0, touches: 0, errors: 0 },
    dig: { total: 0, positive: 0, errors: 0 },
  };
}

function emptyPlayer(key: string, jersey: string, name: string, primaryPlayerId: string, role?: PlayerRole): TeamReviewPlayer {
  return {
    ...emptySkillBreakdown(),
    key,
    jersey,
    name,
    role,
    primaryPlayerId,
    playerIds: [primaryPlayerId],
    matches: 0,
    matchPoints: [],
    priorities: [],
    heatmaps: { attack: [], serve: [], receive: [] },
  };
}

function accumulateSkillBreakdown(
  target: TeamReviewSkillBreakdown,
  source: {
    points: number;
    errors: number;
    attack: TeamStats['attack'];
    receive: TeamStats['receive'];
    serve: TeamStats['serve'];
    block: TeamStats['block'];
    dig: TeamStats['dig'];
    aces: number;
    attackPoints: number;
    attackErrors: number;
    attackBlocked: number;
    blockPoints: number;
    serveErrors: number;
    receptionErrors: number;
  },
): void {
  target.points += source.points;
  target.errors += source.errors;

  target.attack.total += source.attack.total;
  target.attack.points += source.attack.points;
  target.attack.positive += source.attack.plus;
  target.attack.negative += source.attack.minus + source.attack.exclamation;
  target.attack.blocked += source.attackBlocked;
  target.attack.errors += source.attackErrors;
  for (const symbol of EVALUATION_SYMBOLS) {
    const field = SYMBOL_FIELDS[symbol];
    target.attack.stats[field] += source.attack[field];
  }
  target.attack.stats.total += source.attack.total;

  target.receive.total += source.receive.total;
  target.receive.perfect += source.receive.perfect;
  // Positive reception counts perfect (#) and positive (+), like the match report.
  target.receive.positive += source.receive.perfect + source.receive.positive;
  target.receive.ok += source.receive.exclamation;
  target.receive.negative += source.receive.minus;
  target.receive.slash += source.receive.slash;
  target.receive.errors += source.receptionErrors;

  target.serve.total += source.serve.total;
  target.serve.aces += source.aces;
  target.serve.positive += source.serve.plus;
  target.serve.negative += source.serve.minus + source.serve.exclamation;
  target.serve.errors += source.serveErrors;

  target.block.total += source.block.total;
  target.block.points += source.blockPoints;
  target.block.touches += source.block.plus;
  target.block.errors += source.block.errors;

  target.dig.total += source.dig.total;
  target.dig.positive += source.dig.positive;
  target.dig.errors += source.dig.errors;
}

export function buildTeamReviewData(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
  options: { title?: string; now?: number; withVideoLinks?: boolean } = {},
): TeamReviewData {
  const players = new Map<string, TeamReviewPlayer>();
  const reviewMatches: TeamReviewMatch[] = [];
  const teamMatches: Array<{ project: MatchProject; side: TeamSide; faced: { name: string } }> = [];
  const matchEntries: MatchEntry[] = [];
  const teamSummary: TeamReviewTeamSummary = {
    ...emptySkillBreakdown(),
    sideOut: { attempts: 0, wins: 0 },
    breakPoint: { attempts: 0, wins: 0 },
    firstBallSideOutPct: null,
    firstBallPlayPct: null,
    attackAfterDigKillPct: null,
  };
  let teamName = teamRef.teamName ?? '';

  const sortedMatches = [...matches].sort((a, b) => (a.metadata.playedAt ?? '').localeCompare(b.metadata.playedAt ?? ''));

  for (const project of sortedMatches) {
    const stats = buildProjectMatchStats(project);
    const side = getFocusTeamSide(project, teamRef.teamId, teamRef.teamName);
    const other: TeamSide = side === 'home' ? 'away' : 'home';
    const opponentName = stats.teamStats[other].teamName;
    teamName ||= stats.teamStats[side].teamName;

    const setPartials = stats.setStats.map((set) => (
      side === 'home' ? `${set.homeScore}-${set.awayScore}` : `${set.awayScore}-${set.homeScore}`
    ));
    const pointsFor = stats.setStats.reduce((sum, set) => sum + (side === 'home' ? set.homeScore : set.awayScore), 0);
    const pointsAgainst = stats.setStats.reduce((sum, set) => sum + (side === 'home' ? set.awayScore : set.homeScore), 0);

    reviewMatches.push({
      id: project.metadata.id,
      playedAt: project.metadata.playedAt ?? null,
      opponent: opponentName,
      setsFor: stats.setsWon[side],
      setsAgainst: stats.setsWon[other],
      setPartials,
      pointsFor,
      pointsAgainst,
    });
    teamMatches.push({ project, side, faced: { name: opponentName } });
    matchEntries.push({ stats, focusTeamSide: side });

    accumulateSkillBreakdown(teamSummary, stats.teamStats[side]);
    teamSummary.sideOut.attempts += stats.sideOutStats[side].sideOutAttempts;
    teamSummary.sideOut.wins += stats.sideOutStats[side].sideOutWins;
    teamSummary.breakPoint.attempts += stats.breakPointStats[side].breakPointAttempts;
    teamSummary.breakPoint.wins += stats.breakPointStats[side].breakPointWins;

    const roster = getMatchRoster(project, side);
    for (const entry of stats.playerStats) {
      if (entry.teamSide !== side || entry.totalTouches === 0) continue;
      const rosterEntry = roster.find((player) => player.id === entry.playerId);
      const reportPlayer = rosterEntry
        ? toReportPlayer(rosterEntry)
        : { key: `#${entry.jerseyNumber}|${entry.playerName}`, jersey: String(entry.jerseyNumber), name: entry.playerName };
      const player = players.get(reportPlayer.key) ?? emptyPlayer(
        reportPlayer.key,
        reportPlayer.jersey,
        reportPlayer.name,
        entry.playerId,
        entry.role ?? rosterEntry?.role,
      );
      if (!player.role && (entry.role || rosterEntry?.role)) {
        player.role = entry.role ?? rosterEntry?.role;
      }
      if (!player.playerIds.includes(entry.playerId)) {
        player.playerIds.push(entry.playerId);
      }
      player.matches += 1;
      accumulateSkillBreakdown(player, entry);
      player.matchPoints.push({
        matchId: project.metadata.id,
        playedAt: project.metadata.playedAt ?? null,
        opponent: opponentName,
        points: entry.points,
        attackTotal: entry.attack.total,
        attackKill: entry.attack.total > 0 ? entry.attack.points / entry.attack.total : null,
        attackEff: getActiveIndicators().attackEfficiency(entry.attack),
        receiveTotal: entry.receive.total,
        receivePos: entry.receive.total > 0 ? entry.receive.positive / entry.receive.total : null,
        serveTotal: entry.serve.total,
        serveAces: entry.aces,
      });
      players.set(reportPlayer.key, player);
    }
  }

  const sortedPlayers = [...players.values()].sort((left, right) => (
    (Number(left.jersey) || 999) - (Number(right.jersey) || 999) || left.name.localeCompare(right.name)
  ));

  if (sortedPlayers.length > 0 && sortedMatches.length > 0) {
    const withResults = buildMatchesWithResults(sortedMatches, teamRef);
    const focusName = teamName || teamRef.teamName || 'Focus team';
    for (const player of sortedPlayers) {
      player.priorities = rankPlayerTechnicalDiagnosis(
        computePlayerTechnicalDiagnosisFromResults(withResults, focusName, player.primaryPlayerId),
      )
        .filter((item) => item.deficit !== null && item.deficit > 0)
        .slice(0, MAX_PLAYER_PRIORITIES);
    }
  }

  if (options.withVideoLinks !== false) {
    const links = buildPlayerSkillVideoLinks(
      buildReportMatchInputs(teamMatches),
      sortedPlayers.map((player) => ({ player: { key: player.key, jersey: player.jersey, name: player.name } })),
      options.title ?? teamName,
      APP_METADATA.urls.webApp,
      options.now ?? Date.now(),
      'attack',
    );
    sortedPlayers.forEach((player) => { player.videoUrl = links.get(player.key)?.url; });
  }

  const aggregated = buildAggregatedTeamMatchStats(matchEntries, teamName || teamRef.teamName || 'Focus team', 'Opponent');
  const teamRadar = computeTeamRadarValues(aggregated, 'home');
  const sitHome = computeSituationMetrics(
    aggregated.rallyStats,
    aggregated.teamStats.home.teamName,
    aggregated.teamStats.away.teamName,
  ).home;
  teamSummary.firstBallSideOutPct = sitHome.firstBallSideOut.pointPct;
  teamSummary.firstBallPlayPct = sitHome.firstBallPlay.pointPct;
  teamSummary.attackAfterDigKillPct = sitHome.attackAfterDigKill.pointPct;

  const focusTouches = aggregated.rallyStats.flatMap((rally) => rally.touches.filter((touch) => touch.teamSide === 'home'));
  const allHeatmaps = extractHeatmapEvents(focusTouches);
  const teamHeatmaps: TeamReviewSkillHeatmaps = {
    attack: allHeatmaps.filter((e) => e.skill === 'attack'),
    serve: allHeatmaps.filter((e) => e.skill === 'serve'),
    receive: allHeatmaps.filter((e) => e.skill === 'receive'),
  };

  const sideOutBuckets = new Map<'#' | '+' | '!' | '-', { attempts: number; wins: number }>([
    ['#', { attempts: 0, wins: 0 }],
    ['+', { attempts: 0, wins: 0 }],
    ['!', { attempts: 0, wins: 0 }],
    ['-', { attempts: 0, wins: 0 }],
  ]);
  const rallyWonMap = new Map(aggregated.rallyStats.map((r) => [`${r.setNumber}:${r.rallyNumber}`, r.pointWinner === 'home']));
  for (const seq of extractSideOutSequences(aggregated.rallyStats)) {
    if (seq.teamSide !== 'home') continue;
    const ev = seq.receive.evaluation;
    if (ev === '#' || ev === '+' || ev === '!' || ev === '-') {
      const bucket = sideOutBuckets.get(ev)!;
      bucket.attempts += 1;
      if (rallyWonMap.get(`${seq.setNumber}:${seq.rallyNumber}`)) bucket.wins += 1;
    }
  }
  const sideOutByReception: TeamReviewSideOutByReception[] = (['#', '+', '!', '-'] as const).map((evaluation) => ({
    evaluation,
    attempts: sideOutBuckets.get(evaluation)!.attempts,
    wins: sideOutBuckets.get(evaluation)!.wins,
  }));

  for (const player of sortedPlayers) {
    const idSet = new Set(player.playerIds);
    const pHeat = allHeatmaps.filter((e) => e.playerId && idSet.has(e.playerId));
    player.heatmaps = {
      attack: pHeat.filter((e) => e.skill === 'attack'),
      serve: pHeat.filter((e) => e.skill === 'serve'),
      receive: pHeat.filter((e) => e.skill === 'receive'),
    };
    const aggPlayer = aggregated.playerStats.find((p) => p.teamSide === 'home' && idSet.has(p.playerId));
    if (aggPlayer) {
      player.radar = computePlayerRadarValues(aggregated, aggPlayer);
    }
  }

  const trend = computeSeasonTrend(sortedMatches, teamRef);
  const rotations = computeRotationDiagnosis(sortedMatches, teamRef);
  return {
    teamName,
    matches: reviewMatches,
    wins: reviewMatches.filter((match) => match.setsFor > match.setsAgainst).length,
    losses: reviewMatches.filter((match) => match.setsFor < match.setsAgainst).length,
    teamSummary,
    teamRadar,
    teamHeatmaps,
    sideOutByReception,
    trend,
    deltas: computeDeltaVsAverage(trend),
    priorities: rankTeamTechnicalDiagnosis(computeTeamTechnicalDiagnosis(sortedMatches, teamRef))
      .filter((item) => item.deficit !== null && item.deficit > 0)
      .slice(0, MAX_PRIORITIES),
    rotations,
    weakRotations: getWeakRotations(rotations),
    players: sortedPlayers,
  };
}
