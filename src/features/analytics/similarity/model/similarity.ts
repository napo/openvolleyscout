import type { RadarAxisId, RadarValues } from '../../radar/model/radar-metrics';

export interface SimilarityVectorEntity {
  id: string;
  label: string;
  values: RadarValues;
  /** Number of matches this entity's values are aggregated from — used for the minimum-sample gate. */
  sampleSize: number;
}

export interface SimilarityPair {
  aId: string;
  bId: string;
  /** 0..100, higher = more similar. */
  score: number;
  method: 'cosine' | 'euclidean';
  sharedAxisCount: number;
}

export interface ComputeSimilarityOptions {
  method?: 'cosine' | 'euclidean';
  axisIds?: readonly RadarAxisId[];
  /** Entities aggregated from fewer matches than this are excluded entirely. */
  minSampleSize?: number;
  /** Pairs sharing fewer non-null axes than this are excluded. */
  minSharedAxes?: number;
}

const ALL_AXIS_IDS: readonly RadarAxisId[] = [
  'serveEfficiency',
  'receptionEfficiency',
  'attackEfficiency',
  'sideOutPct',
  'breakPointPct',
  'servePositiveRate',
  'receptionPositiveRate',
  'attackKillRate',
];

const DEFAULT_OPTIONS: Required<ComputeSimilarityOptions> = {
  method: 'cosine',
  axisIds: ALL_AXIS_IDS,
  minSampleSize: 3,
  minSharedAxes: 5,
};

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function populationStdDev(values: readonly number[], avg: number): number {
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Per-axis z-score standardization, so efficiency and rate axes contribute comparably to distance/cosine. */
function buildZScoreVectors(
  entities: readonly SimilarityVectorEntity[],
  axisIds: readonly RadarAxisId[],
): Map<string, Partial<Record<RadarAxisId, number>>> {
  const zByEntity = new Map<string, Partial<Record<RadarAxisId, number>>>();
  for (const entity of entities) zByEntity.set(entity.id, {});

  for (const axis of axisIds) {
    const rawByEntity = entities
      .map((e) => ({ id: e.id, value: e.values[axis] ?? null }))
      .filter((e): e is { id: string; value: number } => e.value !== null);

    if (rawByEntity.length === 0) continue;

    const avg = mean(rawByEntity.map((e) => e.value));
    const stdDev = populationStdDev(rawByEntity.map((e) => e.value), avg);

    for (const { id, value } of rawByEntity) {
      const z = stdDev === 0 ? 0 : (value - avg) / stdDev;
      zByEntity.get(id)![axis] = z;
    }
  }

  return zByEntity;
}

function cosineScore(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  if (normA === 0 || normB === 0) return 50; // no discriminating signal on shared axes -> neutral score
  const cosine = dot / (normA * normB);
  return ((cosine + 1) / 2) * 100;
}

function euclideanScore(a: number[], b: number[]): number {
  const dist = Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
  return (1 / (1 + dist)) * 100;
}

/**
 * Computes a pairwise similarity score (0..100) between every pair of
 * entities, based on their z-score-standardized radar metric vectors.
 * Entities under `minSampleSize` matches, and pairs sharing fewer than
 * `minSharedAxes` non-null axes, are excluded to avoid noisy comparisons
 * from tiny samples.
 */
export function computeSimilarityMatrix(
  entities: readonly SimilarityVectorEntity[],
  options: ComputeSimilarityOptions = {},
): SimilarityPair[] {
  const { method, axisIds, minSampleSize, minSharedAxes } = { ...DEFAULT_OPTIONS, ...options };

  const eligible = entities.filter((e) => e.sampleSize >= minSampleSize);
  const zByEntity = buildZScoreVectors(eligible, axisIds);

  const pairs: SimilarityPair[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      const zA = zByEntity.get(a.id)!;
      const zB = zByEntity.get(b.id)!;

      const sharedAxes = axisIds.filter((axis) => zA[axis] !== undefined && zB[axis] !== undefined);
      if (sharedAxes.length < minSharedAxes) continue;

      const vectorA = sharedAxes.map((axis) => zA[axis]!);
      const vectorB = sharedAxes.map((axis) => zB[axis]!);
      const score = method === 'cosine' ? cosineScore(vectorA, vectorB) : euclideanScore(vectorA, vectorB);

      pairs.push({ aId: a.id, bId: b.id, score, method, sharedAxisCount: sharedAxes.length });
    }
  }

  return pairs;
}

export function getTopSimilarPairs(pairs: readonly SimilarityPair[], n: number): SimilarityPair[] {
  return [...pairs].sort((a, b) => b.score - a.score).slice(0, n);
}

export function getPairsAboveThreshold(pairs: readonly SimilarityPair[], threshold: number): SimilarityPair[] {
  return pairs.filter((p) => p.score >= threshold);
}
