import { useMemo } from 'react';
import type { HeatmapDensityGrid, HeatmapEvent } from '../aggregation/heatmap-aggregation';
import type { HeatmapEndpoint, HeatmapMode } from '../filters/heatmap-filters';
import { skillColor } from '../filters/heatmap-filters';

// Court coordinate constants (stage space, 0-100)
const INSET = 12;
const COURT_W = 76;
const COURT_H = 76;
const NET_Y = 50;
const ATTACK_LINE_OFFSET = COURT_H / 2 / 3; // 38/3 ≈ 12.67 stage units

const AWAY_ATTACK_Y = NET_Y - ATTACK_LINE_OFFSET;
const HOME_ATTACK_Y = NET_Y + ATTACK_LINE_OFFSET;

// ─── Color helpers ────────────────────────────────────────────────────────────

function densityToFill(density: number): string {
  // blue (low) → yellow (mid) → red (high), all semi-transparent
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
  const b = Math.round(0);
  return `rgba(${r},${g},${b},0.8)`;
}

// ─── Court background ─────────────────────────────────────────────────────────

function CourtLines({ homeLabel, awayLabel }: { homeLabel: string; awayLabel: string }) {
  return (
    <>
      {/* Court boundary */}
      <rect
        x={INSET} y={INSET} width={COURT_W} height={COURT_H}
        fill="var(--heatmap-court-fill, #e8f4f8)" stroke="var(--heatmap-court-stroke, #94a3b8)"
        strokeWidth="0.5"
      />
      {/* Net */}
      <line
        x1={INSET} y1={NET_Y} x2={INSET + COURT_W} y2={NET_Y}
        stroke="var(--heatmap-net-color, #334155)" strokeWidth="1"
      />
      {/* Attack lines */}
      <line
        x1={INSET} y1={AWAY_ATTACK_Y} x2={INSET + COURT_W} y2={AWAY_ATTACK_Y}
        stroke="var(--heatmap-attack-line-color, #64748b)" strokeWidth="0.4" strokeDasharray="2 1.5"
      />
      <line
        x1={INSET} y1={HOME_ATTACK_Y} x2={INSET + COURT_W} y2={HOME_ATTACK_Y}
        stroke="var(--heatmap-attack-line-color, #64748b)" strokeWidth="0.4" strokeDasharray="2 1.5"
      />
      {/* Team labels */}
      <text
        x={INSET + COURT_W / 2} y={INSET + COURT_H / 4}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="3.5" fill="var(--heatmap-label-color, #94a3b8)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {awayLabel}
      </text>
      <text
        x={INSET + COURT_W / 2} y={INSET + COURT_H * 3 / 4}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="3.5" fill="var(--heatmap-label-color, #94a3b8)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {homeLabel}
      </text>
    </>
  );
}

// ─── Density overlay ─────────────────────────────────────────────────────────

interface DensityOverlayProps {
  grid: HeatmapDensityGrid;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
}

function DensityOverlay({ grid, onCellHover }: DensityOverlayProps) {
  return (
    <g>
      {grid.cells.map((cell) => (
        <rect
          key={`${cell.col}:${cell.row}`}
          x={cell.cellX}
          y={cell.cellY}
          width={cell.cellWidth}
          height={cell.cellHeight}
          fill={densityToFill(cell.density)}
          onMouseEnter={() => onCellHover?.(cell)}
          onMouseLeave={() => onCellHover?.(null)}
          style={{ cursor: 'default' }}
        />
      ))}
    </g>
  );
}

// ─── Point overlay ────────────────────────────────────────────────────────────

interface PointOverlayProps {
  events: HeatmapEvent[];
  endpoint: HeatmapEndpoint;
  onPointHover?: (event: HeatmapEvent | null) => void;
}

function PointOverlay({ events, endpoint, onPointHover }: PointOverlayProps) {
  return (
    <g>
      {events.map((ev) => {
        const pt = endpoint === 'end' ? ev.end : ev.start;
        const color = skillColor(ev.skill);
        return (
          <circle
            key={ev.touchId}
            cx={pt.x}
            cy={pt.y}
            r={1.4}
            fill={color}
            fillOpacity={0.55}
            stroke={color}
            strokeWidth={0.2}
            strokeOpacity={0.8}
            onMouseEnter={() => onPointHover?.(ev)}
            onMouseLeave={() => onPointHover?.(null)}
            style={{ cursor: 'default' }}
          />
        );
      })}
    </g>
  );
}

// ─── Direction (arrow) overlay ────────────────────────────────────────────────

const ARROW_MARKER_ID = 'heatmap-arrow';

interface DirectionOverlayProps {
  events: HeatmapEvent[];
  onLineHover?: (event: HeatmapEvent | null) => void;
}

