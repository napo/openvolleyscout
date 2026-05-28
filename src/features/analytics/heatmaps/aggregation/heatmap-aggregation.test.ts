/**
 * Heatmap aggregation tests.
 * Runs under Node.js via ts-node/esm.
 * Value imports use relative paths — @src/ aliases are type-only.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { BallTouch } from '@src/domain/touch/types';
import type { BallDirection } from '@src/domain/trajectory/types';
import {
  extractHeatmapEvents,
  buildDensityGrid,
  countInferredEvents,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
} from './heatmap-aggregation';

// ─── Helpers ────────────────────────────────────────────────────────────────

let seq = 1;
function nextId(): string {
  return `t-${String(seq++).padStart(4, '0')}`;
}

function makeDirection(sx: number, sy: number, ex: number, ey: number): BallDirection {
  return { start: { x: sx, y: sy }, end: { x: ex, y: ey } };
}

function makeTouch(
  overrides: Partial<BallTouch> & Pick<BallTouch, 'setNumber' | 'rallyNumber' | 'sequenceNumber' | 'teamSide' | 'skill'>,
): BallTouch {
  return {
    id: nextId(),
    evaluation: undefined,
    createdAt: overrides.sequenceNumber,
    ...overrides,
  };
}

function makeTouchWithDirection(
  sx: number, sy: number, ex: number, ey: number,
  overrides?: Partial<BallTouch>,
): BallTouch {
  return makeTouch({
    setNumber: 1,
    rallyNumber: 1,
    sequenceNumber: 1,
    teamSide: 'home',
    skill: 'attack',
    ballDirection: makeDirection(sx, sy, ex, ey),
    ...overrides,
  });
}

// ─── extractHeatmapEvents ─────────────────────────────────────────────────────

describe('extractHeatmapEvents', () => {
  it('returns empty array for empty touches', () => {
    const result = extractHeatmapEvents([]);
    assert.strictEqual(result.length, 0);
  });

  it('skips touches without any direction data', () => {
    const touch = makeTouch({
      setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', skill: 'attack',
    });
    const result = extractHeatmapEvents([touch]);
    assert.strictEqual(result.length, 0);
  });

  it('extracts event from touch with ballDirection', () => {
    const touch = makeTouchWithDirection(20, 30, 60, 70);
    const result = extractHeatmapEvents([touch]);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].start, { x: 20, y: 30 });
    assert.deepStrictEqual(result[0].end, { x: 60, y: 70 });
    assert.strictEqual(result[0].teamSide, 'home');
    assert.strictEqual(result[0].skill, 'attack');
    assert.strictEqual(result[0].isInferred, false);
  });

  it('marks touch as inferred when source is inferred', () => {
    const touch = makeTouchWithDirection(20, 30, 60, 70, { source: 'inferred' });
    const result = extractHeatmapEvents([touch]);
    assert.strictEqual(result[0].isInferred, true);
  });

  it('marks touch as inferred when trajectory.inferred is true', () => {
    const id = nextId();
    const touch = makeTouchWithDirection(20, 30, 60, 70, {
      trajectory: {
        id: `traj-${id}`,
        direction: { start: { x: 20, y: 30 }, end: { x: 60, y: 70 } },
        inferred: true,
      },
    });
    const result = extractHeatmapEvents([touch]);
    assert.strictEqual(result[0].isInferred, true);
  });

  it('preserves evaluation and playerId', () => {
    const touch = makeTouchWithDirection(20, 30, 60, 70, {
      evaluation: '#',
      playerId: 'p-001',
    });
    const result = extractHeatmapEvents([touch]);
    assert.strictEqual(result[0].evaluation, '#');
    assert.strictEqual(result[0].playerId, 'p-001');
  });

  it('processes multiple touches, skipping those without direction', () => {
    const t1 = makeTouchWithDirection(10, 20, 80, 70);
    const t2 = makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 2, teamSide: 'away', skill: 'receive' });
    const t3 = makeTouchWithDirection(50, 50, 30, 30, { teamSide: 'away', skill: 'serve' });
    const result = extractHeatmapEvents([t1, t2, t3]);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].skill, 'attack');
    assert.strictEqual(result[1].skill, 'serve');
  });
});

// ─── countInferredEvents ──────────────────────────────────────────────────────

describe('countInferredEvents', () => {
  it('counts zero when no events', () => {
    assert.strictEqual(countInferredEvents([]), 0);
  });

  it('counts only inferred events', () => {
    const t1 = makeTouchWithDirection(20, 30, 60, 70);
    const t2 = makeTouchWithDirection(20, 30, 60, 70, { source: 'inferred' });
    const events = extractHeatmapEvents([t1, t2]);
    assert.strictEqual(countInferredEvents(events), 1);
  });
});

// ─── buildDensityGrid ─────────────────────────────────────────────────────────

describe('buildDensityGrid', () => {
  it('returns empty cells for empty events', () => {
    const grid = buildDensityGrid([]);
    assert.strictEqual(grid.cells.length, 0);
    assert.strictEqual(grid.maxCount, 0);
    assert.strictEqual(grid.totalPoints, 0);
  });

  it('uses DEFAULT_GRID_COLS and DEFAULT_GRID_ROWS', () => {
    const grid = buildDensityGrid([]);
    assert.strictEqual(grid.cols, DEFAULT_GRID_COLS);
    assert.strictEqual(grid.rows, DEFAULT_GRID_ROWS);
  });

  it('bins end point into correct cell', () => {
    // Court: x=[12,88], y=[12,88], 12 cols → cellWidth = 76/12 ≈ 6.33
    // A point at x=50, y=50 → col = floor((50-12)/6.33) ≈ floor(6.0) = 6
    //                          row = floor((50-12)/6.33) ≈ 6
    const t = makeTouchWithDirection(20, 20, 50, 50);
    const events = extractHeatmapEvents([t]);
    const grid = buildDensityGrid(events, true);
    assert.strictEqual(grid.cells.length, 1);
    assert.strictEqual(grid.cells[0].count, 1);
    assert.strictEqual(grid.cells[0].density, 1);
  });

  it('bins start point when useEndPoint=false', () => {
    const t = makeTouchWithDirection(50, 50, 80, 80);
    const events = extractHeatmapEvents([t]);
    const gridEnd = buildDensityGrid(events, true);
    const gridStart = buildDensityGrid(events, false);
    // End is at (80,80) → different cell than start (50,50)
    assert.notStrictEqual(gridEnd.cells[0].col, gridStart.cells[0].col);
  });

  it('accumulates count for multiple points in same cell', () => {
    const t1 = makeTouchWithDirection(20, 20, 50, 50);
    const t2 = makeTouchWithDirection(30, 30, 51, 51);
    const events = extractHeatmapEvents([t1, t2]);
    const grid = buildDensityGrid(events, true);
    // Both end points (50,50) and (51,51) should land in same or adjacent cells
    const total = grid.cells.reduce((s, c) => s + c.count, 0);
    assert.strictEqual(total, 2);
    assert.strictEqual(grid.totalPoints, 2);
  });

  it('normalizes density relative to max count', () => {
    // 3 points in one cell, 1 in another
    const t1 = makeTouchWithDirection(20, 20, 50, 50);
    const t2 = makeTouchWithDirection(30, 30, 51, 51);
    const t3 = makeTouchWithDirection(25, 25, 52, 52);
    const t4 = makeTouchWithDirection(20, 20, 80, 80); // different cell
    const events = extractHeatmapEvents([t1, t2, t3, t4]);
    const grid = buildDensityGrid(events, true);
    assert.strictEqual(grid.maxCount, 3);
    const hotCell = grid.cells.find((c) => c.count === 3);
    assert.ok(hotCell);
    assert.strictEqual(hotCell.density, 1);
    const coldCell = grid.cells.find((c) => c.count === 1);
    assert.ok(coldCell);
    assert.ok(coldCell.density < 1);
  });

  it('clamps out-of-court points to grid boundary', () => {
    // Point at x=0, y=0 (outside court but inside stage)
    const t = makeTouchWithDirection(50, 50, 0, 0);
    const events = extractHeatmapEvents([t]);
    const grid = buildDensityGrid(events, true);
    assert.strictEqual(grid.cells.length, 1);
    assert.strictEqual(grid.cells[0].col, 0);
    assert.strictEqual(grid.cells[0].row, 0);
  });

  it('cellX and cellY are correct stage coordinates', () => {
    const t = makeTouchWithDirection(20, 20, 12, 12); // top-left corner
    const events = extractHeatmapEvents([t]);
    const grid = buildDensityGrid(events, true);
    assert.strictEqual(grid.cells.length, 1);
    // Top-left cell: col=0, row=0, cellX=12, cellY=12
    assert.strictEqual(grid.cells[0].col, 0);
    assert.strictEqual(grid.cells[0].row, 0);
    assert.strictEqual(grid.cells[0].cellX, 12);
    assert.strictEqual(grid.cells[0].cellY, 12);
  });

  it('supports custom grid dimensions', () => {
    const t = makeTouchWithDirection(20, 20, 50, 50);
    const events = extractHeatmapEvents([t]);
    const grid = buildDensityGrid(events, true, 6, 6);
    assert.strictEqual(grid.cols, 6);
    assert.strictEqual(grid.rows, 6);
    assert.ok(Math.abs(grid.cellWidth - 76 / 6) < 0.001);
  });
});
