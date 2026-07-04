import { useEffect, useRef, useMemo, useState } from 'react';
import SimpleHeat from 'simpleheat';
import { useTranslation } from '@src/i18n';
import type { MatchStats, RallyStats } from '@src/features/scouting/model/match-stats';
import type { BallTouch } from '@src/domain/touch/types';
import type { HeatmapSkillFilter } from '../filters/heatmap-filters';
import type { DashboardFilters } from '../../dashboard/filters/dashboard-filters';
import { ALL_EVALUATIONS } from '../../dashboard/filters/dashboard-filters';
import { getTeamsToShow } from '../../dashboard/selectors/dashboard-selectors';
import { useFilterActions } from '../../stores/filter-selectors';
import type { SkillEvaluation } from '@src/domain/common/enums';
import { classifyRallyTouchPhases, TOUCH_PHASES } from '../../rally-phase/rally-phase-classifier';
import type { TouchPhase } from '../../rally-phase/rally-phase-classifier';
import { extractHeatmapEvents, type HeatmapEvent } from '../aggregation/heatmap-aggregation';
import { resolveSubzoneOffset, jitterOffsetForId } from '../aggregation/subzone-offset';
import { useAppStore } from '@src/app/store/app-store';

/**
 * A single touch plotted at a continuous position (in 0..6 grid units) instead
 * of collapsed onto its subzone's cell center. Real stage coordinates (live
 * scouting, or DataVolley-import-synthesized ones) win when available via
 * `extractHeatmapEvents`; touches with only a zone code (e.g. text-code entry)
 * fall back to a deterministic per-touch jitter so every source ends up with
 * an organic scatter instead of a single stacked dot.
 */
interface DensityPoint {
  col: number;
  row: number;
}

function buildHeatEventMap(rallies: readonly RallyStats[]): Map<string, HeatmapEvent> {
  const map = new Map<string, HeatmapEvent>();
  for (const rally of rallies) {
    for (const event of extractHeatmapEvents(rally.touches)) {
      map.set(event.touchId, event);
    }
  }
  return map;
}

const PHASE_I18N_KEYS: Record<TouchPhase, string> = {
  break_point: 'rallyPhaseBreakPoint',
  point: 'rallyPhasePoint',
  transition: 'rallyPhaseTransition',
};

type VisualizationMode = 'density' | 'color-zones' | 'point-cloud';

// Single-court top-down view (net at top, back line at bottom)
const COURT_ZONE_LAYOUT = [[4, 3, 2], [7, 8, 9], [5, 6, 1]] as const;

// Two-panel horizontal view (net = separator, depth = columns, position = rows)
// Left panel (start zones):  col0=back  col1=3m  col2=front(near net)
// Right panel (end zones):   col0=front col1=3m  col2=back  (mirrored)
const LEFT_ZONE_LAYOUT = [[5, 7, 4], [6, 8, 3], [1, 9, 2]] as const;
const RIGHT_ZONE_LAYOUT = [[2, 9, 1], [3, 8, 6], [4, 7, 5]] as const;
const SUBZONE_ORDER = ['C', 'B', 'D', 'A'] as const;
type SubzoneLetter = typeof SUBZONE_ORDER[number];

function parseZoneCode(zoneCode: string): { zoneNum: number; subzone: SubzoneLetter } | null {
  const normalized = zoneCode.trim().toUpperCase();
  const zoneNum = parseInt(normalized.charAt(0), 10);
  if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) return null;

  const subzone = normalized.length > 1 ? normalized.charAt(1) : 'C';
  if (!SUBZONE_ORDER.includes(subzone as SubzoneLetter)) return null;

  return { zoneNum, subzone: subzone as SubzoneLetter };
}

function gaussianKernel(size: number, sigma: number): number[][] {
  const kernel: number[][] = [];
  const half = Math.floor(size / 2);
  let sum = 0;

  for (let y = -half; y <= half; y++) {
    const row: number[] = [];
    for (let x = -half; x <= half; x++) {
      const v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      row.push(v);
      sum += v;
    }
    kernel.push(row);
  }

  return kernel.map(row => row.map(v => v / sum));
}

function smoothGrid(grid: number[][], sigma: number = 0.9): number[][] {
  const kernel = gaussianKernel(5, sigma);
  const half = 2;
  const rows = grid.length;
  const cols = grid[0].length;

  return grid.map((row, y) =>
    row.map((_, x) => {
      let acc = 0;

      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const yy = Math.min(rows - 1, Math.max(0, y + ky));
          const xx = Math.min(cols - 1, Math.max(0, x + kx));
          acc += grid[yy][xx] * kernel[ky + half][kx + half];
        }
      }

      return acc;
    })
  );
}

function bilinearInterpolate(grid: number[][], x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const rows = grid.length;
  const cols = grid[0].length;

  const x0 = Math.max(0, Math.min(cols - 1, xi));
  const x1 = Math.max(0, Math.min(cols - 1, xi + 1));
  const y0 = Math.max(0, Math.min(rows - 1, yi));
  const y1 = Math.max(0, Math.min(rows - 1, yi + 1));

  const v00 = grid[y0][x0];
  const v10 = grid[y0][x1];
  const v01 = grid[y1][x0];
  const v11 = grid[y1][x1];

  const v0 = v00 * (1 - xf) + v10 * xf;
  const v1 = v01 * (1 - xf) + v11 * xf;

  return v0 * (1 - yf) + v1 * yf;
}

function valueToRGBA(t: number): [number, number, number, number] {
  t = Math.max(0, Math.min(1, t));
  // Gradiente: verde scuro (minimo) -> verde -> verde-lime -> giallo-oro -> arancio -> rosso (massimo)
  const colors = [
    [22, 163, 74],     // verde scuro #16a34a (t=0, minimo - 0%)
    [34, 197, 94],     // verde medio #22c55e (t=0.2)
    [163, 230, 53],    // verde-lime #a3e635 (t=0.4)
    [234, 179, 8],     // giallo-oro #eab308 (t=0.6)
    [249, 115, 22],    // arancio #f97316 (t=0.8)
    [220, 38, 38],     // rosso #dc2626 (t=1.0, massimo - 100%)
  ];

  const index = t * (colors.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  let r, g, b;
  if (lower === upper) {
    const [r_, g_, b_] = colors[lower];
    r = r_;
    g = g_;
    b = b_;
  } else {
    const [r1, g1, b1] = colors[lower];
    const [r2, g2, b2] = colors[upper];
    r = Math.round(r1 + (r2 - r1) * fraction);
    g = Math.round(g1 + (g2 - g1) * fraction);
    b = Math.round(b1 + (b2 - b1) * fraction);
  }

  // Alpha sempre opaco
  return [r, g, b, 255];
}

function valueToSaturatedRGBA(t: number): [number, number, number, number] {
  // Usa lo stesso gradiente di valueToRGBA per tutte le heatmap
  return valueToRGBA(t);
}

function hslToRgba(h: number, s: number, l: number): [number, number, number, number] {
  const c = ((100 - Math.abs(2 * l - 100)) / 100) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    255
  ];
}