function DirectionOverlay({ events, onLineHover }: DirectionOverlayProps) {
  return (
    <g>
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {events.map((ev) => {
        const color = skillColor(ev.skill);
        const dx = ev.end.x - ev.start.x;
        const dy = ev.end.y - ev.start.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) return null;
        return (
          <line
            key={ev.touchId}
            x1={ev.start.x}
            y1={ev.start.y}
            x2={ev.end.x}
            y2={ev.end.y}
            stroke={color}
            strokeWidth={0.5}
            strokeOpacity={0.5}
            color={color}
            markerEnd={`url(#${ARROW_MARKER_ID})`}
            onMouseEnter={() => onLineHover?.(ev)}
            onMouseLeave={() => onLineHover?.(null)}
            style={{ cursor: 'default' }}
          />
        );
      })}
    </g>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function DensityLegend() {
  const stops = [0, 0.25, 0.5, 0.75, 1.0];
  const legendX = INSET;
  const legendY = INSET + COURT_H + 2;
  const cellW = COURT_W / stops.length;

  return (
    <g>
      {stops.map((d, i) => (
        <rect
          key={d}
          x={legendX + i * cellW}
          y={legendY}
          width={cellW}
          height={2.5}
          fill={densityToFill(d)}
        />
      ))}
      <text x={legendX} y={legendY + 5} fontSize="2.5" fill="var(--heatmap-label-color, #94a3b8)">low</text>
      <text x={legendX + COURT_W} y={legendY + 5} fontSize="2.5" fill="var(--heatmap-label-color, #94a3b8)" textAnchor="end">high</text>
    </g>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipProps {
  x: number;
  y: number;
  lines: string[];
}

function SvgTooltip({ x, y, lines }: TooltipProps) {
  const padding = 1.5;
  const lineH = 3.5;
  const w = 22;
  const h = lines.length * lineH + padding * 2;
  const tx = Math.min(x + 2, INSET + COURT_W - w - 1);
  const ty = y - h - 2 < INSET ? y + 2 : y - h - 2;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tx} y={ty} width={w} height={h} rx="0.8" ry="0.8"
        fill="var(--color-surface-overlay, #1e293b)" opacity="0.9" />
      {lines.map((line, i) => (
        <text
          key={i}
          x={tx + padding}
          y={ty + padding + (i + 0.8) * lineH}
          fontSize="2.8"
          fill="var(--color-text-primary, #f1f5f9)"
          dominantBaseline="middle"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface HeatmapCourtSvgProps {
  mode: HeatmapMode;
  events: HeatmapEvent[];
  grid?: HeatmapDensityGrid;
  endpoint: HeatmapEndpoint;
  homeLabel: string;
  awayLabel: string;
  hoveredCell?: HeatmapDensityGrid['cells'][number] | null;
  hoveredEvent?: HeatmapEvent | null;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

export function HeatmapCourtSvg({
  mode,
  events,
  grid,
  endpoint,
  homeLabel,
  awayLabel,
  hoveredCell,
  hoveredEvent,
  onCellHover,
  onEventHover,
}: HeatmapCourtSvgProps) {
  const tooltipLines = useMemo<string[]>(() => {
    if (hoveredCell) {
      return [`${hoveredCell.count} touch${hoveredCell.count !== 1 ? 'es' : ''}`];
    }
    if (hoveredEvent) {
      const parts: string[] = [hoveredEvent.skill];
      if (hoveredEvent.evaluation) parts.push(hoveredEvent.evaluation);
      if (hoveredEvent.playerId) parts.push(`#${hoveredEvent.playerId}`);
      return parts;
    }
    return [];
  }, [hoveredCell, hoveredEvent]);

  const tooltipPos = useMemo(() => {
    if (hoveredCell) return { x: hoveredCell.x, y: hoveredCell.y };
    if (hoveredEvent) {
      const pt = endpoint === 'end' ? hoveredEvent.end : hoveredEvent.start;
      return { x: pt.x, y: pt.y };
    }
    return null;
  }, [hoveredCell, hoveredEvent, endpoint]);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className="heatmap-court-svg"
      aria-hidden="true"
    >
      <CourtLines homeLabel={homeLabel} awayLabel={awayLabel} />

      {mode === 'density' && grid && (
        <DensityOverlay grid={grid} onCellHover={onCellHover} />
      )}

      {mode === 'point' && (
        <PointOverlay events={events} endpoint={endpoint} onPointHover={onEventHover} />
      )}

      {mode === 'direction' && (
        <DirectionOverlay events={events} onLineHover={onEventHover} />
      )}

      {mode === 'density' && <DensityLegend />}

      {tooltipLines.length > 0 && tooltipPos && (
        <SvgTooltip x={tooltipPos.x} y={tooltipPos.y} lines={tooltipLines} />
      )}
    </svg>
  );
}
