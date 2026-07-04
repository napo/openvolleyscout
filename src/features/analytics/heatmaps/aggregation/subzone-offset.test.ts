/**
 * Runs under Node.js via ts-node/esm. Value imports use relative paths —
 * @src/ aliases are type-only (see heatmap-aggregation.test.ts).
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveSubzoneOffset, jitterOffsetForId } from './subzone-offset';

describe('resolveSubzoneOffset', () => {
  it('places an away-side point near the net at a low row offset', () => {
    // Away side spans x in [12, 50); away net edge is at x=50, so a point
    // just left of it sits at the net-most edge of its subzone cell.
    const { dRow } = resolveSubzoneOffset({ x: 49.9, y: 20 });
    assert.ok(dRow < 0.2, `expected near-net dRow, got ${dRow}`);
  });

  it('places an away-side point on the baseline at a high row offset', () => {
    const { dRow } = resolveSubzoneOffset({ x: 12.1, y: 20 });
    assert.ok(dRow > 0.8, `expected baseline dRow, got ${dRow}`);
  });

  it('places a home-side point near the net at a low row offset (mirrored axis)', () => {
    // Home side spans x in [50, 88]; home net edge is at x=50.
    const { dRow } = resolveSubzoneOffset({ x: 50.1, y: 20 });
    assert.ok(dRow < 0.2, `expected near-net dRow, got ${dRow}`);
  });

  it('keeps offsets within [0, 1] for out-of-court points', () => {
    const { dCol, dRow } = resolveSubzoneOffset({ x: -20, y: 150 });
    assert.ok(dCol >= 0 && dCol <= 1);
    assert.ok(dRow >= 0 && dRow <= 1);
  });
});

describe('jitterOffsetForId', () => {
  it('is deterministic for the same id', () => {
    const a = jitterOffsetForId('touch-123');
    const b = jitterOffsetForId('touch-123');
    assert.deepStrictEqual(a, b);
  });

  it('stays within the inner [0.2, 0.8] band', () => {
    const { dCol, dRow } = jitterOffsetForId('touch-abc');
    assert.ok(dCol >= 0.2 && dCol <= 0.8);
    assert.ok(dRow >= 0.2 && dRow <= 0.8);
  });

  it('varies across different ids', () => {
    const a = jitterOffsetForId('touch-1');
    const b = jitterOffsetForId('touch-2');
    assert.notDeepStrictEqual(a, b);
  });
});
