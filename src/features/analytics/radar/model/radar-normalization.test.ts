/**
 * Radar normalization tests.
 * Runs under Node.js via ts-node/esm.
 * Value imports use relative paths — @src/ aliases are type-only.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  normalizeRadarSeries,
  toRechartsRadarData,
  type RadarSeries,
} from './radar-normalization';
import type { RadarAxisId } from './radar-metrics';

const AXES: RadarAxisId[] = ['serveEfficiency', 'sideOutPct'];

function series(seriesId: string, serveEfficiency: number | null, sideOutPct: number | null): RadarSeries {
  return { seriesId, label: seriesId, values: { serveEfficiency, sideOutPct } };
}

describe('normalizeRadarSeries — relative mode', () => {
  it('rescales two series to 0/100 on each axis (min->0, max->100)', () => {
    const result = normalizeRadarSeries(
      [series('home', 0.2, 0.4), series('away', -0.1, 0.6)],
      AXES,
      'relative',
    );
    const serveAxis = result.find((p) => p.axis === 'serveEfficiency')!;
    assert.strictEqual(serveAxis.normalized.home, 100);
    assert.strictEqual(serveAxis.normalized.away, 0);
    assert.strictEqual(serveAxis.raw.home, 0.2);
    assert.strictEqual(serveAxis.raw.away, -0.1);

    const sideOutAxis = result.find((p) => p.axis === 'sideOutPct')!;
    assert.strictEqual(sideOutAxis.normalized.home, 0);
    assert.strictEqual(sideOutAxis.normalized.away, 100);
  });

  it('rescales three series with the middle one landing between 0 and 100', () => {
    const result = normalizeRadarSeries(
      [series('a', 0, null), series('b', 0.5, null), series('c', 1, null)],
      ['serveEfficiency'],
      'relative',
    );
    const axis = result[0];
    assert.strictEqual(axis.normalized.a, 0);
    assert.strictEqual(axis.normalized.b, 50);
    assert.strictEqual(axis.normalized.c, 100);
  });

  it('falls back to the theoretical range when all series share the same value', () => {
    // serveEfficiency theoretical range is [-1, 1]; raw 0.5 -> (0.5-(-1))/(1-(-1))*100 = 75
    const result = normalizeRadarSeries(
      [series('a', 0.5, null), series('b', 0.5, null)],
      ['serveEfficiency'],
      'relative',
    );
    assert.strictEqual(result[0].normalized.a, 75);
    assert.strictEqual(result[0].normalized.b, 75);
  });

  it('keeps null raw values as null in both raw and normalized, excluded from min/max', () => {
    const result = normalizeRadarSeries(
      [series('a', null, null), series('b', 0.2, null)],
      ['serveEfficiency'],
      'relative',
    );
    assert.strictEqual(result[0].raw.a, null);
    assert.strictEqual(result[0].normalized.a, null);
    // Only one non-null value present -> falls back to theoretical range too.
    // serveEfficiency [-1,1]: (0.2-(-1))/(1-(-1))*100 = 60
    assert.strictEqual(result[0].normalized.b, 60);
  });
});

describe('normalizeRadarSeries — fixed mode', () => {
  it('uses the theoretical range regardless of the series values shown', () => {
    // serveEfficiency [-1,1]: raw 0 -> 50%, raw 1 -> 100%
    const result = normalizeRadarSeries(
      [series('a', 0, null), series('b', 1, null)],
      ['serveEfficiency'],
      'fixed',
    );
    assert.strictEqual(result[0].normalized.a, 50);
    assert.strictEqual(result[0].normalized.b, 100);
  });
});

describe('toRechartsRadarData', () => {
  it('produces one row per axis with all series keys present', () => {
    const points = normalizeRadarSeries(
      [series('home', 0.2, 0.4), series('away', -0.1, 0.6)],
      AXES,
      'relative',
    );
    const rows = toRechartsRadarData(points, { serveEfficiency: 'Serve efficiency', sideOutPct: 'Side-out %' });
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].axis, 'Serve efficiency');
    assert.strictEqual(rows[1].axis, 'Side-out %');
    for (const row of rows) {
      assert.ok('home' in row);
      assert.ok('away' in row);
    }
  });

  it('falls back to the raw axis id when no label is supplied', () => {
    const points = normalizeRadarSeries([series('home', 0.2, 0.4)], ['serveEfficiency'], 'relative');
    const rows = toRechartsRadarData(points);
    assert.strictEqual(rows[0].axis, 'serveEfficiency');
  });
});
