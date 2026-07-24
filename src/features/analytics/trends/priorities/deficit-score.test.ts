/**
 * Deficit-score tests.
 * Runs under Node.js via ts-node/esm.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  computeDeficit,
  rankDeficits,
  hasEnoughSample,
  DEFAULT_MIN_SAMPLE_SIZE,
} from './deficit-score';

describe('computeDeficit', () => {
  it('reports a positive deficit when current is below benchmark and higher is better', () => {
    const result = computeDeficit({
      id: 'attackEfficiency', current: 0.3, benchmark: 0.4, higherIsBetter: true, sampleSize: 50,
    });
    assert.ok(result.deficit !== null);
    assert.ok(Math.abs(result.deficit! - 0.1) < 1e-9);
    assert.ok(Math.abs(result.relativeGap! - 0.25) < 1e-9);
  });

  it('clamps deficit to zero when current already meets or exceeds benchmark', () => {
    const result = computeDeficit({
      id: 'attackEfficiency', current: 0.5, benchmark: 0.4, higherIsBetter: true, sampleSize: 50,
    });
    assert.strictEqual(result.deficit, 0);
  });

  it('flips the comparison for lower-is-better metrics', () => {
    const result = computeDeficit({
      id: 'receptionErrorsPerSet', current: 1.2, benchmark: 0.8, higherIsBetter: false, sampleSize: 50,
    });
    assert.ok(Math.abs(result.deficit! - 0.4) < 1e-9);
  });

  it('returns null deficit/relativeGap when current or benchmark is missing', () => {
    const noCurrent = computeDeficit({
      id: 'x', current: null, benchmark: 0.4, higherIsBetter: true, sampleSize: 0,
    });
    const noBenchmark = computeDeficit({
      id: 'x', current: 0.4, benchmark: null, higherIsBetter: true, sampleSize: 10,
    });
    assert.strictEqual(noCurrent.deficit, null);
    assert.strictEqual(noCurrent.relativeGap, null);
    assert.strictEqual(noBenchmark.deficit, null);
    assert.strictEqual(noBenchmark.relativeGap, null);
  });

  it('returns null relativeGap when the benchmark is ~0 (avoids division blow-up)', () => {
    const result = computeDeficit({
      id: 'x', current: -0.1, benchmark: 0, higherIsBetter: true, sampleSize: 10,
    });
    assert.ok(result.deficit! > 0);
    assert.strictEqual(result.relativeGap, null);
  });

  it('reports the 5 trend tiers by signed relative distance from benchmark', () => {
    const tierFor = (current: number, benchmark: number) => computeDeficit({
      id: 'x', current, benchmark, higherIsBetter: true, sampleSize: 50,
    }).trend;

    assert.strictEqual(tierFor(0.5, 0.4), 'up-strong'); // +25%
    assert.strictEqual(tierFor(0.43, 0.4), 'up'); // +7.5%
    assert.strictEqual(tierFor(0.4, 0.4), 'flat'); // 0%
    assert.strictEqual(tierFor(0.37, 0.4), 'down'); // -7.5%
    assert.strictEqual(tierFor(0.3, 0.4), 'down-strong'); // -25%
  });

  it('flips trend direction for lower-is-better metrics', () => {
    const result = computeDeficit({
      id: 'x', current: 0.3, benchmark: 0.4, higherIsBetter: false, sampleSize: 50,
    });
    // Current is below benchmark and lower is better here, so this is an improvement.
    assert.strictEqual(result.trend, 'up-strong');
  });

  it('returns null trend when current or benchmark is missing', () => {
    const result = computeDeficit({
      id: 'x', current: null, benchmark: 0.4, higherIsBetter: true, sampleSize: 0,
    });
    assert.strictEqual(result.trend, null);
  });
});

describe('rankDeficits', () => {
  it('sorts worst-first by relative gap and pushes unresolved categories last', () => {
    const results = [
      computeDeficit({
        id: 'small-gap', current: 0.38, benchmark: 0.4, higherIsBetter: true, sampleSize: 20,
      }),
      computeDeficit({
        id: 'big-gap', current: 0.1, benchmark: 0.4, higherIsBetter: true, sampleSize: 20,
      }),
      computeDeficit({
        id: 'no-data', current: null, benchmark: null, higherIsBetter: true, sampleSize: 0,
      }),
    ];

    const ranked = rankDeficits(results);
    assert.deepStrictEqual(ranked.map((r) => r.id), ['big-gap', 'small-gap', 'no-data']);
  });
});

describe('hasEnoughSample', () => {
  it('uses the default minimum when none is given', () => {
    assert.strictEqual(hasEnoughSample(DEFAULT_MIN_SAMPLE_SIZE), true);
    assert.strictEqual(hasEnoughSample(DEFAULT_MIN_SAMPLE_SIZE - 1), false);
  });

  it('accepts a custom minimum', () => {
    assert.strictEqual(hasEnoughSample(3, 5), false);
    assert.strictEqual(hasEnoughSample(5, 5), true);
  });
});
