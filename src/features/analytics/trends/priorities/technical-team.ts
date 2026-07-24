import type { MatchProject } from '@src/domain/match/types';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { computeTeamRadarValues, type RadarValues } from '../../radar/model/radar-metrics';
import { computeDeficit, hasEnoughSample, rankDeficits, type DeficitResult } from './deficit-score';
import { PRIORITY_CATEGORIES, type PriorityCategoryDefinition, type PriorityCategoryId } from './category-taxonomy';
import { buildMatchesWithResults, poolEntries, type MatchWithResult } from './match-window';

export interface TeamTechnicalDiagnosis extends DeficitResult {
  category: PriorityCategoryDefinition;
}

function rawRateValue(
  categoryId: PriorityCategoryId,
  stats: MatchStats,
  setsPlayed: number,
): { value: number | null; sampleSize: number } {
  const team = stats.teamStats.home;
  if (setsPlayed === 0) return { value: null, sampleSize: 0 };

  if (categoryId === 'blockPointsPerSet') {
    return { value: team.blockPoints / setsPlayed, sampleSize: team.block.total };
  }
  return { value: null, sampleSize: 0 };
}

/**
 * Team technical diagnosis: every category from the selected-matches window
 * ("current") compared against the same team's own matches won within that
 * same window ("benchmark") — no separate historical fetch, just a win/loss
 * split of whatever matches Trends currently has selected.
 *
 * Split from `computeTeamTechnicalDiagnosis` so the category/deficit logic
 * can be tested against hand-built `MatchStats` fixtures instead of full
 * DataVolley-style event logs.
 */
export function computeTeamTechnicalDiagnosisFromResults(
  withResults: readonly MatchWithResult[],
  focusName: string,
): TeamTechnicalDiagnosis[] {
  const current = poolEntries(withResults, focusName);
  const benchmark = poolEntries(withResults.filter((e) => e.won), focusName);

  const currentRadar: RadarValues | null = current ? computeTeamRadarValues(current.stats, 'home') : null;
  const benchmarkRadar: RadarValues | null = benchmark ? computeTeamRadarValues(benchmark.stats, 'home') : null;

  return PRIORITY_CATEGORIES.map((category) => {
    let currentValue: number | null = null;
    let benchmarkValue: number | null = null;
    let sampleSize = 0;
    const higherIsBetter = category.kind === 'radar' ? true : category.higherIsBetter;

    if (category.kind === 'radar') {
      currentValue = currentRadar?.[category.radarAxis] ?? null;
      benchmarkValue = benchmarkRadar?.[category.radarAxis] ?? null;
      sampleSize = current ? current.stats.teamStats.home[category.sampleSkill].total : 0;
    } else {
      const currentRaw = current ? rawRateValue(category.id, current.stats, current.setsPlayed) : { value: null, sampleSize: 0 };
      const benchmarkRaw = benchmark ? rawRateValue(category.id, benchmark.stats, benchmark.setsPlayed) : { value: null, sampleSize: 0 };
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

export function rankTeamTechnicalDiagnosis(
  diagnosis: readonly TeamTechnicalDiagnosis[],
): TeamTechnicalDiagnosis[] {
  return rankDeficits(diagnosis);
}

/** Builds one team's technical diagnosis across a set of matches (as selected/filtered in Trends). */
export function computeTeamTechnicalDiagnosis(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
): TeamTechnicalDiagnosis[] {
  const withResults = buildMatchesWithResults(matches, teamRef);
  const focusName = teamRef.teamName ?? 'Focus team';
  return computeTeamTechnicalDiagnosisFromResults(withResults, focusName);
}
