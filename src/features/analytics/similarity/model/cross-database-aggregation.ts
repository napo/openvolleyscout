import { getMatchTeamSnapshot } from '@src/domain/match';
import type { MatchProject, MatchRosterPlayer, MatchTeamSelection } from '@src/domain/match/types';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import {
  buildMatchStats,
  safeDivide,
  type MatchStats,
  type PlayerStats,
  type TeamStats,
} from '@src/features/scouting/model/match-stats';
import { matchRepository } from '@src/infrastructure/repositories';
import { accumulatePlayerStats, accumulateTeamStats } from '../../../teams/model/aggregated-stats';
import { computePlayerSituationContribution } from '../../dashboard/situation/situation-metrics';

export interface PlayerIdentitySample {
  playerId: string;
  playerName: string;
  archivedTeamId: string | null;
  matchesCount: number;
  rallyCount: number;
  aggregatedStats: PlayerStats;
  /** Share of the team's side-out points personally scored, across all matches found. */
  sideOutPct: number | null;
  /** Same, for the break-point phase. */
  breakPointPct: number | null;
}

export interface TeamIdentitySample {
  archivedTeamId: string;
  teamName: string;
  matchesCount: number;
  rallyCount: number;
  aggregatedStats: TeamStats;
  sideOutPct: number | null;
  breakPointPct: number | null;
}

export interface CrossDatabaseAggregationResult {
  players: PlayerIdentitySample[];
  teams: TeamIdentitySample[];
  /** Player appearances skipped because they aren't linked to a stable archived-roster id. */
  excludedPlayerAppearances: number;
  /** Team appearances skipped because the match side isn't linked to an archived team. */
  excludedTeamAppearances: number;
}

interface MutablePlayerAccumulator {
  playerId: string;
  playerName: string;
  archivedTeamId: string | null;
  matchesCount: number;
  rallyCount: number;
  aggregatedStats: PlayerStats;
  sideOutTeamPointsWon: number;
  sideOutPlayerPoints: number;
  breakPointTeamPointsWon: number;
  breakPointPlayerPoints: number;
}

interface MutableTeamAccumulator {
  archivedTeamId: string;
  teamName: string;
  matchesCount: number;
  rallyCount: number;
  aggregatedStats: TeamStats;
  sideOutAttempts: number;
  sideOutWins: number;
  breakPointAttempts: number;
  breakPointWins: number;
}

/** Roster entries with a stable cross-match identity, keyed by that identity (= PlayerStats.playerId). */
function buildStableRosterLookup(selection: MatchTeamSelection): Map<string, MatchRosterPlayer> {
  const map = new Map<string, MatchRosterPlayer>();
  for (const rosterPlayer of selection.roster) {
    if (rosterPlayer.source !== 'archived_roster' || !rosterPlayer.archivedPlayerId) continue;
    map.set(rosterPlayer.archivedPlayerId, rosterPlayer);
  }
  return map;
}

async function buildMatchStatsForProject(project: MatchProject): Promise<MatchStats> {
  const homeTeam = getMatchTeamSnapshot(project, 'home');
  const awayTeam = getMatchTeamSnapshot(project, 'away');
  const completedSets = mergeCompletedSets(
    project.scoutingSession?.completedSets,
    getCompletedSetsFromEvents(project.events),
  );
  return buildMatchStats({
    homeTeam,
    awayTeam,
    eventLog: project.events,
    completedSets,
    currentRallyTouches: project.scoutingSession?.currentRallyTouches ?? [],
  });
}

/**
 * Aggregates every match in the local database into per-player and per-team
 * statistical profiles, keyed by their stable archived-roster/archived-team
 * identity — the only identity that's guaranteed to mean the same real
 * player/team across different matches (see `MatchRosterPlayer.source`).
 *
 * Pass `matches` explicitly in tests to avoid touching the real repository;
 * defaults to the full local database otherwise.
 */