function getZoneCellCenter(
  zoneCode: string,
  layout: readonly (readonly number[])[] = LEFT_ZONE_LAYOUT,
): { col: number; row: number } | null {
  const parsedZone = parseZoneCode(zoneCode);
  if (!parsedZone) return null;

  let zoneRowIdx = -1;
  let zoneColIdx = -1;

  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[r].length; c++) {
      if (layout[r][c] === parsedZone.zoneNum) {
        zoneRowIdx = r;
        zoneColIdx = c;
        break;
      }
    }
    if (zoneRowIdx !== -1) break;
  }

  if (zoneRowIdx === -1) return null;

  const subIdx = SUBZONE_ORDER.indexOf(parsedZone.subzone);

  const gridColStart = zoneColIdx * 2;
  const gridRowStart = zoneRowIdx * 2;
  const gridCol = gridColStart + (subIdx % 2);
  const gridRow = gridRowStart + Math.floor(subIdx / 2);

  return { col: gridCol, row: gridRow };
}

function resolveTouchOffset(
  touch: BallTouch,
  heatEvents: Map<string, HeatmapEvent>,
  useEndPoint: boolean,
): { dCol: number; dRow: number } {
  const event = heatEvents.get(touch.id);
  const point = event ? (useEndPoint ? event.end : event.start) : undefined;
  return point ? resolveSubzoneOffset(point) : jitterOffsetForId(touch.id);
}

function buildHeatPointsForTeam(
  rallies: readonly RallyStats[],
  skill: HeatmapSkillFilter,
  teamSide: 'home' | 'away',
  filters: DashboardFilters | undefined,
  startZoneFilter: string | undefined,
  heatEvents: Map<string, HeatmapEvent>,
  rallyPhaseFilter: 'all' | TouchPhase = 'all',
): DensityPoint[] {
  const points: DensityPoint[] = [];

  for (const rally of rallies) {
    const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;
      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && (!touch.startZoneCode || touch.startZoneCode.charAt(0) !== startZoneFilter)) continue;

      const useStart = touch.skill === 'receive';
      const zoneCode = useStart ? touch.startZoneCode : touch.endZoneCode;
      if (!zoneCode) continue;

      const cell = getZoneCellCenter(zoneCode, COURT_ZONE_LAYOUT);
      if (!cell) continue;

      const offset = resolveTouchOffset(touch, heatEvents, !useStart);
      points.push({ col: cell.col + offset.dCol, row: cell.row + offset.dRow });
    }
  }

  return points;
}

function buildEndZoneHeatPoints(
  rallies: readonly RallyStats[],
  skill: HeatmapSkillFilter,
  teamSide: 'home' | 'away',
  filters: DashboardFilters | undefined,
  startZoneFilter: string | undefined,
  heatEvents: Map<string, HeatmapEvent>,
  rallyPhaseFilter: 'all' | TouchPhase = 'all',
): DensityPoint[] {
  const points: DensityPoint[] = [];

  for (const rally of rallies) {
    const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;
      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && (!touch.startZoneCode || touch.startZoneCode.charAt(0) !== startZoneFilter)) continue;

      const zoneCode = touch.endZoneCode;
      if (!zoneCode) continue;

      const cell = getZoneCellCenter(zoneCode, RIGHT_ZONE_LAYOUT);
      if (!cell) continue;

      const offset = resolveTouchOffset(touch, heatEvents, true);
      points.push({ col: cell.col + offset.dCol, row: cell.row + offset.dRow });
    }
  }

  return points;
}

// Sentinel column for a serve's origin: the server stands outside the
// court behind their own baseline, not in one of the in-court zone cells.
const SERVE_OUTSIDE_COL = -1;

function buildArrowsForTeam(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string, rallyPhaseFilter: 'all' | TouchPhase = 'all'): Arrow[] {
  const arrows: Arrow[] = [];
  const arrowMap = new Map<string, number>();

  for (const rally of rallies) {
    const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
    for (const touch of rally.touches) {
      if (!['attack', 'receive', 'serve'].includes(touch.skill)) continue;
      if (touch.teamSide !== teamSide) continue;
      if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;
      if (!touch.startZoneCode || !touch.endZoneCode) continue;

      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && touch.startZoneCode.charAt(0) !== startZoneFilter) continue;

      let fromPos = getZoneCellCenter(touch.startZoneCode, LEFT_ZONE_LAYOUT);
      const toPos = getZoneCellCenter(touch.endZoneCode, RIGHT_ZONE_LAYOUT);

      if (!fromPos || !toPos) continue;

      if (touch.skill === 'serve') {
        // The server stands outside the court behind their own baseline —
        // keep the recorded lane's row but move the column outside the grid.
        fromPos = { col: SERVE_OUTSIDE_COL, row: fromPos.row };
      }

      // "|" (not "-") separates the from/to pairs: fromPos.col can be
      // negative (SERVE_OUTSIDE_COL), which would otherwise be ambiguous
      // with the separator when the key is split back apart below.
      const key = `${fromPos.col},${fromPos.row}|${toPos.col},${toPos.row}`;
      arrowMap.set(key, (arrowMap.get(key) || 0) + 1);
    }
  }

  arrowMap.forEach((count, key) => {
    const [from, to] = key.split('|');
    const [fromCol, fromRow] = from.split(',').map(Number);
    const [toCol, toRow] = to.split(',').map(Number);
    arrows.push({ fromCol, fromRow, toCol, toRow, count });
  });

  return arrows;
}

function buildGridForTeam(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string, rallyPhaseFilter: 'all' | TouchPhase = 'all'): number[][] {
  // Full-court grid with subzones: 6 columns x 6 rows
  // Each zone (1-9) is divided into 2x2 subzones (C, B, D, A)
  // Full court layout:
  // 4C 4B | 3C 3B | 2C 2B
  // 4D 4A | 3D 3A | 2D 2A
  // ------+-------+------
  // 9C 9B | 8C 8B | 7C 7B
  // 9D 9A | 8D 8A | 7D 7A
  // ------+-------+------
  // 5C 5B | 6C 6B | 1C 1B
  // 5D 5A | 6D 6A | 1D 1A
  const grid: number[][] = Array(6)
    .fill(null)
    .map(() => Array(6).fill(0));

  const zoneMatrix: Record<string, number> = {};

  for (const rally of rallies) {
    const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;

      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && (!touch.startZoneCode || touch.startZoneCode.charAt(0) !== startZoneFilter)) continue;

      // For receive: use start zone (where ball came from)
      // For attack/serve: use end zone (where ball went)
      const zoneCode = touch.skill === 'receive' ? touch.startZoneCode : touch.endZoneCode;
      if (!zoneCode) continue;

      const parsedZone = parseZoneCode(zoneCode);
      if (!parsedZone) continue;

      const key = `${parsedZone.zoneNum}${parsedZone.subzone}`;
      zoneMatrix[key] = (zoneMatrix[key] || 0) + 1;
    }
  }

  // Map zones and subzones to grid positions
  COURT_ZONE_LAYOUT.forEach((zoneRow, rowIdx) => {
    zoneRow.forEach((zoneNum, colIdx) => {
      const gridColStart = colIdx * 2;
      const gridRowStart = rowIdx * 2;

      SUBZONE_ORDER.forEach((subzone, subIdx) => {
        const key = `${zoneNum}${subzone}`;
        const count = zoneMatrix[key] || 0;
        const gridCol = gridColStart + (subIdx % 2);
        const gridRow = gridRowStart + Math.floor(subIdx / 2);
        grid[gridRow][gridCol] = count;
      });
    });
  });

  return grid;
}

