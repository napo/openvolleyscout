import type { HeatmapDensityGrid, HeatmapEvent } from '../aggregation/heatmap-aggregation';

/**
 * DensityMode - Renders heatmap as density grid on half-court layouts.
 * Shows event density as colored rectangles (blue→yellow→red gradient).
 */

// Stage coordinate constants
const STAGE_INSET = 12;
const STAGE_SIZE = 76;
const STAGE_HALF = STAGE_SIZE / 2;
const NET_Y = 50;

// Half-court SVG constants
const HC_VIEW_W = 50;
const HC_VIEW_H = 80;
const HC_INSET_X = 5;
const HC_INSET_Y = 8;
const HC_W = HC_VIEW_W - HC_INSET_X * 2;
const HC_H = HC_VIEW_H - HC_INSET_Y * 2;

// Coordinate transforms
function homeHcX(stageX: number): number {
  return HC_INSET_X + HC_W * (stageX - STAGE_INSET) / STAGE_SIZE;
}

function homeHcY(stageY: number): number {
  return HC_INSET_Y + HC_H * (stageY - NET_Y) / STAGE_HALF;
}

function awayHcX(stageX: number): number {
  return HC_INSET_X + HC_W * (stageX - STAGE_INSET) / STAGE_SIZE;
}

function awayHcY(stageY: number): number {
  return HC_INSET_Y + HC_H * (NET_Y - stageY) / STAGE_HALF;
}

// Color mapping: blue (low density) → yellow → red (high density)
function densityToFill(density: number): string {
  if (density < 0.5) {
    const t = density * 2;
    const r = Math.round(59 + t * (253 - 59));
    const g = Math.round(130 + t * (224 - 130));
    const b = Math.round(246 - t * 246);
    return `rgba(${r},${g},${b},0.75)`;
  }
  const t = (density - 0.5) * 2;
  const r = Math.round(253 + t * (220 - 253));
  const g = Math.round(224 - t * (224 - 38));
  const b = 0;
  return `rgba(${r},${g},${b},0.8)`;
}

export interface DensityModeProps {
  grid?: HeatmapDensityGrid;
  teamSide: 'home' | 'away';
  teamLabel: string;
  hoveredCell?: HeatmapDensityGrid['cells'][number] | null;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
}

/**
 * Renders a single half-court panel with density overlay.
 */
export function DensityModePanel({
  grid,
  teamSide,
  teamLabel,
  hoveredCell,
  onCellHover,
}: DensityModeProps) {
  const toX = teamSide === 'home' ? homeHcX : awayHcX;
  const toY = teamSide === 'home' ? homeHcY : awayHcY;

  return (
    <>
      {/* Court background */}
      <svg
        viewBox={`0 0 ${HC_VIEW_W} ${HC_VIEW_H}`}
        style={{ flex: 1, minWidth: 0 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Net */}
        <line
          x1={HC_INSET_X} y1={HC_INSET_Y}
          x2={HC_INSET_X + HC_W} y2={HC_INSET_Y}
          stroke="var(--heatmap-net-color, #334155)" strokeWidth="1.5"
        />

        {/* Attack line */}
        <line
          x1={HC_INSET_X}
          y1={HC_INSET_Y + HC_H / 3}
          x2={HC_INSET_X + HC_W}
          y2={HC_INSET_Y + HC_H / 3}
          stroke="var(--heatmap-attack-line-color, #64748b)"
          strokeWidth="0.4"
          strokeDasharray="2 1.5"
        />

        {/* Court boundary */}
        <rect
          x={HC_INSET_X}
          y={HC_INSET_Y}
          width={HC_W}
          height={HC_H}
          fill="none"
          stroke="var(--heatmap-boundary-color, #94a3b8)"
          strokeWidth="0.5"
        />

        {/* Density overlay */}
        {grid && (
          <g>
            {grid.cells.map((cell) => {
              const inTeamHalf = teamSide === 'home'
                ? cell.cellY >= NET_Y
                : cell.cellY + cell.cellHeight <= NET_Y;
              if (!inTeamHalf) return null;

              const dispX = toX(cell.cellX);
              const dispW = HC_W * cell.cellWidth / STAGE_SIZE;
              let dispY: number;
              let dispH: number;
              if (teamSide === 'home') {
                dispY = toY(cell.cellY);
                dispH = HC_H * cell.cellHeight / STAGE_HALF;
              } else {
                dispH = HC_H * cell.cellHeight / STAGE_HALF;
                dispY = toY(cell.cellY + cell.cellHeight);
              }

              const isHovered = hoveredCell && hoveredCell.col === cell.col && hoveredCell.row === cell.row;

              return (
                <rect
                  key={`${cell.col}:${cell.row}`}
                  x={dispX}
                  y={dispY}
                  width={dispW}
                  height={dispH}
                  fill={densityToFill(cell.density)}
                  opacity={isHovered ? 0.9 : 0.8}
                  onMouseEnter={() => onCellHover?.(cell)}
                  onMouseLeave={() => onCellHover?.(null)}
                  style={{ cursor: 'default' }}
                />
              );
            })}
          </g>
        )}

        {/* Team label */}
        <text
          x={HC_INSET_X + HC_W / 2}
          y={HC_INSET_Y + HC_H + 3}
          textAnchor="middle"
          fontSize="3"
          fill="var(--heatmap-label-color, #94a3b8)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {teamLabel}
        </text>
      </svg>
    </>
  );
}

/**
 * Density legend showing color gradient from low to high density.
 */
export function DensityModeLegend() {
  const stops = [0, 0.25, 0.5, 0.75, 1.0];
  const legX = HC_INSET_X;
  const legY = HC_INSET_Y + HC_H + 2.5;
  const cellW = HC_W / stops.length;

  return (
    <svg viewBox={`0 0 ${HC_VIEW_W} ${HC_VIEW_H + 10}`} style={{ height: '60px' }} preserveAspectRatio="xMidYMid meet">
      <g>
        {stops.map((d, i) => (
          <rect
            key={d}
            x={legX + i * cellW}
            y={legY}
            width={cellW}
            height={2.5}
            fill={densityToFill(d)}
          />
        ))}
        <text x={legX} y={legY + 5} fontSize="2.5" fill="var(--heatmap-label-color, #94a3b8)">
          low
        </text>
        <text
          x={legX + HC_W}
          y={legY + 5}
          fontSize="2.5"
          fill="var(--heatmap-label-color, #94a3b8)"
          textAnchor="end"
        >
          high
        </text>
      </g>
    </svg>
  );
}
