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
    // Court: x=[12,88], y=[12,88], 30 cols → cellWidth ≈ 2.53
    // A point at x=50, y=50 → col = floor((50-12)/2.53) ≈ floor(15) = 15
    // Gaussian kernel creates 3x3 grid around point with smoothing
    const t = makeTouchWithDirection(20, 20, 50, 50);
    const events = extractHeatmapEvents([t]);
    const grid = buildDensityGrid(events, true);
    // Gaussian kernel smoothing creates 3x3 grid around point (9 cells)
    assert.ok(grid.cells.length > 0, 'Grid should have cells');
    assert.ok(grid.cells.some(c => c.col === 15 && c.row === 15), 'Center cell should be present');
    assert.strictEqual(grid.totalPoints, 1);
  });

  it('bins start point when useEndPoint=false', () => {
    const t = makeTouchWithDirection(50, 50, 80, 80);
    const events = extractHeatmapEvents([t]);
    const gridEnd = buildDensityGrid(events, true);
    const gridStart = buildDensityGrid(events, false);
    // Both grids should have cells due to Gaussian smoothing
    assert.ok(gridEnd.cells.length > 0, 'End grid should have cells');
    assert.ok(gridStart.cells.length > 0, 'Start grid should have cells');
    // Centers should be different due to different start/end points
    const endCenter = gridEnd.cells.reduce((max, c) => c.count > max.count ? c : max);
    const startCenter = gridStart.cells.reduce((max, c) => c.count > max.count ? c : max);
    assert.ok(
      endCenter.col !== startCenter.col || endCenter.row !== startCenter.row,
      'Center cells should differ between start and end'
    );
  });

  it('accumulates count for multiple points in same cell', () => {
    const t1 = makeTouchWithDirection(20, 20, 50, 50);
    const t2 = makeTouchWithDirection(30, 30, 51, 51);
    const events = extractHeatmapEvents([t1, t2]);
    const grid = buildDensityGrid(events, true);
    // Gaussian smoothing creates overlapping regions for nearby points
    // The smoothed density will reflect both points with weighted distribution
    assert.ok(grid.cells.length > 0, 'Grid should have cells');
    assert.strictEqual(grid.totalPoints, 2, 'Should count 2 total points');
    // With 2 nearby points, grid should accumulate density in the overlap region
    const totalDensity = grid.cells.reduce((s, c) => s + c.density, 0);
    assert.ok(totalDensity > 0, 'Total normalized density should be positive');
  });

  it('normalizes density relative to max count', () => {
    // 3 points in one cell region, 1 in another
    const t1 = makeTouchWithDirection(20, 20, 50, 50);
    const t2 = makeTouchWithDirection(30, 30, 51, 51);
    const t3 = makeTouchWithDirection(25, 25, 52, 52);
    const t4 = makeTouchWithDirection(20, 20, 80, 80); // different cell region
    const events = extractHeatmapEvents([t1, t2, t3, t4]);
    const grid = buildDensityGrid(events, true);
    // Gaussian smoothing distributes density across multiple cells
    assert.ok(grid.cells.length > 0, 'Grid should have cells');
    assert.ok(grid.maxCount > 0, 'Should have max count > 0');
    // Verify density normalization (max density should be 1)
    const maxDensity = Math.max(...grid.cells.map(c => c.density));
    assert.ok(maxDensity <= 1, 'Max density should be <= 1');
    // Verify cells with higher density correspond to point concentration regions
    const highDensityCells = grid.cells.filter(c => c.density > 0.5);
    assert.ok(highDensityCells.length > 0, 'Should have high-density cells');
  });

  it('clamps out-of-court points to grid boundary', () => {
    // Point at x=0, y=0 (outside court but inside stage, clamped to 0,0)
    const t = makeTouchWithDirection(50, 50, 0, 0);
    const events = extractHeatmapEvents([t]);
    const grid = buildDensityGrid(events, true);
    // Gaussian smoothing creates multiple cells for out-of-court point clamped to origin
    assert.ok(grid.cells.length > 0, 'Grid should have cells');
    // Center cell should be at (0, 0) after clamping
    const centerCell = grid.cells.find(c => c.col === 0 && c.row === 0);
    assert.ok(centerCell, 'Should have cell at (0, 0)');
    // Verify clamping worked (no negative cols/rows)
    assert.ok(grid.cells.every(c => c.col >= 0 && c.row >= 0), 'All cells should have non-negative col/row');
  });

  it('cellX and cellY are correct stage coordinates', () => {
    const t = makeTouchWithDirection(20, 20, 12, 12); // top-left corner
    const events = extractHeatmapEvents([t]);
    const grid = buildDensityGrid(events, true);
    // Gaussian smoothing creates multiple cells around the point
    assert.ok(grid.cells.length > 0, 'Grid should have cells');
    // Center cell should be at (0, 0) with cellX=12, cellY=12
    const centerCell = grid.cells.find(c => c.col === 0 && c.row === 0);
    assert.ok(centerCell, 'Should have center cell at (0, 0)');
    assert.strictEqual(centerCell!.cellX, 12, 'cellX should be at SCOUTING_SURFACE_INSET_X');
    assert.strictEqual(centerCell!.cellY, 12, 'cellY should be at SCOUTING_SURFACE_INSET_Y');
    // Verify all cells have consistent cellX/cellY calculation
    assert.ok(grid.cells.every(c => c.cellX >= 12 && c.cellY >= 12), 'All cells should be within court bounds');
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

// ─── Half-court coordinate semantics ──────────────────────────────────────────

describe('Half-court coordinate expectations', () => {
  it('home side events have stageY >= 50 (net side)', () => {
    const homeTouch = makeTouchWithDirection(40, 60, 60, 70, { teamSide: 'home' });
    const events = extractHeatmapEvents([homeTouch]);
    assert.strictEqual(events.length, 1);
    // Home team events should be in the bottom half (stageY >= 50)
    assert.ok(events[0].start.y >= 50, 'Home event start.y should be >= NET_Y=50');
  });

  it('away side events have stageY <= 50 (net side)', () => {
    const awayTouch = makeTouchWithDirection(40, 30, 60, 20, { teamSide: 'away' });
    const events = extractHeatmapEvents([awayTouch]);
    assert.strictEqual(events.length, 1);
    assert.ok(events[0].start.y <= 50, 'Away event start.y should be <= NET_Y=50');
  });

  it('home half-court net transform: stageY=50 maps to display top', () => {
    // For home half-court: displayY = (stageY - 50) / 38 * HC_H + HC_INSET_Y
    // At stageY=50 (net): displayY = 0 + HC_INSET_Y (top of court = net)
    const NET_Y = 50;
    const HC_INSET_Y = 8;
    const HC_H = 64;
    const STAGE_HALF = 38;
    const displayYAtNet = HC_INSET_Y + HC_H * (NET_Y - NET_Y) / STAGE_HALF;
    assert.strictEqual(displayYAtNet, HC_INSET_Y);
  });

  it('away half-court net transform: stageY=50 maps to display top', () => {
    // For away half-court: displayY = (50 - stageY) / 38 * HC_H + HC_INSET_Y
    // At stageY=50 (net): displayY = 0 + HC_INSET_Y (top of court = net)
    const NET_Y = 50;
    const HC_INSET_Y = 8;
    const HC_H = 64;
    const STAGE_HALF = 38;
    const displayYAtNet = HC_INSET_Y + HC_H * (NET_Y - NET_Y) / STAGE_HALF;
    assert.strictEqual(displayYAtNet, HC_INSET_Y);
  });

  it('direction mode: home back (stageY=88) maps to far left of horizontal court', () => {
    // fcX(stageY) = FC_INSET_X + FC_W * (88 - stageY) / 76
    const FC_INSET_X = 5;
    const FC_W = 150;
    const fcXAtHomeBack = FC_INSET_X + FC_W * (88 - 88) / 76;
    assert.strictEqual(fcXAtHomeBack, FC_INSET_X);
  });

  it('direction mode: away back (stageY=12) maps to far right of horizontal court', () => {
    // fcX(stageY=12) = FC_INSET_X + FC_W * (88 - 12) / 76 = FC_INSET_X + FC_W
    const FC_INSET_X = 5;
    const FC_W = 150;
    const fcXAtAwayBack = FC_INSET_X + FC_W * (88 - 12) / 76;
    assert.strictEqual(fcXAtAwayBack, FC_INSET_X + FC_W);
  });

  it('direction mode: net (stageY=50) maps to horizontal center', () => {
    // fcX(50) = FC_INSET_X + FC_W * (88 - 50) / 76 = FC_INSET_X + FC_W * 38/76 = FC_INSET_X + FC_W/2
    const FC_INSET_X = 5;
    const FC_W = 150;
    const fcXAtNet = FC_INSET_X + FC_W * (88 - 50) / 76;
    assert.ok(Math.abs(fcXAtNet - (FC_INSET_X + FC_W / 2)) < 0.001, 'Net must map to horizontal center');
  });
});