function buildEndZoneGrid(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string, rallyPhaseFilter: 'all' | TouchPhase = 'all'): number[][] {
  const grid: number[][] = Array(6).fill(null).map(() => Array(6).fill(0));
  const zoneMatrix: Record<string, number> = {};

  for (const rally of rallies) {
    const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;
      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && (!touch.startZoneCode || touch.startZoneCode.charAt(0) !== startZoneFilter)) continue;

      const zoneCode = touch.endZoneCode;
      if (!zoneCode) continue;

      const parsedZone = parseZoneCode(zoneCode);
      if (!parsedZone) continue;

      const key = `${parsedZone.zoneNum}${parsedZone.subzone}`;
      zoneMatrix[key] = (zoneMatrix[key] || 0) + 1;
    }
  }

  RIGHT_ZONE_LAYOUT.forEach((zoneRow, rowIdx) => {
    zoneRow.forEach((zoneNum, colIdx) => {
      const gridColStart = colIdx * 2;
      const gridRowStart = rowIdx * 2;
      SUBZONE_ORDER.forEach((subzone, subIdx) => {
        const key = `${zoneNum}${subzone}`;
        const count = zoneMatrix[key] || 0;
        const gridCol = gridColStart + (subIdx % 2);
        const gridRow = gridRowStart + Math.floor(subIdx / 2);
        grid[gridRow][gridCol] = count;
      });
    });
  });

  return grid;
}

function buildStartZoneGrid(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string, rallyPhaseFilter: 'all' | TouchPhase = 'all'): number[][] {
  const grid: number[][] = Array(6).fill(null).map(() => Array(6).fill(0));
  const zoneMatrix: Record<string, number> = {};

  for (const rally of rallies) {
    const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      // Serve's origin is outside the court (see buildServeStartCounts) —
      // excluded here so it isn't double-counted inside the in-court grid.
      if (touch.skill === 'serve') continue;
      if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;
      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && (!touch.startZoneCode || touch.startZoneCode.charAt(0) !== startZoneFilter)) continue;

      const zoneCode = touch.startZoneCode;
      if (!zoneCode) continue;

      const parsedZone = parseZoneCode(zoneCode);
      if (!parsedZone) continue;

      const key = `${parsedZone.zoneNum}${parsedZone.subzone}`;
      zoneMatrix[key] = (zoneMatrix[key] || 0) + 1;
    }
  }

  LEFT_ZONE_LAYOUT.forEach((zoneRow, rowIdx) => {
    zoneRow.forEach((zoneNum, colIdx) => {
      const gridColStart = colIdx * 2;
      const gridRowStart = rowIdx * 2;
      SUBZONE_ORDER.forEach((subzone, subIdx) => {
        const key = `${zoneNum}${subzone}`;
        const count = zoneMatrix[key] || 0;
        const gridCol = gridColStart + (subIdx % 2);
        const gridRow = gridRowStart + Math.floor(subIdx / 2);
        grid[gridRow][gridCol] = count;
      });
    });
  });

  return grid;
}

/**
 * Serve counts by lane row, for the badges drawn outside the court (the
 * server stands behind their own baseline, not inside an in-court zone).
 */
function buildServeStartCounts(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string, rallyPhaseFilter: 'all' | TouchPhase = 'all'): number[] {
  const counts = Array(6).fill(0);
  if (skill && skill !== 'all' && skill !== 'serve') return counts;

  for (const rally of rallies) {
    const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      if (touch.skill !== 'serve') continue;
      if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (!touch.startZoneCode) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && touch.startZoneCode.charAt(0) !== startZoneFilter) continue;

      const cell = getZoneCellCenter(touch.startZoneCode, LEFT_ZONE_LAYOUT);
      if (!cell) continue;

      counts[cell.row] += 1;
    }
  }

  return counts;
}

function debugZoneDistribution(stats: MatchStats, teamSide: 'home' | 'away'): { grid: number[][], zones: Record<string, number> } {
  const ZONE_LAYOUT = [[4, 3, 2], [9, 8, 7], [5, 6, 1]];
  const SUBZONE_ORDER = ['C', 'B', 'D', 'A'] as const;
  const grid: number[][] = Array(6)
    .fill(null)
    .map(() => Array(6).fill(0));
  const zones: Record<string, number> = {};

  for (const rally of stats.rallyStats) {
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      if (!touch.endZoneCode) {
        zones['[MISSING]'] = (zones['[MISSING]'] || 0) + 1;
        continue;
      }

      const normalized = touch.endZoneCode.trim().toLowerCase();
      const zoneNum = parseInt(normalized.charAt(0));

      if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) {
        zones['[INVALID]'] = (zones['[INVALID]'] || 0) + 1;
        continue;
      }

      const subzoneLetter = normalized.length > 1 ? normalized.charAt(1) : undefined;
      let key: string;
      if (subzoneLetter && /^[a-d]$/.test(subzoneLetter)) {
        key = `${zoneNum}${subzoneLetter.toUpperCase()}`;
      } else {
        key = `${zoneNum}`;
      }

      zones[key] = (zones[key] || 0) + 1;

      // Build grid for visualization
      for (let r = 0; r < ZONE_LAYOUT.length; r++) {
        for (let c = 0; c < ZONE_LAYOUT[r].length; c++) {
          if (ZONE_LAYOUT[r][c] === zoneNum) {
            const gridColStart = c * 2;
            const gridRowStart = r * 2;

            SUBZONE_ORDER.forEach((subzone, subIdx) => {
              const testKey = `${zoneNum}${subzone}`;
              if (testKey === key) {
                const gridCol = gridColStart + (subIdx % 2);
                const gridRow = gridRowStart + Math.floor(subIdx / 2);
                grid[gridRow][gridCol]++;
              }
            });
            break;
          }
        }
      }
    }
  }

  if (typeof window !== 'undefined' && (window as any).__DEV__) {
    console.table(zones);
    console.log('Zone Distribution Grid:', grid);
  }

  return { grid, zones };
}

interface Arrow {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  count: number;
}

interface CanvasFieldProps {
  grid: number[][];
  mode: VisualizationMode;
  teamName: string;
  teamSide: 'home' | 'away';
  arrows?: Arrow[];
  showArrows?: boolean;
}

