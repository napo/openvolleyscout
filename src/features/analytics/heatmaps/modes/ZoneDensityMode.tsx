import { useEffect, useRef, useMemo, useState } from 'react';
import SimpleHeat from 'simpleheat';
import { useTranslation } from '@src/i18n';
import type { MatchStats, RallyStats } from '@src/features/scouting/model/match-stats';
import type { HeatmapSkillFilter } from '../filters/heatmap-filters';
import type { DashboardFilters } from '../../dashboard/filters/dashboard-filters';
import { ALL_EVALUATIONS } from '../../dashboard/filters/dashboard-filters';
import { getTeamsToShow } from '../../dashboard/selectors/dashboard-selectors';
import { useFilterActions } from '../../stores/filter-selectors';
import type { SkillEvaluation } from '@src/domain/common/enums';
import { rallyMatchesPhaseFilter, RALLY_PHASES } from '../../rally-phase/rally-phase-classifier';
import type { RallyPhase } from '../../rally-phase/rally-phase-classifier';

const PHASE_I18N_KEYS: Record<RallyPhase, string> = {
  side_out: 'situationSideOut',
  break_point: 'situationBreakPoint',
  counterattack: 'situationCounterattack',
  transition_attack: 'rallyPhaseTransitionAttack',
  attack_after_receive: 'situationAttackAfterReceive',
  attack_after_dig: 'situationAttackAfterDig',
  freeball: 'situationFreeball',
  unknown: 'rallyPhaseUnknown',
};

type VisualizationMode = 'density' | 'color-zones' | 'point-cloud';

// Single-court top-down view (net at top, back line at bottom)
const COURT_ZONE_LAYOUT = [[4, 3, 2], [7, 8, 9], [5, 6, 1]] as const;

// Two-panel horizontal view (net = separator, depth = columns, position = rows)
// Left panel (start zones):  col0=back  col1=3m  col2=front(near net)
// Right panel (end zones):   col0=front col1=3m  col2=back  (mirrored)
const LEFT_ZONE_LAYOUT = [[5, 7, 4], [6, 8, 3], [1, 9, 2]] as const;
const RIGHT_ZONE_LAYOUT = [[2, 9, 1], [3, 8, 6], [4, 7, 5]] as const;

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
  const normalized = zoneCode.trim().toLowerCase();
  const zoneNum = parseInt(normalized.charAt(0));
  if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) return null;

  const SUBZONE_ORDER = ['C', 'B', 'D', 'A'] as const;

  let zoneRowIdx = -1;
  let zoneColIdx = -1;

  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[r].length; c++) {
      if (layout[r][c] === zoneNum) {
        zoneRowIdx = r;
        zoneColIdx = c;
        break;
      }
    }
    if (zoneRowIdx !== -1) break;
  }

  if (zoneRowIdx === -1) return null;

  const subzoneLetter = normalized.length > 1 ? normalized.charAt(1) : 'C';
  const subzoneIdx = SUBZONE_ORDER.indexOf(subzoneLetter.toUpperCase() as any);
  const subIdx = subzoneIdx !== -1 ? subzoneIdx : 0;

  const gridColStart = zoneColIdx * 2;
  const gridRowStart = zoneRowIdx * 2;
  const gridCol = gridColStart + (subIdx % 2);
  const gridRow = gridRowStart + Math.floor(subIdx / 2);

  return { col: gridCol, row: gridRow };
}

function buildArrowsForTeam(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string): Arrow[] {
  const arrows: Arrow[] = [];
  const arrowMap = new Map<string, number>();

  for (const rally of rallies) {
    for (const touch of rally.touches) {
      if (!['attack', 'receive', 'serve'].includes(touch.skill)) continue;
      if (touch.teamSide !== teamSide) continue;
      if (!touch.startZoneCode || !touch.endZoneCode) continue;

      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && touch.startZoneCode.charAt(0) !== startZoneFilter) continue;

      const fromPos = getZoneCellCenter(touch.startZoneCode, LEFT_ZONE_LAYOUT);
      const toPos = getZoneCellCenter(touch.endZoneCode, RIGHT_ZONE_LAYOUT);

      if (!fromPos || !toPos) continue;

      const key = `${fromPos.col},${fromPos.row}-${toPos.col},${toPos.row}`;
      arrowMap.set(key, (arrowMap.get(key) || 0) + 1);
    }
  }

  arrowMap.forEach((count, key) => {
    const [from, to] = key.split('-');
    const [fromCol, fromRow] = from.split(',').map(Number);
    const [toCol, toRow] = to.split(',').map(Number);
    arrows.push({ fromCol, fromRow, toCol, toRow, count });
  });

  return arrows;
}

