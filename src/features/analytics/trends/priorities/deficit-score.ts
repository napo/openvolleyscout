/**
 * Generic "how far below benchmark" scoring shared by the technical (team,
 * player) and tactical (rotation) priority diagnoses. Pure math — no
 * knowledge of volleyball skills or radar axes lives here.
 */

export interface DeficitCategoryInput {
  id: string;
  /** Value observed in the window being diagnosed. */
  current: number | null;
  /** Reference value the window is compared against. */
  benchmark: number | null;
  /** False for metrics where a lower value is the desired outcome (e.g. error rates). */
  higherIsBetter: boolean;
  /** Attempts/touches backing `current`, used for the minimum-sample guard. */
  sampleSize: number;
}

/**
 * Signed, 5-state read of current-vs-benchmark: unlike `deficit` (clamped to
 * 0, used to rank *weak spots*), this also distinguishes "comfortably above
 * benchmark" from "roughly on it" — for a trend indicator, not a priority list.
 */
export type TrendTier = 'up-strong' | 'up' | 'flat' | 'down' | 'down-strong';

export interface DeficitResult extends DeficitCategoryInput {
  /** Non-negative shortfall vs benchmark, in the metric's own unit; null if either input is missing. */
  deficit: number | null;
  /** `deficit` scaled by benchmark magnitude, so categories on different scales can be ranked together. */
  relativeGap: number | null;
  /** Signed trend tier vs benchmark; null if either input is missing. */
  trend: TrendTier | null;
}

const MIN_BENCHMARK_MAGNITUDE = 1e-6;
const STRONG_TREND_THRESHOLD = 0.15;
const MILD_TREND_THRESHOLD = 0.05;

export const DEFAULT_MIN_SAMPLE_SIZE = 10;

function computeTrendTier(current: number, benchmark: number, higherIsBetter: boolean): TrendTier {
  const rawDiff = higherIsBetter ? current - benchmark : benchmark - current;
  const scale = Math.abs(benchmark) > MIN_BENCHMARK_MAGNITUDE ? Math.abs(benchmark) : 1;
  const relative = rawDiff / scale;

  if (relative >= STRONG_TREND_THRESHOLD) return 'up-strong';
  if (relative >= MILD_TREND_THRESHOLD) return 'up';
  if (relative <= -STRONG_TREND_THRESHOLD) return 'down-strong';
  if (relative <= -MILD_TREND_THRESHOLD) return 'down';
  return 'flat';
}

export function computeDeficit(input: DeficitCategoryInput): DeficitResult {
  const { current, benchmark, higherIsBetter } = input;
  if (current === null || benchmark === null) {
    return { ...input, deficit: null, relativeGap: null, trend: null };
  }

  const rawGap = higherIsBetter ? benchmark - current : current - benchmark;
  const deficit = Math.max(0, rawGap);
  const relativeGap = Math.abs(benchmark) > MIN_BENCHMARK_MAGNITUDE ? deficit / Math.abs(benchmark) : null;
  const trend = computeTrendTier(current, benchmark, higherIsBetter);

  return {
    ...input, deficit, relativeGap, trend,
  };
}

/** Sorts worst-first by relative gap; categories with no computable gap sort last. */
export function rankDeficits<T extends DeficitResult>(results: readonly T[]): T[] {
  return [...results].sort((a, b) => {
    if (a.relativeGap === null && b.relativeGap === null) return 0;
    if (a.relativeGap === null) return 1;
    if (b.relativeGap === null) return -1;
    return b.relativeGap - a.relativeGap;
  });
}

export function hasEnoughSample(sampleSize: number, minSampleSize: number = DEFAULT_MIN_SAMPLE_SIZE): boolean {
  return sampleSize >= minSampleSize;
}