function gridToHeatmapData(grid: number[][]): Array<[number, number, number]> {
  const data: Array<[number, number, number]> = [];
  const canvasWidth = 600;
  const canvasHeight = 600;
  const scaleX = canvasWidth / 6;
  const scaleY = canvasHeight / 6;

  grid.forEach((row, rowIdx) => {
    row.forEach((value, colIdx) => {
      if (value > 0) {
        const x = colIdx * scaleX + scaleX / 2;
        const y = rowIdx * scaleY + scaleY / 2;
        data.push([x, y, value]);
      }
    });
  });

  return data;
}

function CanvasFieldLandscape({ grid, mode, points }: Pick<CanvasFieldProps, 'grid' | 'mode'> & { points?: DensityPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Full court: 6 columns x 6 rows (3 zones x 3 zones with 2x2 subzones each)
    // Court is 9m x 9m (square)
    const canvasWidth = 900;
    const canvasHeight = 900;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const flat = grid.flat();
    const nonZeroValues = flat.filter(v => v > 0);
    const minVal = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;
    const maxVal = nonZeroValues.length > 0 ? Math.max(...nonZeroValues) : 1;
    const range = maxVal - minVal || 1;

    // Grid with subzones: 6 columns (3 zones x 2 subzones) x 6 rows (3 zones x 2 subzones)
    // Grid for 6 columns x 6 rows (subzones)
    const cellWidth = canvasWidth / 6;
    const cellHeight = canvasHeight / 6;

    // Court fill — scouting colors (same horizontal gradient as two-panel arrows view)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const courtGrad = ctx.createLinearGradient(0, 0, canvasWidth, 0);
    courtGrad.addColorStop(0, 'rgba(37, 99, 235, 0.96)');
    courtGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.90)');
    courtGrad.addColorStop(1, 'rgba(37, 99, 235, 0.96)');
    ctx.fillStyle = courtGrad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Handle different visualization modes
    if (mode === 'density') {
      if (nonZeroValues.length > 0) {
        // Use an offscreen canvas to avoid SimpleHeat recoloring the court pixels
        const offCanvas = document.createElement('canvas');
        offCanvas.width = canvasWidth;
        offCanvas.height = canvasHeight;
        const heat = new SimpleHeat(offCanvas);
        const heatmapData: Array<[number, number, number]> = [];

        if (points && points.length > 0) {
          points.forEach((p) => {
            heatmapData.push([p.col * cellWidth, p.row * cellHeight, 1]);
          });
        } else {
          grid.forEach((row, rowIdx) => {
            row.forEach((value, colIdx) => {
              if (value > 0) {
                heatmapData.push([colIdx * cellWidth + cellWidth / 2, rowIdx * cellHeight + cellHeight / 2, value]);
              }
            });
          });
        }

        heat.data(heatmapData);
        heat.max(maxVal);
        heat.radius(60, 40);
        heat.gradient({
          0.0: '#16a34a',
          0.2: '#22c55e',
          0.4: '#a3e635',
          0.6: '#eab308',
          0.8: '#f97316',
          1.0: '#dc2626'
        });
        heat.draw(0);

        ctx.globalAlpha = 0.72;
        ctx.drawImage(offCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
      }
    } else if (mode === 'color-zones') {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          const value = grid[row][col];

          if (value > 0) {
            const normalized = (value - minVal) / range;
            const [r, g, b, a] = valueToRGBA(normalized);

            const x = col * cellWidth;
            const y = row * cellHeight;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
            ctx.fillRect(x, y, cellWidth, cellHeight);
          }
        }
      }
    } else if (mode === 'point-cloud') {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          const value = grid[row][col];
          if (value === 0) continue;

          const normalized = (value - minVal) / range;
          const radius = Math.max(20, Math.min(80, (normalized * 100)));
          const centerX = col * cellWidth + cellWidth / 2;
          const centerY = row * cellHeight + cellHeight / 2;

          const [r, g, b, a] = valueToRGBA(normalized);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, a / 255 * 0.9)})`;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // Zone boundary lines (between zone groups, every 2 cells)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    for (let c = 2; c < 6; c += 2) {
      ctx.beginPath(); ctx.moveTo(c * cellWidth, 0); ctx.lineTo(c * cellWidth, canvasHeight); ctx.stroke();
    }
    for (let r = 2; r < 6; r += 2) {
      ctx.beginPath(); ctx.moveTo(0, r * cellHeight); ctx.lineTo(canvasWidth, r * cellHeight); ctx.stroke();
    }

    // Subzone dashed dividers (within each 2×2 zone block)
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.5;
    for (let c = 1; c < 6; c += 2) {
      ctx.beginPath(); ctx.moveTo(c * cellWidth, 0); ctx.lineTo(c * cellWidth, canvasHeight); ctx.stroke();
    }
    for (let r = 1; r < 6; r += 2) {
      ctx.beginPath(); ctx.moveTo(0, r * cellHeight); ctx.lineTo(canvasWidth, r * cellHeight); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Outer court boundary
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);

    // Zone number watermarks
    ctx.font = `bold ${Math.round(cellWidth * 1.1)}px Ubuntu, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    COURT_ZONE_LAYOUT.forEach((zoneRow, rowIdx) => {
      zoneRow.forEach((zoneNum, colIdx) => {
        ctx.fillText(String(zoneNum), colIdx * cellWidth * 2 + cellWidth, rowIdx * cellHeight * 2 + cellHeight);
      });
    });

    // Draw frequency values for all modes
    const ZONE_LAYOUT_TEXT = COURT_ZONE_LAYOUT;
    const SUBZONE_ORDER_TEXT = ['C', 'B', 'D', 'A'];

    ctx.font = 'bold 18px Ubuntu, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ZONE_LAYOUT_TEXT.forEach((zoneRow, zoneRowIdx) => {
      zoneRow.forEach((_zoneNum, zoneColIdx) => {
        const gridColStart = zoneColIdx * 2;
        const gridRowStart = zoneRowIdx * 2;

        SUBZONE_ORDER_TEXT.forEach((_subzone, subIdx) => {
          const gridCol = gridColStart + (subIdx % 2);
          const gridRow = gridRowStart + Math.floor(subIdx / 2);
          const x = gridCol * cellWidth + cellWidth / 2;
          const y = gridRow * cellHeight + cellHeight / 2;

          const value = grid[gridRow][gridCol];
          if (value > 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 2.5;
            ctx.strokeText(String(Math.round(value)), x, y);
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.fillText(String(Math.round(value)), x, y);
          }
        });
      });
    });
  }, [grid, mode, points]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          maxHeight: '60vh',
          borderRadius: '6px',
          aspectRatio: '1/1',
        }}
      />
    </div>
  );
}