export async function buildCrossDatabaseAggregation(
  matches?: readonly MatchProject[],
): Promise<CrossDatabaseAggregationResult> {
  const projects = matches ?? await matchRepository.list();

  const playerAcc = new Map<string, MutablePlayerAccumulator>();
  const teamAcc = new Map<string, MutableTeamAccumulator>();
  let excludedPlayerAppearances = 0;
  let excludedTeamAppearances = 0;

  for (const project of projects) {
    const stats = await buildMatchStatsForProject(project);
    const rallyCount = stats.rallyStats.length;

    for (const side of ['home', 'away'] as const) {
      const selection = side === 'home' ? project.homeSelection : project.awaySelection;
      const teamStats = stats.teamStats[side];

      if (selection.archivedTeamId) {
        const archivedTeamId = selection.archivedTeamId;
        const so = stats.advancedStats.sideOut[side];
        const bp = stats.advancedStats.breakPoint[side];
        const existing = teamAcc.get(archivedTeamId);
        if (existing) {
          existing.aggregatedStats = accumulateTeamStats(existing.aggregatedStats, teamStats);
          existing.matchesCount += 1;
          existing.rallyCount += rallyCount;
          existing.sideOutAttempts += so.sideOutAttempts;
          existing.sideOutWins += so.sideOutWins;
          existing.breakPointAttempts += bp.breakPointAttempts;
          existing.breakPointWins += bp.breakPointWins;
        } else {
          teamAcc.set(archivedTeamId, {
            archivedTeamId,
            teamName: selection.teamName,
            matchesCount: 1,
            rallyCount,
            aggregatedStats: teamStats,
            sideOutAttempts: so.sideOutAttempts,
            sideOutWins: so.sideOutWins,
            breakPointAttempts: bp.breakPointAttempts,
            breakPointWins: bp.breakPointWins,
          });
        }
      } else {
        excludedTeamAppearances += 1;
      }

      const stableRoster = buildStableRosterLookup(selection);
      const sidePlayers = stats.playerStats.filter((p) => p.teamSide === side);

      for (const playerStats of sidePlayers) {
        if (!stableRoster.has(playerStats.playerId)) {
          excludedPlayerAppearances += 1;
          continue;
        }

        const contribution = computePlayerSituationContribution(stats.rallyStats, side, playerStats.playerId);
        const existing = playerAcc.get(playerStats.playerId);
        if (existing) {
          existing.aggregatedStats = accumulatePlayerStats(existing.aggregatedStats, playerStats);
          existing.matchesCount += 1;
          existing.rallyCount += rallyCount;
          existing.archivedTeamId = selection.archivedTeamId ?? existing.archivedTeamId;
          existing.sideOutTeamPointsWon += contribution.sideOut.teamPointsWon;
          existing.sideOutPlayerPoints += contribution.sideOut.playerPoints;
          existing.breakPointTeamPointsWon += contribution.breakPoint.teamPointsWon;
          existing.breakPointPlayerPoints += contribution.breakPoint.playerPoints;
        } else {
          playerAcc.set(playerStats.playerId, {
            playerId: playerStats.playerId,
            playerName: playerStats.playerName,
            archivedTeamId: selection.archivedTeamId ?? null,
            matchesCount: 1,
            rallyCount,
            aggregatedStats: playerStats,
            sideOutTeamPointsWon: contribution.sideOut.teamPointsWon,
            sideOutPlayerPoints: contribution.sideOut.playerPoints,
            breakPointTeamPointsWon: contribution.breakPoint.teamPointsWon,
            breakPointPlayerPoints: contribution.breakPoint.playerPoints,
          });
        }
      }
    }
  }

  const players: PlayerIdentitySample[] = [...playerAcc.values()].map((acc) => ({
    playerId: acc.playerId,
    playerName: acc.playerName,
    archivedTeamId: acc.archivedTeamId,
    matchesCount: acc.matchesCount,
    rallyCount: acc.rallyCount,
    aggregatedStats: acc.aggregatedStats,
    sideOutPct: safeDivide(acc.sideOutPlayerPoints, acc.sideOutTeamPointsWon),
    breakPointPct: safeDivide(acc.breakPointPlayerPoints, acc.breakPointTeamPointsWon),
  }));

  const teams: TeamIdentitySample[] = [...teamAcc.values()].map((acc) => ({
    archivedTeamId: acc.archivedTeamId,
    teamName: acc.teamName,
    matchesCount: acc.matchesCount,
    rallyCount: acc.rallyCount,
    aggregatedStats: acc.aggregatedStats,
    sideOutPct: safeDivide(acc.sideOutWins, acc.sideOutAttempts),
    breakPointPct: safeDivide(acc.breakPointWins, acc.breakPointAttempts),
  }));

  return { players, teams, excludedPlayerAppearances, excludedTeamAppearances };
}
