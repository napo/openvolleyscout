import { describe, it, expect } from 'vitest';
import type { RadarValues } from '../../radar/model/radar-metrics';
import {
  computeSimilarityMatrix,
  getTopSimilarPairs,
  getPairsAboveThreshold,
  type SimilarityVectorEntity,
} from './similarity';

function entity(id: string, values: RadarValues, sampleSize = 5): SimilarityVectorEntity {
  return { id, label: id, values, sampleSize };
}

const FULL_VALUES: RadarValues = {
  serveEfficiency: 0.2,
  receptionEfficiency: 0.3,
  attackEfficiency: 0.4,
  sideOutPct: 0.5,
  breakPointPct: 0.6,
  servePositiveRate: 0.7,
  receptionPositiveRate: 0.8,
  attackKillRate: 0.9,
};

const OPPOSITE_VALUES: RadarValues = {
  serveEfficiency: 0.9,
  receptionEfficiency: 0.8,
  attackEfficiency: 0.7,
  sideOutPct: 0.6,
  breakPointPct: 0.5,
  servePositiveRate: 0.4,
  receptionPositiveRate: 0.3,
  attackKillRate: 0.2,
};

describe('computeSimilarityMatrix', () => {
  // Note: z-score standardization needs cross-entity variance to have any
  // signal — with only 2 entities that are identical on every axis, every
  // axis has zero population variance, so there's nothing to standardize
  // against (see the neutral-score branch in cosineScore). A 3rd, different
  // entity is what gives the standardization something to work with.
  it('gives two identical vectors the maximum cosine score, higher than a clearly different one', () => {
    const entities = [
      entity('a', FULL_VALUES),
      entity('b', { ...FULL_VALUES }),
      entity('c', OPPOSITE_VALUES),
    ];
    const pairs = computeSimilarityMatrix(entities, { method: 'cosine', minSampleSize: 1 });
    const ab = pairs.find((p) => (p.aId === 'a' && p.bId === 'b') || (p.aId === 'b' && p.bId === 'a'))!;
    const ac = pairs.find((p) => (p.aId === 'a' && p.bId === 'c') || (p.aId === 'c' && p.bId === 'a'))!;
    expect(ab.score).toBeCloseTo(100, 5);
    expect(ab.score).toBeGreaterThan(ac.score);
  });

  it('excludes entities below minSampleSize', () => {
    const entities = [
      entity('a', FULL_VALUES, 5),
      entity('b', { ...FULL_VALUES }, 1),
    ];
    const pairs = computeSimilarityMatrix(entities, { minSampleSize: 3 });
    expect(pairs).toHaveLength(0);
  });

  it('excludes pairs sharing fewer axes than minSharedAxes', () => {
    const entities = [
      entity('a', { serveEfficiency: 0.2, receptionEfficiency: 0.3 }, 5),
      entity('b', { attackEfficiency: 0.4, sideOutPct: 0.5 }, 5),
    ];
    const pairs = computeSimilarityMatrix(entities, { minSampleSize: 1, minSharedAxes: 1 });
    expect(pairs).toHaveLength(0);
  });

  it('includes a pair when shared axes meet minSharedAxes', () => {
    const entities = [
      entity('a', { serveEfficiency: 0.2, receptionEfficiency: 0.3, attackEfficiency: 0.4 }, 5),
      entity('b', { serveEfficiency: 0.25, receptionEfficiency: 0.35, attackEfficiency: 0.1 }, 5),
    ];
    const pairs = computeSimilarityMatrix(entities, { minSampleSize: 1, minSharedAxes: 3 });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].sharedAxisCount).toBe(3);
  });
});

describe('getTopSimilarPairs / getPairsAboveThreshold', () => {
  it('sorts by score descending and slices to n', () => {
    const pairs = [
      { aId: 'a', bId: 'b', score: 50, method: 'cosine' as const, sharedAxisCount: 5 },
      { aId: 'a', bId: 'c', score: 90, method: 'cosine' as const, sharedAxisCount: 5 },
      { aId: 'b', bId: 'c', score: 70, method: 'cosine' as const, sharedAxisCount: 5 },
    ];
    const top = getTopSimilarPairs(pairs, 2);
    expect(top.map((p) => p.score)).toEqual([90, 70]);
  });

  it('filters pairs at or above the threshold', () => {
    const pairs = [
      { aId: 'a', bId: 'b', score: 50, method: 'cosine' as const, sharedAxisCount: 5 },
      { aId: 'a', bId: 'c', score: 90, method: 'cosine' as const, sharedAxisCount: 5 },
    ];
    const above = getPairsAboveThreshold(pairs, 75);
    expect(above).toHaveLength(1);
    expect(above[0].bId).toBe('c');
  });
});
