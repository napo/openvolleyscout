// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Data of the team review booklet: one team over the matches selected in the
 * team data study. Everything comes from the analyses the study already
 * shows (season trend, training priorities, rotations), plus each player's
 * main numbers pooled over the matches with the same identity the tactical
 * reports use, and a video link to their actions when the videos are synced.
 */
import type { TeamSide } from '@src/domain/common/enums';
import { getMatchRoster } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { APP_METADATA } from '@src/lib/constants/app';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { getFocusTeamSide } from '@src/features/teams/model/team-match-filter';
import { computeDeltaVsAverage, computeSeasonTrend, type SeasonTrendDelta, type SeasonTrendPoint } from '@src/features/analytics/trends/model/season-trend';
import { computeTeamTechnicalDiagnosis, rankTeamTechnicalDiagnosis, type TeamTechnicalDiagnosis } from '@src/features/analytics/trends/priorities/technical-team';
import { computeRotationDiagnosis, getWeakRotations, type RotationDiagnosis, type WeakRotation } from '@src/features/analytics/trends/priorities/tactical-rotation';
import { toReportPlayer } from '@src/features/opponent-reports/model/report-metrics';
import { buildReportMatchInputs } from '@src/features/opponent-reports/model/report-inputs';
import { buildPlayerSkillVideoLinks } from '@src/features/opponent-reports/model/attacker-video-links';

export interface TeamReviewMatch {
  id: string;
  playedAt: string | null;
  opponent: string;
  setsFor: number;
  setsAgainst: number;
}

export interface TeamReviewPlayer {
  key: string;
  jersey: string;
  name: string;
  matches: number;
  attack: { total: number; points: number; errors: number; blocked: number };
  receive: { total: number; positive: number; perfect: number; errors: number };
  serve: { total: number; aces: number; errors: number };
  blockPoints: number;
  /** Shared playlist of the player's attacks, when matches have a synced YouTube video. */
  videoUrl?: string;
}

export interface TeamReviewData {
  teamName: string;
  matches: TeamReviewMatch[];
  wins: number;
  losses: number;
  trend: SeasonTrendPoint[];
  deltas: SeasonTrendDelta[];
  /** Weakest categories against the matches won in the same window, worst first. */
  priorities: TeamTechnicalDiagnosis[];
  rotations: RotationDiagnosis[];
  weakRotations: WeakRotation[];
  players: TeamReviewPlayer[];
}

const MAX_PRIORITIES = 6;

function emptyPlayer(key: string, jersey: string, name: string): TeamReviewPlayer {
  return {
    key, jersey, name, matches: 0,
    attack: { total: 0, points: 0, errors: 0, blocked: 0 },
    receive: { total: 0, positive: 0, perfect: 0, errors: 0 },
    serve: { total: 0, aces: 0, errors: 0 },
    blockPoints: 0,
  };
}

export function buildTeamReviewData(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
  options: { title?: string; now?: number; withVideoLinks?: boolean } = {},
): TeamReviewData {
  const players = new Map<string, TeamReviewPlayer>();
  const reviewMatches: TeamReviewMatch[] = [];
  const teamMatches: Array<{ project: MatchProject; side: TeamSide; faced: { name: string } }> = [];
  let teamName = teamRef.teamName ?? '';

  for (const project of matches) {
    const stats = buildProjectMatchStats(project);
    const side = getFocusTeamSide(project, teamRef.teamId, teamRef.teamName);
    const other: TeamSide = side === 'home' ? 'away' : 'home';
    teamName ||= stats.teamStats[side].teamName;
    reviewMatches.push({
      id: project.metadata.id,
      playedAt: project.metadata.playedAt ?? null,
      opponent: stats.teamStats[other].teamName,
      setsFor: stats.setsWon[side],
      setsAgainst: stats.setsWon[other],
    });
    teamMatches.push({ project, side, faced: { name: stats.teamStats[other].teamName } });

    const roster = getMatchRoster(project, side);
    for (const entry of stats.playerStats) {
      if (entry.teamSide !== side || entry.totalTouches === 0) continue;
      const rosterEntry = roster.find((player) => player.id === entry.playerId);
      const reportPlayer = rosterEntry
        ? toReportPlayer(rosterEntry)
        : { key: `#${entry.jerseyNumber}|${entry.playerName}`, jersey: String(entry.jerseyNumber), name: entry.playerName };
      const player = players.get(reportPlayer.key) ?? emptyPlayer(reportPlayer.key, reportPlayer.jersey, reportPlayer.name);
      player.matches += 1;
      player.attack.total += entry.attack.total;
      player.attack.points += entry.attack.points;
      player.attack.errors += entry.attackErrors;
      player.attack.blocked += entry.attackBlocked;
      player.receive.total += entry.receive.total;
      player.receive.positive += entry.receive.positive;
      player.receive.perfect += entry.receive.perfect;
      player.receive.errors += entry.receptionErrors;
      player.serve.total += entry.serve.total;
      player.serve.aces += entry.aces;
      player.serve.errors += entry.serveErrors;
      player.blockPoints += entry.blockPoints;
      players.set(reportPlayer.key, player);
    }
  }

  const sortedPlayers = [...players.values()].sort((left, right) => (
    (Number(left.jersey) || 999) - (Number(right.jersey) || 999) || left.name.localeCompare(right.name)
  ));

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

  const trend = computeSeasonTrend(matches, teamRef);
  const rotations = computeRotationDiagnosis(matches, teamRef);
  return {
    teamName,
    matches: reviewMatches.sort((left, right) => (left.playedAt ?? '').localeCompare(right.playedAt ?? '')),
    wins: reviewMatches.filter((match) => match.setsFor > match.setsAgainst).length,
    losses: reviewMatches.filter((match) => match.setsFor < match.setsAgainst).length,
    trend,
    deltas: computeDeltaVsAverage(trend),
    priorities: rankTeamTechnicalDiagnosis(computeTeamTechnicalDiagnosis(matches, teamRef))
      .filter((item) => item.deficit !== null && item.deficit > 0)
      .slice(0, MAX_PRIORITIES),
    rotations,
    weakRotations: getWeakRotations(rotations),
    players: sortedPlayers,
  };
}