function CanvasField({ grid, mode, teamName, teamSide, arrows = [], showArrows = false }: CanvasFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = 600;
    const canvasHeight = 600;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const flat = grid.flat();
    // Filtra solo i valori > 0 per calcolare il range reale
    const nonZeroValues = flat.filter(v => v > 0);
    const minVal = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;
    const maxVal = nonZeroValues.length > 0 ? Math.max(...nonZeroValues) : 1;
    const range = maxVal - minVal || 1;

    if (mode === 'density') {
      // Use SimpleHeat for density visualization
      const heat = new SimpleHeat(canvas);
      const heatmapData = gridToHeatmapData(grid);

      // Find max value for scaling
      const maxVal = heatmapData.length > 0
        ? Math.max(...heatmapData.map(d => d[2]))
        : 1;

      heat.data(heatmapData);
      heat.max(maxVal);
      heat.radius(50, 30);

      // Set custom gradient: green -> red
      heat.gradient({
        0.0: '#16a34a',   // verde scuro
        0.2: '#22c55e',   // verde medio
        0.4: '#a3e635',   // verde-lime
        0.6: '#eab308',   // giallo-oro
        0.8: '#f97316',   // arancio
        1.0: '#dc2626'    // rosso
      });

      heat.draw(0);  // minOpacity = 0, no data shown where value is 0
    } else if (mode === 'color-zones') {
      const cellWidth = canvasWidth / 6;
      const cellHeight = canvasHeight / 6;

      // Disegna sfondo bianco trasparente
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          const value = grid[row][col];

          if (value > 0) {
            const normalized = (value - minVal) / range;
            const [r, g, b, a] = valueToRGBA(normalized);

            const x = col * cellWidth;
            const y = row * cellHeight;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
            ctx.fillRect(x, y, cellWidth, cellHeight);
          }
        }
      }
    } else if (mode === 'point-cloud') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const cellWidth = canvasWidth / 6;
      const cellHeight = canvasHeight / 6;

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          const value = grid[row][col];
          if (value === 0) continue;

          const normalized = (value - minVal) / range;
          const radius = Math.max(15, Math.min(60, (normalized * 80)));
          const centerX = col * cellWidth + cellWidth / 2;
          const centerY = row * cellHeight + cellHeight / 2;

          const [r, g, b, a] = valueToRGBA(normalized);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, a / 255 * 0.9)})`;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.round(value)), centerX, centerY);
        }
      }
    }

    // Draw court boundaries
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.stroke();

    // Draw net line (thick black at top)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(canvasWidth + 10, 0);
    ctx.stroke();

    // Draw zone grid lines (vertical - 3 columns)
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    const cellWidth = canvasWidth / 3;
    const cellHeight = canvasHeight / 3;
    for (let col = 1; col < 3; col++) {
      ctx.beginPath();
      ctx.moveTo(col * cellWidth, 0);
      ctx.lineTo(col * cellWidth, canvasHeight);
      ctx.stroke();
    }
    // Draw horizontal zone grid lines (2 rows)
    for (let row = 1; row < 3; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * cellHeight);
      ctx.lineTo(canvasWidth, row * cellHeight);
      ctx.stroke();
    }

    // Draw 3-meter line (solid gray - darker than zone grid)
    const threeMetersY = canvasHeight / 3;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, threeMetersY);
    ctx.lineTo(canvasWidth, threeMetersY);
    ctx.stroke();

    // Draw zone numbers (1-9)
    const ZONE_LAYOUT = [[4, 3, 2], [9, 8, 7], [5, 6, 1]];
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ZONE_LAYOUT.forEach((row, rowIdx) => {
      row.forEach((zoneNum, colIdx) => {
        const x = colIdx * cellWidth + cellWidth / 2;
        const y = rowIdx * cellHeight + cellHeight / 2;
        ctx.fillText(String(zoneNum), x, y);
      });
    });

    // Draw arrows if enabled
    if (showArrows && arrows && arrows.length > 0) {
      const cellWidth = canvasWidth / 6;
      const cellHeight = canvasHeight / 6;

      arrows.forEach((arrow) => {
        const fromX = arrow.fromCol * cellWidth + cellWidth / 2;
        const fromY = arrow.fromRow * cellHeight + cellHeight / 2;
        const toX = arrow.toCol * cellWidth + cellWidth / 2;
        const toY = arrow.toRow * cellHeight + cellHeight / 2;

        // Draw arrow line - more visible
        ctx.strokeStyle = '#ff0000'; // Pure red, fully opaque
        ctx.lineWidth = 4; // Thicker line
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Draw arrow head
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const arrowSize = 15; // Bigger arrow head
        ctx.fillStyle = '#ff0000'; // Pure red
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - arrowSize * Math.cos(angle - Math.PI / 6), toY - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - arrowSize * Math.cos(angle + Math.PI / 6), toY - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        // Draw count label - more visible
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        ctx.fillStyle = '#fff'; // White text
        ctx.strokeStyle = '#000'; // Black outline
        ctx.lineWidth = 2;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(String(arrow.count), midX, midY); // Outline
        ctx.fillText(String(arrow.count), midX, midY); // Text
      });
    }
  }, [grid, mode, arrows, showArrows]);

  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          height: 'auto',
          border: '2px solid #333',
          borderRadius: '4px',
          marginBottom: '8px',
        }}
      />
      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
        {teamName}
      </div>
    </div>
  );
}

function CanvasFullCourtArrows({
  arrows,
  startGrid,
  endGrid,
  endPoints,
  serveStartCounts,
  mode,
  startLabel,
  endLabel,
  showDebugSubzones = false,
}: {
  arrows: Arrow[];
  startGrid: number[][];
  endGrid: number[][];
  endPoints?: DensityPoint[];
  serveStartCounts: number[];
  mode: VisualizationMode;
  startLabel: string;
  endLabel: string;
  showDebugSubzones?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const CELL = 80;
    const COLS = 6;
    const ROWS = 6;
    const COURT_W = CELL * COLS;   // 480
    const COURT_H = CELL * ROWS;   // 480
    const PAD_Y = COURT_H / 4;     // 120
    const SEP_W = 6;
    // Extra strip left of the court for the serve's origin, which sits
    // outside the court behind the server's own baseline (as in live scouting).
    const OUTER_MARGIN = CELL * 0.75;
    const CANVAS_W = OUTER_MARGIN + COURT_W * 2 + SEP_W;
    const CANVAS_H = COURT_H + PAD_Y * 2;

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const LEFT_X = OUTER_MARGIN;
    const RIGHT_X = LEFT_X + COURT_W + SEP_W;
    const SEP_X = LEFT_X + COURT_W + SEP_W / 2;
    const COURT_TOP = PAD_Y;

    const maxCount = arrows.length > 0 ? Math.max(...arrows.map(a => a.count)) : 1;

    // Transparent canvas — no background fill
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // ── Court fill (single flat colour, no gradient) ─────────────────────────
    function drawCourtFill(panelX: number) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(panelX, COURT_TOP, COURT_W, COURT_H);
    }

    drawCourtFill(LEFT_X);
    drawCourtFill(RIGHT_X);

    // ── Right-panel heatmap, scaled only on landing-zone frequencies ─────────
    const flat = endGrid.flat();
    const nonZero = flat.filter(v => v > 0);
    const minVal = nonZero.length > 0 ? Math.min(...nonZero) : 0;
    const maxVal = nonZero.length > 0 ? Math.max(...nonZero) : 1;
    const range = maxVal - minVal || 1;

    function drawLandingHeatmap(panelX: number, grid: number[][], points?: DensityPoint[]) {
      const panelHasData = grid.some(row => row.some(val => val > 0));
      if (!panelHasData) return;

      if (mode === 'density') {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = COURT_W;
        offCanvas.height = COURT_H;
        const heat = new SimpleHeat(offCanvas);
        const heatData: Array<[number, number, number]> = [];
        if (points && points.length > 0) {
          points.forEach((p) => {
            heatData.push([p.col * CELL, p.row * CELL, 1]);
          });
        } else {
          grid.forEach((row, r) => {
            row.forEach((val, c) => {
              if (val > 0) heatData.push([c * CELL + CELL / 2, r * CELL + CELL / 2, val]);
            });
          });
        }
        heat.data(heatData);
        heat.max(maxVal);
        heat.radius(Math.round(CELL * 0.85), Math.round(CELL * 0.55));
        heat.gradient({ 0.0: '#16a34a', 0.2: '#22c55e', 0.4: '#a3e635', 0.6: '#eab308', 0.8: '#f97316', 1.0: '#dc2626' });
        heat.draw(0);
        ctx.globalAlpha = 0.72;
        ctx.drawImage(offCanvas, panelX, COURT_TOP);
        ctx.globalAlpha = 1.0;
      } else if (mode === 'color-zones') {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const val = grid[r][c];
            if (val > 0) {
              const norm = (val - minVal) / range;
              const [rv, g, b] = valueToRGBA(norm);
              ctx.fillStyle = `rgba(${rv}, ${g}, ${b}, 0.75)`;
              ctx.fillRect(panelX + c * CELL, COURT_TOP + r * CELL, CELL, CELL);
            }
          }
        }
      } else if (mode === 'point-cloud') {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const val = grid[r][c];
            if (val === 0) continue;
            const norm = (val - minVal) / range;
            const radius = Math.max(CELL * 0.12, Math.min(CELL * 0.42, norm * CELL * 0.42));
            const cx = panelX + c * CELL + CELL / 2;
            const cy = COURT_TOP + r * CELL + CELL / 2;
            const [rv, g, b] = valueToRGBA(norm);
            ctx.fillStyle = `rgba(${rv}, ${g}, ${b}, 0.85)`;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    }

    function drawStartPoints(panelX: number, grid: number[][]) {
      const startValues = grid.flat().filter(val => val > 0);
      if (startValues.length === 0) return;

      const maxStart = Math.max(...startValues);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = grid[r][c];
          if (val === 0) continue;

          const ratio = val / maxStart;
          const radius = Math.max(CELL * 0.12, Math.min(CELL * 0.25, CELL * (0.12 + ratio * 0.13)));
          const cx = panelX + c * CELL + CELL / 2;
          const cy = COURT_TOP + r * CELL + CELL / 2;

          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.strokeStyle = 'rgba(30,58,110,0.72)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          ctx.font = `bold ${Math.round(CELL * 0.22)}px Ubuntu, sans-serif`;
          ctx.fillStyle = '#1e3a6e';
          ctx.fillText(String(val), cx, cy);
        }
      }
    }

    // Serve count badges sit outside the court (same strip as the serve
    // arrows' origin), one per lane row — not inside an in-court cell.
    function drawServeStartBadges(counts: number[]) {
      const values = counts.filter((v) => v > 0);
      if (values.length === 0) return;

      const maxVal = Math.max(...values);
      const cx = LEFT_X - OUTER_MARGIN / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let r = 0; r < ROWS; r++) {
        const val = counts[r];
        if (val === 0) continue;

        const ratio = val / maxVal;
        const radius = Math.max(CELL * 0.12, Math.min(CELL * 0.25, CELL * (0.12 + ratio * 0.13)));
        const cy = COURT_TOP + r * CELL + CELL / 2;

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = 'rgba(30,58,110,0.72)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.font = `bold ${Math.round(CELL * 0.22)}px Ubuntu, sans-serif`;
        ctx.fillStyle = '#1e3a6e';
        ctx.fillText(String(val), cx, cy);
      }
    }

    function drawLandingFrequencyLabels(panelX: number, grid: number[][]) {
      ctx.font = `bold ${Math.round(CELL * 0.28)}px Ubuntu, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = grid[r][c];
          if (val > 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 2.5;
            ctx.strokeText(String(val), panelX + c * CELL + CELL / 2, COURT_TOP + r * CELL + CELL / 2);
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.fillText(String(val), panelX + c * CELL + CELL / 2, COURT_TOP + r * CELL + CELL / 2);
          }
        }
      }
    }

    drawLandingHeatmap(RIGHT_X, endGrid, endPoints);
    drawLandingFrequencyLabels(RIGHT_X, endGrid);

    // ── Court border + 3-meter line on both panels ───────────────────────────
    // Column index of the real attack-line boundary (front-row zones 2/3/4 vs.
    // the deeper zones), which differs per panel since they mirror each other
    // around the net: LEFT panel's front row sits at its right edge (col 4),
    // RIGHT panel's front row sits at its left edge (col 2).
    function drawPanelOverlay(panelX: number, threeMeterCol: number) {
      // Court border
      ctx.strokeStyle = '#1e3a6e';
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, COURT_TOP, COURT_W, COURT_H);

      // Three-meter (attack) line — the only internal court marking that
      // corresponds to a real painted line.
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(panelX + threeMeterCol * CELL, COURT_TOP);
      ctx.lineTo(panelX + threeMeterCol * CELL, COURT_TOP + COURT_H);
      ctx.stroke();

      // Subzone dividers + labels — gated by the app's "Show subzone labels
      // on court" setting (the same debug toggle ScoutingCourt uses).
      if (!showDebugSubzones) return;

      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';
      ctx.lineWidth = 0.5;
      for (let c = 1; c < COLS; c += 2) {
        ctx.beginPath(); ctx.moveTo(panelX + c * CELL, COURT_TOP); ctx.lineTo(panelX + c * CELL, COURT_TOP + COURT_H); ctx.stroke();
      }
      for (let r = 1; r < ROWS; r += 2) {
        ctx.beginPath(); ctx.moveTo(panelX, COURT_TOP + r * CELL); ctx.lineTo(panelX + COURT_W, COURT_TOP + r * CELL); ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.font = `${Math.round(CELL * 0.18)}px Ubuntu, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(150, 150, 150, 0.7)';
      const zoneLayout = threeMeterCol === 4 ? LEFT_ZONE_LAYOUT : RIGHT_ZONE_LAYOUT;
      zoneLayout.forEach((row, rowIdx) => {
        row.forEach((zoneNum, colIdx) => {
          const gridColStart = colIdx * 2;
          const gridRowStart = rowIdx * 2;
          SUBZONE_ORDER.forEach((subzone, subIdx) => {
            const gridCol = gridColStart + (subIdx % 2);
            const gridRow = gridRowStart + Math.floor(subIdx / 2);
            const x = panelX + gridCol * CELL + CELL / 2;
            const y = COURT_TOP + gridRow * CELL + CELL / 2;
            ctx.fillText(`${zoneNum}${subzone}`, x, y);
          });
        });
      });
    }

    drawPanelOverlay(LEFT_X, 4);
    drawPanelOverlay(RIGHT_X, 2);

    // ── Net marker ────────────────────────────────────────────────────────────
    // The net: a black line spanning the full court height, overshooting
    // past the court's top and bottom edges (like real net posts extending
    // beyond the sidelines).
    const netOvershoot = CELL / 3;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(SEP_X, COURT_TOP - netOvershoot);
    ctx.lineTo(SEP_X, COURT_TOP + COURT_H + netOvershoot);
    ctx.stroke();

    // ── Panel labels (readable on any background via stroke+fill) ────────────
    ctx.font = 'bold 18px Ubuntu, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeText(startLabel, LEFT_X + COURT_W / 2, PAD_Y / 2);
    ctx.strokeText(endLabel, RIGHT_X + COURT_W / 2, PAD_Y / 2);
    ctx.fillStyle = '#1e3a6e';
    ctx.fillText(startLabel, LEFT_X + COURT_W / 2, PAD_Y / 2);
    ctx.fillText(endLabel, RIGHT_X + COURT_W / 2, PAD_Y / 2);

    // ── Arrows ───────────────────────────────────────────────────────────────
    arrows.forEach((arrow) => {
      const fromX = arrow.fromCol === SERVE_OUTSIDE_COL
        ? LEFT_X - OUTER_MARGIN / 2
        : LEFT_X + arrow.fromCol * CELL + CELL / 2;
      const fromY = COURT_TOP + arrow.fromRow * CELL + CELL / 2;
      const toX = RIGHT_X + arrow.toCol * CELL + CELL / 2;
      const toY = COURT_TOP + arrow.toRow * CELL + CELL / 2;

      const dx = toX - fromX;
      const dy = toY - fromY;
      if (Math.hypot(dx, dy) < 1) return;

      const ratio = arrow.count / maxCount;
      const weight = 1 + ratio * 1.5;
      const alpha = 0.45 + ratio * 0.55;
      const arrowSize = 10 + ratio * 14;
      const angle = Math.atan2(dy, dx);
      const color = `rgba(0, 0, 0, ${alpha})`;

      // Dashed shaft (thin)
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead with rounded corners
      const tipX = toX;
      const tipY = toY;
      const leftX = toX - arrowSize * Math.cos(angle - Math.PI / 6);
      const leftY = toY - arrowSize * Math.sin(angle - Math.PI / 6);
      const rightX = toX - arrowSize * Math.cos(angle + Math.PI / 6);
      const rightY = toY - arrowSize * Math.sin(angle + Math.PI / 6);
      const midBaseX = (leftX + rightX) / 2;
      const midBaseY = (leftY + rightY) / 2;
      const cornerR = Math.min(arrowSize * 0.28, 5);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(midBaseX, midBaseY);
      ctx.arcTo(leftX, leftY, tipX, tipY, cornerR);
      ctx.arcTo(tipX, tipY, rightX, rightY, cornerR);
      ctx.arcTo(rightX, rightY, midBaseX, midBaseY, cornerR);
      ctx.closePath();
      ctx.fill();
    });

    // Start-zone badges go on last so the counts stay readable above the
    // arrow tails that originate from the same cells.
    drawStartPoints(LEFT_X, startGrid);
    drawServeStartBadges(serveStartCounts);
  }, [arrows, startGrid, endGrid, endPoints, serveStartCounts, mode, startLabel, endLabel, showDebugSubzones]);

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px' }}
      />
    </div>
  );
}

export interface ZoneDensityModeProps {
  stats: MatchStats;
  skill?: HeatmapSkillFilter;
  filters?: DashboardFilters;
}

export function ZoneDensityModePanel({ stats, skill: initialSkill, filters }: ZoneDensityModeProps) {
  const { t } = useTranslation();
  const [showArrows, setShowArrows] = useState(true);
  const [skill, setSkill] = useState<HeatmapSkillFilter>(initialSkill || 'all');
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('density');
  const [startZoneFilter, setStartZoneFilter] = useState<string>('all');
  const [rallyPhaseFilter, setRallyPhaseFilter] = useState<'all' | TouchPhase>(filters?.rallyPhase ?? 'all');
  const { updateFilter } = useFilterActions();
  const showDebugSubzones = useAppStore((state) => state.showDebugSubzones);

  useEffect(() => {
    setSkill(initialSkill || 'all');
  }, [initialSkill]);

  useEffect(() => {
    setRallyPhaseFilter(filters?.rallyPhase ?? 'all');
  }, [filters?.rallyPhase]);

  const teamsToShow = useMemo(() => getTeamsToShow(stats, filters || {} as DashboardFilters), [stats, filters]);
  const teamSide = teamsToShow[0] || 'home';

  const filteredRallies = useMemo(() => {
    let rallies = stats.rallyStats;
    if (filters?.set && filters.set !== 'all') {
      rallies = rallies.filter(r => r.setNumber === filters.set);
    }
    // Phase is a per-touch classification (not a whole-rally one), so it's
    // applied per-touch inside each builder below instead of here.
    return rallies;
  }, [stats.rallyStats, filters?.set]);

  const availableStartZones = useMemo(() => {
    const zones = new Set<string>();
    for (const rally of filteredRallies) {
      const phaseMap = rallyPhaseFilter !== 'all' ? classifyRallyTouchPhases(rally) : null;
      for (const touch of rally.touches) {
        if (touch.teamSide !== teamSide) continue;
        if (phaseMap && phaseMap.get(touch.id) !== rallyPhaseFilter) continue;
        if (skill !== 'all' && touch.skill !== skill) continue;
        if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
        if (touch.startZoneCode) zones.add(touch.startZoneCode.charAt(0));
      }
    }
    return Array.from(zones).filter(z => /^[1-9]$/.test(z)).sort((a, b) => parseInt(a) - parseInt(b));
  }, [filteredRallies, skill, teamSide, filters, rallyPhaseFilter]);

  const grid = useMemo(() => buildGridForTeam(filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter), [filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter]);
  const startGrid = useMemo(() => buildStartZoneGrid(filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter), [filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter]);
  const arrows = useMemo(() => buildArrowsForTeam(filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter), [filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter]);
  const endGrid = useMemo(() => buildEndZoneGrid(filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter), [filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter]);
  const heatEvents = useMemo(() => buildHeatEventMap(filteredRallies), [filteredRallies]);
  const heatPoints = useMemo(
    () => buildHeatPointsForTeam(filteredRallies, skill, teamSide, filters, startZoneFilter, heatEvents, rallyPhaseFilter),
    [filteredRallies, skill, teamSide, filters, startZoneFilter, heatEvents, rallyPhaseFilter],
  );
  const endHeatPoints = useMemo(
    () => buildEndZoneHeatPoints(filteredRallies, skill, teamSide, filters, startZoneFilter, heatEvents, rallyPhaseFilter),
    [filteredRallies, skill, teamSide, filters, startZoneFilter, heatEvents, rallyPhaseFilter],
  );
  const serveStartCounts = useMemo(
    () => buildServeStartCounts(filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter),
    [filteredRallies, skill, teamSide, filters, startZoneFilter, rallyPhaseFilter],
  );

  // Distinguish "this scout has no zone info at all" (compact DataVolley
  // codes, nothing to draw for the whole match) from "the current filters
  // leave nothing": each case gets its own explicit empty state instead of
  // silently blank courts.
  const matchHasZoneData = useMemo(
    () => stats.rallyStats.some((rally) => rally.touches.some((touch) => touch.endZoneCode || touch.startZoneCode)),
    [stats.rallyStats],
  );
  const hasGridData = useMemo(
    () => grid.some((row) => row.some((value) => value > 0))
      || startGrid.some((row) => row.some((value) => value > 0))
      || endGrid.some((row) => row.some((value) => value > 0))
      || serveStartCounts.some((value) => value > 0),
    [grid, startGrid, endGrid, serveStartCounts],
  );

  const modeLabels: Record<VisualizationMode, string> = {
    density: t('heatmapModeDensity'),
    'color-zones': t('heatmapModeColorZones'),
    'point-cloud': t('heatmapModePoint'),
  };

  if (!matchHasZoneData) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
        {t('heatmapNoZoneData')}
      </div>
    );
  }

  return (
    <div style={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '500px',
    }}>
      {/* Controls */}
      <div style={{
        marginBottom: '20px',
        display: 'flex',
        gap: '15px',
        justifyContent: 'center',
        flexWrap: 'wrap',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        {/* Visualization mode selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
            {t('visualization')}:
          </label>
          <select
            value={visualizationMode}
            onChange={(e) => setVisualizationMode(e.target.value as VisualizationMode)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #999',
              backgroundColor: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            <option value="density">{modeLabels.density}</option>
            <option value="color-zones">{modeLabels['color-zones']}</option>
            <option value="point-cloud">{modeLabels['point-cloud']}</option>
          </select>
        </div>

        {/* Skill filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
            {t('skill')}:
          </label>
          <select
            value={skill}
            onChange={(e) => setSkill(e.target.value as HeatmapSkillFilter)}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #999',
              backgroundColor: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <option value="all">{t('allSkills')}</option>
            <option value="serve">{t('skillServe')}</option>
            <option value="receive">{t('skillReceive')}</option>
            <option value="set">{t('skillSet')}</option>
            <option value="attack">{t('skillAttack')}</option>
            <option value="block">{t('skillBlock')}</option>
            <option value="dig">{t('skillDig')}</option>
          </select>
        </div>

        {/* Start zone filter */}
        {availableStartZones.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
              {t('heatmapStartZoneFilter')}:
            </label>
            <select
              value={startZoneFilter}
              onChange={(e) => setStartZoneFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #999',
                backgroundColor: '#fff',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <option value="all">{t('allZones')}</option>
              {availableStartZones.map((z) => (
                <option key={z} value={z}>{t('zone')} {z}</option>
              ))}
            </select>
          </div>
        )}

        {/* Evaluation filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
            {t('evaluation')}:
          </label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {ALL_EVALUATIONS.map((evaluation) => (
              <label key={evaluation} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters?.evaluations?.includes(evaluation) ?? true}
                  onChange={(e) => {
                    const current = filters?.evaluations || ALL_EVALUATIONS;
                    let updated: SkillEvaluation[];
                    if (e.target.checked) {
                      updated = [...current, evaluation];
                    } else {
                      updated = current.filter(v => v !== evaluation);
                    }
                    updateFilter('evaluations', updated);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px' }}>{evaluation}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Rally phase filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
            {t('filterRallyPhase')}:
          </label>
          <select
            value={rallyPhaseFilter}
            onChange={(e) => setRallyPhaseFilter(e.target.value as 'all' | TouchPhase)}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #999',
              backgroundColor: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <option value="all">{t('allPhases')}</option>
            {TOUCH_PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {t(PHASE_I18N_KEYS[phase] as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </div>

        {/* Arrows toggle button */}
        <button
          onClick={() => setShowArrows(!showArrows)}
          style={{
            padding: '8px 16px',
            borderRadius: '4px',
            border: '2px solid #999',
            backgroundColor: showArrows ? '#ff6464' : '#f5f5f5',
            color: showArrows ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: showArrows ? 'bold' : 'normal',
            fontSize: '13px',
          }}
        >
          {showArrows ? `✓ ${t('arrowsLabel')}` : `○ ${t('arrowsLabel')}`}
        </button>
      </div>

      {/* Canvas view — mutually exclusive: arrows = two-panel, no arrows = single court */}
      {!hasGridData ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
          {t('heatmapNoFilteredData')}
        </div>
      ) : showArrows ? (
        <div style={{ marginBottom: '20px' }}>
          <CanvasFullCourtArrows
            arrows={arrows}
            startGrid={startGrid}
            endGrid={endGrid}
            endPoints={endHeatPoints}
            serveStartCounts={serveStartCounts}
            mode={visualizationMode}
            startLabel={t('heatmapStartZoneFilter')}
            endLabel={t('heatmapEndZoneLabel')}
            showDebugSubzones={showDebugSubzones}
          />
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '20px',
          }}>
            <CanvasFieldLandscape
              grid={grid}
              mode={visualizationMode}
              points={heatPoints}
            />
          </div>
          <div style={{ flexShrink: 0 }}>
            <ZoneDensityModeLegend />
          </div>
        </>
      )}
    </div>
  );
}

export function ZoneDensityModeLegend() {
  const { t } = useTranslation();
  const steps = 6;
  const colors = [];

  for (let i = 0; i < steps; i++) {
    const tValue = i / (steps - 1);
    const [r, g, b] = valueToRGBA(tValue);
    colors.push({ t: tValue, r, g, b });
  }

  return (
    <div style={{
      marginTop: '20px',
      padding: '15px',
      backgroundColor: '#f9f9f9',
      borderRadius: '4px',
      borderTop: '1px solid #ddd'
    }}>
      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', color: '#333' }}>
        {t('heatmapLegendTitle')}:
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
        {colors.map((color, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, 1)`,
                borderRadius: '4px',
                border: '1px solid #999',
              }}
            />
            <div style={{ fontSize: '10px', marginTop: '4px', color: '#666' }}>
              {Math.round(color.t * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