function buildGridForTeam(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string): number[][] {
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

  const SUBZONE_ORDER = ['C', 'B', 'D', 'A'] as const;
  const zoneMatrix: Record<string, number> = {};

  for (const rally of rallies) {
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;

      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && (!touch.startZoneCode || touch.startZoneCode.charAt(0) !== startZoneFilter)) continue;

      // For receive: use start zone (where ball came from)
      // For attack/serve: use end zone (where ball went)
      const zoneCode = touch.skill === 'receive' ? touch.startZoneCode : touch.endZoneCode;
      if (!zoneCode) continue;

      const normalized = zoneCode.trim().toLowerCase();
      const zoneNum = parseInt(normalized.charAt(0));
      if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) continue;

      const subzoneLetter = normalized.length > 1 ? normalized.charAt(1) : 'C';
      if (!/^[a-d]$/.test(subzoneLetter)) continue;

      const key = `${zoneNum}${subzoneLetter.toUpperCase()}`;
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

function buildEndZoneGrid(rallies: readonly RallyStats[], skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters, startZoneFilter?: string): number[][] {
  const grid: number[][] = Array(6).fill(null).map(() => Array(6).fill(0));
  const SUBZONE_ORDER = ['C', 'B', 'D', 'A'] as const;
  const zoneMatrix: Record<string, number> = {};

  for (const rally of rallies) {
    for (const touch of rally.touches) {
      if (touch.teamSide !== teamSide) continue;
      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
      if (filters?.evaluations && filters.evaluations.length > 0 && !filters.evaluations.includes(touch.evaluation as any)) continue;
      if (startZoneFilter && startZoneFilter !== 'all' && (!touch.startZoneCode || touch.startZoneCode.charAt(0) !== startZoneFilter)) continue;

      const zoneCode = touch.endZoneCode;
      if (!zoneCode) continue;

      const normalized = zoneCode.trim().toLowerCase();
      const zoneNum = parseInt(normalized.charAt(0));
      if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) continue;

      const subzoneLetter = normalized.length > 1 ? normalized.charAt(1) : 'C';
      if (!/^[a-d]$/.test(subzoneLetter)) continue;

      const key = `${zoneNum}${subzoneLetter.toUpperCase()}`;
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

function CanvasFieldLandscape({ grid, mode }: Pick<CanvasFieldProps, 'grid' | 'mode'>) {
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

        grid.forEach((row, rowIdx) => {
          row.forEach((value, colIdx) => {
            if (value > 0) {
              heatmapData.push([colIdx * cellWidth + cellWidth / 2, rowIdx * cellHeight + cellHeight / 2, value]);
            }
          });
        });

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
  }, [grid, mode]);

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
  endGrid,
  mode,
  startLabel,
  endLabel,
}: {
  arrows: Arrow[];
  endGrid: number[][];
  mode: VisualizationMode;
  startLabel: string;
  endLabel: string;
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
    const CANVAS_W = COURT_W * 2 + SEP_W;
    const CANVAS_H = COURT_H + PAD_Y * 2;

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const LEFT_X = 0;
    const RIGHT_X = COURT_W + SEP_W;
    const SEP_X = COURT_W + SEP_W / 2;
    const COURT_TOP = PAD_Y;

    const maxCount = arrows.length > 0 ? Math.max(...arrows.map(a => a.count)) : 1;

    // Transparent canvas — no background fill
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // ── Court fill (scouting court-area colours, horizontal gradient) ───────
    function drawCourtFill(panelX: number) {
      const grad = ctx.createLinearGradient(panelX, 0, panelX + COURT_W, 0);
      grad.addColorStop(0, 'rgba(37, 99, 235, 0.96)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.90)');
      grad.addColorStop(1, 'rgba(37, 99, 235, 0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(panelX, COURT_TOP, COURT_W, COURT_H);
    }

    drawCourtFill(LEFT_X);
    drawCourtFill(RIGHT_X);

    // ── Heatmap overlay on right panel ───────────────────────────────────────
    const flat = endGrid.flat();
    const nonZero = flat.filter(v => v > 0);
    const minVal = nonZero.length > 0 ? Math.min(...nonZero) : 0;
    const maxVal = nonZero.length > 0 ? Math.max(...nonZero) : 1;
    const range = maxVal - minVal || 1;

    if (mode === 'density' && nonZero.length > 0) {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = COURT_W;
      offCanvas.height = COURT_H;
      const heat = new SimpleHeat(offCanvas);
      const heatData: Array<[number, number, number]> = [];
      endGrid.forEach((row, r) => {
        row.forEach((val, c) => {
          if (val > 0) heatData.push([c * CELL + CELL / 2, r * CELL + CELL / 2, val]);
        });
      });
      heat.data(heatData);
      heat.max(maxVal);
      heat.radius(Math.round(CELL * 0.85), Math.round(CELL * 0.55));
      heat.gradient({ 0.0: '#16a34a', 0.2: '#22c55e', 0.4: '#a3e635', 0.6: '#eab308', 0.8: '#f97316', 1.0: '#dc2626' });
      heat.draw(0);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(offCanvas, RIGHT_X, COURT_TOP);
      ctx.globalAlpha = 1.0;
    } else if (mode === 'color-zones') {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = endGrid[r][c];
          if (val > 0) {
            const norm = (val - minVal) / range;
            const [rv, g, b] = valueToRGBA(norm);
            ctx.fillStyle = `rgba(${rv}, ${g}, ${b}, 0.75)`;
            ctx.fillRect(RIGHT_X + c * CELL, COURT_TOP + r * CELL, CELL, CELL);
          }
        }
      }
    } else if (mode === 'point-cloud') {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = endGrid[r][c];
          if (val === 0) continue;
          const norm = (val - minVal) / range;
          const radius = Math.max(CELL * 0.12, Math.min(CELL * 0.42, norm * CELL * 0.42));
          const cx = RIGHT_X + c * CELL + CELL / 2;
          const cy = COURT_TOP + r * CELL + CELL / 2;
          const [rv, g, b] = valueToRGBA(norm);
          ctx.fillStyle = `rgba(${rv}, ${g}, ${b}, 0.85)`;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // Frequency labels on right panel
    ctx.font = `bold ${Math.round(CELL * 0.28)}px Ubuntu, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = endGrid[r][c];
        if (val > 0) {
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 2.5;
          ctx.strokeText(String(val), RIGHT_X + c * CELL + CELL / 2, COURT_TOP + r * CELL + CELL / 2);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillText(String(val), RIGHT_X + c * CELL + CELL / 2, COURT_TOP + r * CELL + CELL / 2);
        }
      }
    }

    // ── Zone lines + watermarks on both panels ───────────────────────────────
    function drawPanelOverlay(panelX: number, zoneLayout: readonly (readonly number[])[]) {
      // Subzone dashed dividers
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.5;
      for (let c = 1; c < COLS; c += 2) {
        ctx.beginPath(); ctx.moveTo(panelX + c * CELL, COURT_TOP); ctx.lineTo(panelX + c * CELL, COURT_TOP + COURT_H); ctx.stroke();
      }
      for (let r = 1; r < ROWS; r += 2) {
        ctx.beginPath(); ctx.moveTo(panelX, COURT_TOP + r * CELL); ctx.lineTo(panelX + COURT_W, COURT_TOP + r * CELL); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Zone boundary lines
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      for (let c = 2; c < COLS; c += 2) {
        ctx.beginPath(); ctx.moveTo(panelX + c * CELL, COURT_TOP); ctx.lineTo(panelX + c * CELL, COURT_TOP + COURT_H); ctx.stroke();
      }
      for (let r = 2; r < ROWS; r += 2) {
        ctx.beginPath(); ctx.moveTo(panelX, COURT_TOP + r * CELL); ctx.lineTo(panelX + COURT_W, COURT_TOP + r * CELL); ctx.stroke();
      }

      // Outer boundary
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, COURT_TOP, COURT_W, COURT_H);

      // Zone number watermarks
      ctx.font = `bold ${Math.round(CELL * 1.1)}px Ubuntu, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      zoneLayout.forEach((row, rowIdx) => {
        row.forEach((zoneNum, colIdx) => {
          ctx.fillText(String(zoneNum), panelX + colIdx * CELL * 2 + CELL, COURT_TOP + rowIdx * CELL * 2 + CELL);
        });
      });
    }

    drawPanelOverlay(LEFT_X, LEFT_ZONE_LAYOUT);
    drawPanelOverlay(RIGHT_X, RIGHT_ZONE_LAYOUT);

    // ── Separator ────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = SEP_W;
    ctx.beginPath();
    ctx.moveTo(SEP_X, 0);
    ctx.lineTo(SEP_X, CANVAS_H);
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
      const fromX = LEFT_X + arrow.fromCol * CELL + CELL / 2;
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
  }, [arrows, endGrid, mode, startLabel, endLabel]);

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
  const [rallyPhaseFilter, setRallyPhaseFilter] = useState<'all' | RallyPhase>('all');
  const { updateFilter } = useFilterActions();

  const teamsToShow = useMemo(() => getTeamsToShow(stats, filters || {} as DashboardFilters), [stats, filters]);
  const teamSide = teamsToShow[0] || 'home';

  const filteredRallies = useMemo(() => {
    if (rallyPhaseFilter === 'all') return stats.rallyStats;
    return stats.rallyStats.filter(r => rallyMatchesPhaseFilter(r, rallyPhaseFilter));
  }, [stats.rallyStats, rallyPhaseFilter]);

  const availableStartZones = useMemo(() => {
    const zones = new Set<string>();
    for (const rally of filteredRallies) {
      for (const touch of rally.touches) {
        if (touch.teamSide !== teamSide) continue;
        if (skill !== 'all' && touch.skill !== skill) continue;
        if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;
        if (touch.startZoneCode) zones.add(touch.startZoneCode.charAt(0));
      }
    }
    return Array.from(zones).filter(z => /^[1-9]$/.test(z)).sort((a, b) => parseInt(a) - parseInt(b));
  }, [filteredRallies, skill, teamSide, filters]);

  const grid = useMemo(() => buildGridForTeam(filteredRallies, skill, teamSide, filters, startZoneFilter), [filteredRallies, skill, teamSide, filters, startZoneFilter]);
  const arrows = useMemo(() => buildArrowsForTeam(filteredRallies, skill, teamSide, filters, startZoneFilter), [filteredRallies, skill, teamSide, filters, startZoneFilter]);
  const endGrid = useMemo(() => buildEndZoneGrid(filteredRallies, skill, teamSide, filters, startZoneFilter), [filteredRallies, skill, teamSide, filters, startZoneFilter]);

  const modeLabels: Record<VisualizationMode, string> = {
    density: t('heatmapModeDensity'),
    'color-zones': t('heatmapModeColorZones'),
    'point-cloud': t('heatmapModePoint'),
  };

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
            onChange={(e) => setRallyPhaseFilter(e.target.value as 'all' | RallyPhase)}
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
            {RALLY_PHASES.map((phase) => (
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
      {showArrows ? (
        <div style={{ marginBottom: '20px' }}>
          <CanvasFullCourtArrows
            arrows={arrows}
            endGrid={endGrid}
            mode={visualizationMode}
            startLabel={t('heatmapStartZoneFilter')}
            endLabel={t('heatmapEndZoneLabel')}
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
