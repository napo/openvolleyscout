import type { RadarValues } from '../../radar/model/radar-metrics';
import type { RadarSeries } from '../../radar/model/radar-normalization';
import type { DeficitResult } from './deficit-score';
import type { PriorityCategoryDefinition } from './category-taxonomy';

export type CategoryDiagnosisEntry = DeficitResult & { category: PriorityCategoryDefinition };

/** Splits a diagnosis array's radar-backed categories into two RadarSeries (current vs benchmark). */
export function buildRadarSeriesPair(
  diagnosis: readonly CategoryDiagnosisEntry[],
  currentLabel: string,
  benchmarkLabel: string,
): RadarSeries[] {
  const currentValues: RadarValues = {};
  const benchmarkValues: RadarValues = {};

  diagnosis.forEach((entry) => {
    if (entry.category.kind !== 'radar') return;
    currentValues[entry.category.radarAxis] = entry.current;
    benchmarkValues[entry.category.radarAxis] = entry.benchmark;
  });

  return [
    { seriesId: 'current', label: currentLabel, values: currentValues },
    { seriesId: 'benchmark', label: benchmarkLabel, values: benchmarkValues },
  ];
}

/** Radar axis ids for the radar-backed categories in a diagnosis array, in taxonomy order. */
export function radarAxisIdsFromDiagnosis(diagnosis: readonly CategoryDiagnosisEntry[]) {
  return diagnosis
    .filter((entry): entry is CategoryDiagnosisEntry & { category: Extract<PriorityCategoryDefinition, { kind: 'radar' }> } => entry.category.kind === 'radar')
    .map((entry) => entry.category.radarAxis);
}

/** The raw-rate (non-radar) categories in a diagnosis array — shown as simple bars instead. */
export function rawRateEntriesFromDiagnosis(diagnosis: readonly CategoryDiagnosisEntry[]) {
  return diagnosis.filter((entry) => entry.category.kind === 'raw-rate');
}
