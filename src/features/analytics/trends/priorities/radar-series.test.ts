/**
 * Radar-series conversion tests.
 * Runs under Node.js via ts-node/esm (only type-only @src imports here).
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { buildRadarSeriesPair, radarAxisIdsFromDiagnosis, rawRateEntriesFromDiagnosis } from './radar-series';
import { PRIORITY_CATEGORIES } from './category-taxonomy';
import type { CategoryDiagnosisEntry } from './radar-series';

function entryFor(categoryId: string, current: number | null, benchmark: number | null): CategoryDiagnosisEntry {
  const category = PRIORITY_CATEGORIES.find((c) => c.id === categoryId)!;
  return {
    id: categoryId, current, benchmark, higherIsBetter: true, sampleSize: 50, deficit: null, relativeGap: null, trend: null, category,
  };
}

describe('buildRadarSeriesPair', () => {
  it('splits current/benchmark into two series keyed by radar axis, skipping raw-rate categories', () => {
    const diagnosis = [
      entryFor('serveEfficiency', 0.2, 0.3),
      entryFor('attackEfficiency', 0.4, 0.5),
      entryFor('blockPointsPerSet', 2, 3), // raw-rate, should be skipped
    ];

    const [current, benchmark] = buildRadarSeriesPair(diagnosis, 'Current', 'Benchmark');

    assert.strictEqual(current.seriesId, 'current');
    assert.strictEqual(current.label, 'Current');
    assert.strictEqual(current.values.serveEfficiency, 0.2);
    assert.strictEqual(current.values.attackEfficiency, 0.4);
    assert.strictEqual('blockPointsPerSet' in current.values, false);

    assert.strictEqual(benchmark.seriesId, 'benchmark');
    assert.strictEqual(benchmark.values.serveEfficiency, 0.3);
    assert.strictEqual(benchmark.values.attackEfficiency, 0.5);
  });

  it('returns empty-valued series for an empty diagnosis array', () => {
    const [current, benchmark] = buildRadarSeriesPair([], 'Current', 'Benchmark');
    assert.deepStrictEqual(current.values, {});
    assert.deepStrictEqual(benchmark.values, {});
  });
});

describe('radarAxisIdsFromDiagnosis', () => {
  it('lists only the radar-backed category axes', () => {
    const diagnosis = [
      entryFor('serveEfficiency', 0.2, 0.3),
      entryFor('blockPointsPerSet', 2, 3),
    ];
    assert.deepStrictEqual(radarAxisIdsFromDiagnosis(diagnosis), ['serveEfficiency']);
  });
});

describe('rawRateEntriesFromDiagnosis', () => {
  it('lists only the raw-rate categories', () => {
    const diagnosis = [
      entryFor('serveEfficiency', 0.2, 0.3),
      entryFor('attackEfficiency', 0.4, 0.5),
      entryFor('blockPointsPerSet', 2, 3),
    ];
    const raw = rawRateEntriesFromDiagnosis(diagnosis);
    assert.deepStrictEqual(raw.map((r) => r.id), ['blockPointsPerSet']);
  });
});
