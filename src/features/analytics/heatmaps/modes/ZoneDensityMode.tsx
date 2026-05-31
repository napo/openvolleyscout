import { useEffect, useRef, useMemo, useState } from 'react';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { HeatmapSkillFilter } from '../filters/heatmap-filters';
import type { DashboardFilters } from '../../dashboard/filters/dashboard-filters';
import { getTeamsToShow } from '../../dashboard/selectors/dashboard-selectors';

type VisualizationMode = 'density' | 'color-zones' | 'point-cloud';

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

  if (t < 0.33) {
    const s = t / 0.33;
    return [0, Math.round(s * 255), 255, 255];
  } else if (t < 0.67) {
    const s = (t - 0.33) / 0.34;
    return [Math.round(s * 255), 255, Math.round((1 - s) * 255), 255];
  } else {
    const s = (t - 0.67) / 0.33;
    return [255, Math.round((1 - s) * 255), 0, 255];
  }
}

function valueToSaturatedRGBA(t: number): [number, number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const hue = (1 - t) * 240;
  const s = 100;
  const l = 50;
  return hslToRgba(hue, s, l);
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

function getZoneCellCenter(zoneCode: string): { col: number; row: number } | null {
  const normalized = zoneCode.trim().toLowerCase();
  const zoneNum = parseInt(normalized.charAt(0));
  if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) return null;

  const ZONE_LAYOUT = [[4, 3, 2], [9, 8, 7], [5, 6, 1]];
  const SUBZONE_ORDER = ['C', 'B', 'D', 'A'] as const;

  let zoneRowIdx = -1;
  let zoneColIdx = -1;

  for (let r = 0; r < ZONE_LAYOUT.length; r++) {
    for (let c = 0; c < ZONE_LAYOUT[r].length; c++) {
      if (ZONE_LAYOUT[r][c] === zoneNum) {
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

function buildArrowsForTeam(stats: MatchStats, skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters): Arrow[] {
  const arrows: Arrow[] = [];
  const arrowMap = new Map<string, number>();

  for (const rally of stats.rallyStats) {
    for (const touch of rally.touches) {
      if (!['attack', 'receive'].includes(touch.skill)) continue;
      if (touch.teamSide !== teamSide) continue;
      if (!touch.startZoneCode || !touch.endZoneCode) continue;

      if (skill && skill !== 'all' && touch.skill !== skill) continue;
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;

      const fromPos = getZoneCellCenter(touch.startZoneCode);
      const toPos = getZoneCellCenter(touch.endZoneCode);

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

function buildGridForTeam(stats: MatchStats, skill: HeatmapSkillFilter, teamSide: 'home' | 'away', filters?: DashboardFilters): number[][] {
  const grid: number[][] = Array(6)
    .fill(null)
    .map(() => Array(6).fill(0));

  const ZONE_LAYOUT = [[4, 3, 2], [9, 8, 7], [5, 6, 1]];
  const SUBZONE_ORDER = ['C', 'B', 'D', 'A'] as const;
  const zoneMatrix: Record<string, number> = {};

  for (const rally of stats.rallyStats) {
    for (const touch of rally.touches) {
      if (!['attack', 'receive'].includes(touch.skill)) continue;
      if (touch.teamSide !== teamSide) continue;
      if (!touch.endZoneCode) continue;

      if (skill && skill !== 'all' && touch.skill !== skill) continue;

      // Filter by player if specified
      if (filters?.player && filters.player !== 'all' && touch.playerId !== filters.player) continue;

      const normalized = touch.endZoneCode.trim().toLowerCase();
      const zoneNum = parseInt(normalized.charAt(0));
      if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) continue;

      const subzoneLetter = normalized.length > 1 ? normalized.charAt(1) : undefined;
      let key: string;
      if (subzoneLetter && /^[a-d]$/.test(subzoneLetter)) {
        key = `${zoneNum}${subzoneLetter.toUpperCase()}`;
      } else {
        key = `${zoneNum}`;
      }

      zoneMatrix[key] = (zoneMatrix[key] || 0) + 1;
    }
  }

  ZONE_LAYOUT.forEach((zoneRow, rowIdx) => {
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
    const minVal = Math.min(...flat, 0);
    const maxVal = Math.max(...flat, 1);
    const range = maxVal - minVal || 1;

    if (mode === 'density') {
      const smoothed = smoothGrid(grid, 0.9);
      const imageData = ctx.createImageData(canvasWidth, canvasHeight);
      const data = imageData.data;
      const scaleX = canvasWidth / 6;
      const scaleY = canvasHeight / 6;

      for (let py = 0; py < canvasHeight; py++) {
        for (let px = 0; px < canvasWidth; px++) {
          const gx = px / scaleX;
          const gy = py / scaleY;
          const value = bilinearInterpolate(smoothed, gx, gy);
          const normalized = (value - minVal) / range;
          const [r, g, b, a] = valueToRGBA(normalized);

          const idx = (py * canvasWidth + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    } else if (mode === 'color-zones') {
      const cellWidth = canvasWidth / 6;
      const cellHeight = canvasHeight / 6;

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          const value = grid[row][col];
          const normalized = (value - minVal) / range;
          const [r, g, b] = valueToSaturatedRGBA(normalized);

          const x = col * cellWidth;
          const y = row * cellHeight;
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(x, y, cellWidth, cellHeight);
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
          const radius = Math.max(20, Math.min(80, (normalized * 100)));
          const centerX = col * cellWidth + cellWidth / 2;
          const centerY = row * cellHeight + cellHeight / 2;

          const [r, g, b] = valueToSaturatedRGBA(normalized);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.font = 'bold 18px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.round(value)), centerX, centerY);
        }
      }
    }

    // Draw net line (thick black at top)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(canvasWidth + 10, 0);
    ctx.stroke();

    // Draw 3-meter line (solid gray)
    const threeMetersY = canvasHeight / 3;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, threeMetersY);
    ctx.lineTo(canvasWidth, threeMetersY);
    ctx.stroke();

    // Draw arrows if enabled
    if (showArrows && arrows && arrows.length > 0) {
      const cellWidth = canvasWidth / 6;
      const cellHeight = canvasHeight / 6;

      arrows.forEach((arrow) => {
        const fromX = arrow.fromCol * cellWidth + cellWidth / 2;
        const fromY = arrow.fromRow * cellHeight + cellHeight / 2;
        const toX = arrow.toCol * cellWidth + cellWidth / 2;
        const toY = arrow.toRow * cellHeight + cellHeight / 2;

        // Draw arrow line
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Draw arrow head
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const arrowSize = 12;
        ctx.fillStyle = 'rgba(255, 100, 100, 0.7)';
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - arrowSize * Math.cos(angle - Math.PI / 6), toY - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - arrowSize * Math.cos(angle + Math.PI / 6), toY - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        // Draw count label
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(arrow.count), midX, midY);
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

export interface ZoneDensityModeProps {
  stats: MatchStats;
  skill?: HeatmapSkillFilter;
  filters?: DashboardFilters;
}

export function ZoneDensityModePanel({ stats, skill, filters }: ZoneDensityModeProps) {
  const [showArrows, setShowArrows] = useState(false);

  const teamsToShow = useMemo(() => getTeamsToShow(stats, filters || {}), [stats, filters]);
  const teamSide = teamsToShow[0] || 'home';

  const grid = useMemo(() => buildGridForTeam(stats, skill, teamSide, filters), [stats, skill, teamSide, filters]);
  const arrows = useMemo(() => buildArrowsForTeam(stats, skill, teamSide, filters), [stats, skill, teamSide, filters]);

  const modeLabels: Record<VisualizationMode, string> = {
    density: 'Densità zone',
    'color-zones': 'Zone colorate',
    'point-cloud': 'Nuvole di punti',
  };

  return (
    <div style={{ padding: '20px' }}>
      {/* Arrows toggle button */}
      <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
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
          {showArrows ? '✓ Frecce' : '○ Frecce'}
        </button>
      </div>

      {/* Three visualization modes side by side */}
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {(['density', 'color-zones', 'point-cloud'] as const).map((mode) => (
          <div key={mode} style={{ flex: '1', minWidth: '250px' }}>
            <h4 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
              {modeLabels[mode]}
            </h4>
            <CanvasField grid={grid} mode={mode} teamName="" teamSide={teamSide} arrows={arrows} showArrows={showArrows} />
          </div>
        ))}
      </div>

      {/* Info */}
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
        <strong>Fondamentale:</strong> {skill === 'all' ? 'Tutti' : skill || 'Nessuno'}
      </div>
    </div>
  );
}

export function ZoneDensityModeLegend() {
  return null;
}
