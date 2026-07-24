import type { PlayerRole } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';
import type { PlayerStats } from '@src/features/scouting/model/match-stats';
import { computePlayerRadarValues, type RadarValues } from '../../radar/model/radar-metrics';
import { computeDeficit, hasEnoughSample, rankDeficits, type DeficitResult } from './deficit-score';
import { getCategoriesForRole, type PriorityCategoryDefinition, type PriorityCategoryId } from './category-taxonomy';
import { buildMatchesWithResults, poolEntries, type MatchWithResult } from './match-window';

export interface PlayerOption {
  playerId: string;
  playerName: string;
  jerseyNumber: number | string;
  role?: PlayerRole;
}

export interface PlayerTechnicalDiagnosis extends DeficitResult {
  category: PriorityCategoryDefinition;
}

function rawRateValue(
  categoryId: PriorityCategoryId,
  player: PlayerStats,
  setsPlayed: number,
): { value: number | null; sampleSize: number } {
  if (setsPlayed === 0) return { value: null, sampleSize: 0 };

  if (categoryId === 'blockPointsPerSet') {
    return { value: player.blockPoints / setsPlayed, sampleSize: player.block.total };
  }
  return { value: null, sampleSize: 0 };
}

/**
 * Player technical diagnosis: the selected player's own stats across the
 * whole selected-matches window ("current") compared against that *same*
 * player's own stats restricted to the matches the team won ("benchmark") —
 * the player's own history, split by team result, exactly like the team
 * diagnosis but scoped to one player instead of pooling everyone.
 *
 * Split from `computePlayerTechnicalDiagnosis` so the category/deficit logic
 * can be tested against hand-built `PlayerStats` fixtures instead of full
 * DataVolley-style event logs.
 */
export function computePlayerTechnicalDiagnosisFromResults(
  withResults: readonly MatchWithResult[],
  focusName: string,
  playerId: string,
): PlayerTechnicalDiagnosis[] {
  const current = poolEntries(withResults, focusName);
  const benchmark = poolEntries(withResults.filter((e) => e.won), focusName);

  const currentPlayer = current?.stats.playerStats.find((p) => p.playerId === playerId) ?? null;
  const benchmarkPlayer = benchmark?.stats.playerStats.find((p) => p.playerId === playerId) ?? null;

  const categories = getCategoriesForRole(currentPlayer?.role);

  const currentRadar: RadarValues | null = current && currentPlayer
    ? computePlayerRadarValues(current.stats, currentPlayer)
    : null;
  const benchmarkRadar: RadarValues | null = benchmark && benchmarkPlayer
    ? computePlayerRadarValues(benchmark.stats, benchmarkPlayer)
    : null;

  return categories.map((category) => {
    let currentValue: number | null = null;
    let benchmarkValue: number | null = null;
    let sampleSize = 0;
    const higherIsBetter = category.kind === 'radar' ? true : category.higherIsBetter;

    if (category.kind === 'radar') {
      currentValue = currentRadar?.[category.radarAxis] ?? null;
      benchmarkValue = benchmarkRadar?.[category.radarAxis] ?? null;
      sampleSize = currentPlayer ? currentPlayer[category.sampleSkill].total : 0;
    } else {
      const currentRaw = currentPlayer && current
        ? rawRateValue(category.id, currentPlayer, current.setsPlayed)
        : { value: null, sampleSize: 0 };
      const benchmarkRaw = benchmarkPlayer && benchmark
        ? rawRateValue(category.id, benchmarkPlayer, benchmark.setsPlayed)
        : { value: null, sampleSize: 0 };
      currentValue = currentRaw.value;
      benchmarkValue = benchmarkRaw.value;
      sampleSize = currentRaw.sampleSize;
    }

    const deficit = computeDeficit({
      id: category.id, current: currentValue, benchmark: benchmarkValue, higherIsBetter, sampleSize,
    });
    const gated = hasEnoughSample(sampleSize) ? deficit : { ...deficit, deficit: null, relativeGap: null, trend: null };

    return { ...gated, category };
  });
}

export function rankPlayerTechnicalDiagnosis(
  diagnosis: readonly PlayerTechnicalDiagnosis[],
): PlayerTechnicalDiagnosis[] {
  return rankDeficits(diagnosis);
}

/** Players appearing for the focus team across the given matches — feeds the (multi-select) player picker. */
export function getAvailablePlayersFromResults(
  withResults: readonly MatchWithResult[],
  focusName: string,
): PlayerOption[] {
  const pooled = poolEntries(withResults, focusName);
  if (!pooled) return [];

  return pooled.stats.playerStats
    .filter((p) => p.teamSide === 'home')
    .map((p) => ({
      playerId: p.playerId, playerName: p.playerName, jerseyNumber: p.jerseyNumber, role: p.role,
    }));
}

/** Builds one player's technical diagnosis across a set of matches (as selected/filtered in Trends). */
export function computePlayerTechnicalDiagnosis(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
  playerId: string,
): PlayerTechnicalDiagnosis[] {
  const withResults = buildMatchesWithResults(matches, teamRef);
  const focusName = teamRef.teamName ?? 'Focus team';
  return computePlayerTechnicalDiagnosisFromResults(withResults, focusName, playerId);
}

/** Players available to pick from, across a set of matches (as selected/filtered in Trends). */
export function getAvailablePlayers(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
): PlayerOption[] {
  const withResults = buildMatchesWithResults(matches, teamRef);
  const focusName = teamRef.teamName ?? 'Focus team';
  return getAvailablePlayersFromResults(withResults, focusName);
}
