import type { HeatmapDensityGrid, HeatmapEvent } from '../aggregation/heatmap-aggregation';
import { SCOUTING_SURFACE_WIDTH, SCOUTING_SURFACE_HEIGHT, SCOUTING_SURFACE_INSET_X, SCOUTING_SURFACE_INSET_Y } from '@src/domain/spatial/types';
import { skillColor } from '../filters/heatmap-filters';

// Half-court constants
const HC_VIEW_W = 50;
const HC_VIEW_H = 80;
const HC_INSET_X = 5;
const HC_INSET_Y = 8;
const HC_W = HC_VIEW_W - HC_INSET_X * 2;
const HC_H = HC_VIEW_H - HC_INSET_Y * 2;

// Stage coordinate constants
const STAGE_INSET = 12;
const STAGE_SIZE = 76;
const STAGE_HALF = STAGE_SIZE / 2;
const NET_Y = 50;

// Coordinate transforms (half-court to half-court SVG)
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

// Color mapping for density (blue→yellow→red)
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

export interface DensityDirectionModeProps {
  grid?: HeatmapDensityGrid;
  events: HeatmapEvent[];
  teamSide: 'home' | 'away';
  teamLabel: string;
  showArrows: boolean;
  hoveredCell?: HeatmapDensityGrid['cells'][number] | null;
  hoveredEvent?: HeatmapEvent | null;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

/**
 * DensityDirectionMode - Combined density heatmap with optional direction arrows.
 * Shows event concentration as color-coded density grid with trajectory vectors overlaid.
 */
export function DensityDirectionModePanel({
  grid,
  events,
  teamSide,
  teamLabel,
  showArrows,
  hoveredCell,
  hoveredEvent,
  onCellHover,
  onEventHover,
}: DensityDirectionModeProps) {
  const toX = teamSide === 'home' ? homeHcX : awayHcX;
  const toY = teamSide === 'home' ? homeHcY : awayHcY;

  // Build trajectory segments from events
  const trajectorySegments = showArrows
    ? events
        .filter((ev) => ev.teamSide === teamSide)
        .flatMap((ev) => {
          const segments: Array<{ x1: number; y1: number; x2: number; y2: number; color: string; event: HeatmapEvent }> = [];
          const color = skillColor(ev.skill);
          const minLength = 0.5;

          // Main trajectory
          const dx = ev.end.x - ev.start.x;
          const dy = ev.end.y - ev.start.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          if (length > minLength) {
            segments.push({
              x1: toX(ev.start.x),
              y1: toY(ev.start.y),
              x2: toX(ev.end.x),
              y2: toY(ev.end.y),
              color,
              event: ev,
            });
          }

          // Multi-point trajectory (deflection)
          if (ev.direction?.via && ev.direction.via.length > 0) {
            let prevX = ev.start.x;
            let prevY = ev.start.y;

            for (const via of ev.direction.via) {
              const segDx = via.x - prevX;
              const segDy = via.y - prevY;
              const segLength = Math.sqrt(segDx * segDx + segDy * segDy);
              if (segLength > minLength) {
                segments.push({
                  x1: toX(prevX),
                  y1: toY(prevY),
                  x2: toX(via.x),
                  y2: toY(via.y),
                  color,
                  event: ev,
                });
              }
              prevX = via.x;
              prevY = via.y;
            }

            // Final segment to end
            const finalDx = ev.end.x - prevX;
            const finalDy = ev.end.y - prevY;
            const finalLength = Math.sqrt(finalDx * finalDx + finalDy * finalDy);
            if (finalLength > minLength) {
              segments.push({
                x1: toX(prevX),
                y1: toY(prevY),
                x2: toX(ev.end.x),
                y2: toY(ev.end.y),
                color,
                event: ev,
              });
            }
          }

          return segments;
        })
    : [];

  return (
    <>
      {/* Court background */}
      {/* Net */}
      <line
        x1={HC_INSET_X}
        y1={HC_INSET_Y}
        x2={HC_INSET_X + HC_W}
        y2={HC_INSET_Y}
        stroke="var(--heatmap-net-color, #334155)"
        strokeWidth="1.5"
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

      {/* Density overlay (with blur filter applied from parent) */}
      {grid && (
        <g>
          {grid.cells.map((cell, i) => {
            const inTeamHalf = teamSide === 'home' ? cell.cellY >= NET_Y : cell.cellY + cell.cellHeight <= NET_Y;
            if (!inTeamHalf) return null;

            const dispX = toX(cell.cellX);
            const dispW = HC_W * cell.cellWidth / SCOUTING_SURFACE_WIDTH;
            let dispY: number;
            let dispH: number;
            if (teamSide === 'home') {
              dispY = toY(cell.cellY);
              dispH = HC_H * cell.cellHeight / SCOUTING_SURFACE_HEIGHT;
            } else {
              dispH = HC_H * cell.cellHeight / SCOUTING_SURFACE_HEIGHT;
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

      {/* Direction arrows - rendered WITHOUT blur filter */}
      {showArrows && (
        <g style={{ filter: 'none' }}>
          {trajectorySegments.map((seg, i) => (
            <line
              key={i}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={seg.color}
              strokeWidth={hoveredEvent === seg.event ? 1.2 : 0.6}
              opacity={hoveredEvent === seg.event ? 1 : 0.7}
              markerEnd="url(#heatmap-arrow-density-direction)"
              onMouseEnter={() => onEventHover?.(seg.event)}
              onMouseLeave={() => onEventHover?.(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}
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
    </>
  );
}

/**
 * Legend showing density gradient and skill colors for arrows.
 */
export function DensityDirectionModeLegend() {
  const stops = [0, 0.25, 0.5, 0.75, 1.0];
  const legX = HC_INSET_X;
  const legY = HC_INSET_Y + HC_H + 2.5;
  const cellW = HC_W / stops.length;

  const skills = ['serve', 'receive', 'attack', 'block', 'dig', 'freeball'] as const;

  return (
    <svg viewBox={`0 0 ${HC_VIEW_W} ${HC_VIEW_H + 30}`} style={{ height: '120px' }} preserveAspectRatio="xMidYMid meet">
      <g>
        {/* Density gradient */}
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
          density: low
        </text>
        <text x={legX + HC_W} y={legY + 5} fontSize="2.5" fill="var(--heatmap-label-color, #94a3b8)" textAnchor="end">
          high
        </text>

        {/* Skill colors */}
        <text x={legX} y={legY + 15} fontSize="2.5" fill="var(--heatmap-label-color, #94a3b8)" fontWeight="bold">
          skill colors:
        </text>
        {skills.map((skill, i) => (
          <g key={skill}>
            <rect
              x={legX + (i % 3) * 15}
              y={legY + 18 + (Math.floor(i / 3) * 4)}
              width={2}
              height={2}
              fill={skillColor(skill as any)}
            />
            <text
              x={legX + (i % 3) * 15 + 3.5}
              y={legY + 20 + (Math.floor(i / 3) * 4)}
              fontSize="2"
              fill="var(--heatmap-label-color, #94a3b8)"
            >
              {skill}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
