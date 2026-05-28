import { useMemo } from 'react';
import type { HeatmapDensityGrid, HeatmapEvent } from '../aggregation/heatmap-aggregation';
import type { HeatmapEndpoint, HeatmapMode } from '../filters/heatmap-filters';
import { skillColor } from '../filters/heatmap-filters';

// ─── Stage coordinate constants (shared with aggregation) ─────────────────────
// Stage space: x=[12,88], y=[12,88], net at y=50
// Home half: y=[50,88]  Away half: y=[12,50]
const STAGE_INSET = 12;
const STAGE_SIZE = 76; // 100 - 2*12
const STAGE_HALF = STAGE_SIZE / 2; // 38
const NET_Y = 50;
const ATTACK_LINE_OFFSET = STAGE_HALF / 3; // ~12.67

// ─── Half-court SVG constants ─────────────────────────────────────────────────
// viewBox "0 0 50 80"
const HC_VIEW_W = 50;
const HC_VIEW_H = 80;
const HC_INSET_X = 5;
const HC_INSET_Y = 8;
const HC_W = HC_VIEW_W - HC_INSET_X * 2; // 40
const HC_H = HC_VIEW_H - HC_INSET_Y * 2; // 64

// ─── Full-court horizontal SVG constants ──────────────────────────────────────
// viewBox "0 0 160 60"
const FC_VIEW_W = 160;
const FC_VIEW_H = 60;
const FC_INSET_X = 5;
const FC_INSET_Y = 8;
const FC_W = FC_VIEW_W - FC_INSET_X * 2; // 150
const FC_H = FC_VIEW_H - FC_INSET_Y * 2; // 44

// ─── Coordinate transforms ────────────────────────────────────────────────────

// Home half-court: net at top, back line at bottom
// stage y=50 (net) → hc_y=HC_INSET_Y, stage y=88 (back) → hc_y=HC_INSET_Y+HC_H
function homeHcX(stageX: number): number {
  return HC_INSET_X + HC_W * (stageX - STAGE_INSET) / STAGE_SIZE;
}
function homeHcY(stageY: number): number {
  return HC_INSET_Y + HC_H * (stageY - NET_Y) / STAGE_HALF;
}

// Away half-court: net at top, back line at bottom
// stage y=50 (net) → hc_y=HC_INSET_Y, stage y=12 (back) → hc_y=HC_INSET_Y+HC_H
function awayHcX(stageX: number): number {
  return HC_INSET_X + HC_W * (stageX - STAGE_INSET) / STAGE_SIZE;
}
function awayHcY(stageY: number): number {
  return HC_INSET_Y + HC_H * (NET_Y - stageY) / STAGE_HALF;
}

// Full-court horizontal: home-back at left, away-back at right
// stage y=88 (home back) → fc_x=FC_INSET_X, stage y=12 (away back) → fc_x=FC_INSET_X+FC_W
function fcX(stageY: number): number {
  return FC_INSET_X + FC_W * (88 - stageY) / STAGE_SIZE;
}
// sideline: stage x=12 → top, stage x=88 → bottom
function fcY(stageX: number): number {
  return FC_INSET_Y + FC_H * (stageX - STAGE_INSET) / STAGE_SIZE;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

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

// ─── Half-court background ────────────────────────────────────────────────────

function HalfCourtLines({ teamLabel }: { teamLabel: string }) {
  const netY = HC_INSET_Y;
  const atkY = HC_INSET_Y + HC_H / 3;
  const backY = HC_INSET_Y + HC_H;
  const leftX = HC_INSET_X;
  const rightX = HC_INSET_X + HC_W;
  const centerX = HC_INSET_X + HC_W / 2;

  return (
    <>
      <rect
        x={HC_INSET_X} y={HC_INSET_Y} width={HC_W} height={HC_H}
        fill="var(--heatmap-court-fill, #e8f4f8)" stroke="var(--heatmap-court-stroke, #94a3b8)"
        strokeWidth="0.6"
      />
      {/* Net (thick, at top) */}
      <line
        x1={leftX} y1={netY} x2={rightX} y2={netY}
        stroke="var(--heatmap-net-color, #334155)" strokeWidth="1.5"
      />
      {/* Attack line */}
      <line
        x1={leftX} y1={atkY} x2={rightX} y2={atkY}
        stroke="var(--heatmap-attack-line-color, #64748b)" strokeWidth="0.4" strokeDasharray="2 1.5"
      />
      {/* Back line (bottom) */}
      <line
        x1={leftX} y1={backY} x2={rightX} y2={backY}
        stroke="var(--heatmap-court-stroke, #94a3b8)" strokeWidth="0.6"
      />
      {/* Center depth label */}
      <text
        x={centerX} y={HC_INSET_Y + HC_H * 0.6}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="3.5" fill="var(--heatmap-label-color, #94a3b8)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {teamLabel}
      </text>
    </>
  );
}

// ─── Full-court horizontal background ────────────────────────────────────────

function FullCourtHorizontalLines({
  homeLabel,
  awayLabel,
}: {
  homeLabel: string;
  awayLabel: string;
}) {
  const netX = FC_INSET_X + FC_W / 2;
  const homeAtkX = FC_INSET_X + FC_W / 3;
  const awayAtkX = FC_INSET_X + (FC_W * 2) / 3;
  const topY = FC_INSET_Y;
  const bottomY = FC_INSET_Y + FC_H;
  const midY = FC_INSET_Y + FC_H / 2;

  return (
    <>
      <rect
        x={FC_INSET_X} y={FC_INSET_Y} width={FC_W} height={FC_H}
        fill="var(--heatmap-court-fill, #e8f4f8)" stroke="var(--heatmap-court-stroke, #94a3b8)"
        strokeWidth="0.6"
      />
      {/* Net (thick, vertical center) */}
      <line
        x1={netX} y1={topY} x2={netX} y2={bottomY}
        stroke="var(--heatmap-net-color, #334155)" strokeWidth="1.5"
      />
      {/* Home attack line */}
      <line
        x1={homeAtkX} y1={topY} x2={homeAtkX} y2={bottomY}
        stroke="var(--heatmap-attack-line-color, #64748b)" strokeWidth="0.4" strokeDasharray="2 1.5"
      />
      {/* Away attack line */}
      <line
        x1={awayAtkX} y1={topY} x2={awayAtkX} y2={bottomY}
        stroke="var(--heatmap-attack-line-color, #64748b)" strokeWidth="0.4" strokeDasharray="2 1.5"
      />
      {/* Team labels */}
      <text
        x={FC_INSET_X + FC_W / 4} y={midY}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="4" fill="var(--heatmap-label-color, #94a3b8)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {homeLabel}
      </text>
      <text
        x={FC_INSET_X + (FC_W * 3) / 4} y={midY}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="4" fill="var(--heatmap-label-color, #94a3b8)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {awayLabel}
      </text>
    </>
  );
}

// ─── Half-court density overlay ───────────────────────────────────────────────

interface HalfCourtDensityOverlayProps {
  grid: HeatmapDensityGrid;
  teamSide: 'home' | 'away';
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
}

function HalfCourtDensityOverlay({ grid, teamSide, onCellHover }: HalfCourtDensityOverlayProps) {
  const toX = teamSide === 'home' ? homeHcX : awayHcX;
  const toY = teamSide === 'home' ? homeHcY : awayHcY;

  return (
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

        return (
          <rect
            key={`${cell.col}:${cell.row}`}
            x={dispX} y={dispY} width={dispW} height={dispH}
            fill={densityToFill(cell.density)}
            onMouseEnter={() => onCellHover?.(cell)}
            onMouseLeave={() => onCellHover?.(null)}
            style={{ cursor: 'default' }}
          />
        );
      })}
    </g>
  );
}

// ─── Half-court point overlay ─────────────────────────────────────────────────

interface HalfCourtPointOverlayProps {
  events: HeatmapEvent[];
  endpoint: HeatmapEndpoint;
  teamSide: 'home' | 'away';
  onPointHover?: (event: HeatmapEvent | null) => void;
}

function HalfCourtPointOverlay({ events, endpoint, teamSide, onPointHover }: HalfCourtPointOverlayProps) {
  const toX = teamSide === 'home' ? homeHcX : awayHcX;
  const toY = teamSide === 'home' ? homeHcY : awayHcY;
  const teamEvents = events.filter((ev) => ev.teamSide === teamSide);

  return (
    <g>
      {teamEvents.map((ev) => {
        const pt = endpoint === 'end' ? ev.end : ev.start;
        const color = skillColor(ev.skill);
        return (
          <circle
            key={ev.touchId}
            cx={toX(pt.x)}
            cy={toY(pt.y)}
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

// ─── Full-court direction overlay ─────────────────────────────────────────────

const ARROW_MARKER_ID = 'heatmap-arrow';

interface DirectionOverlayProps {
  events: HeatmapEvent[];
  onLineHover?: (event: HeatmapEvent | null) => void;
}

function FullCourtDirectionOverlay({ events, onLineHover }: DirectionOverlayProps) {
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
        const x1 = fcX(ev.start.y);
        const y1 = fcY(ev.start.x);
        const x2 = fcX(ev.end.y);
        const y2 = fcY(ev.end.x);
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 0.5) return null;
        return (
          <line
            key={ev.touchId}
            x1={x1} y1={y1} x2={x2} y2={y2}
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

// ─── Density legend ───────────────────────────────────────────────────────────

function HalfCourtDensityLegend() {
  const stops = [0, 0.25, 0.5, 0.75, 1.0];
  const legX = HC_INSET_X;
  const legY = HC_INSET_Y + HC_H + 2.5;
  const cellW = HC_W / stops.length;
  return (
    <g>
      {stops.map((d, i) => (
        <rect key={d} x={legX + i * cellW} y={legY} width={cellW} height={2.5} fill={densityToFill(d)} />
      ))}
      <text x={legX} y={legY + 5} fontSize="2.5" fill="var(--heatmap-label-color, #94a3b8)">low</text>
      <text x={legX + HC_W} y={legY + 5} fontSize="2.5" fill="var(--heatmap-label-color, #94a3b8)" textAnchor="end">high</text>
    </g>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function SvgTooltip({ x, y, lines, maxX }: { x: number; y: number; lines: string[]; maxX: number }) {
  const padding = 1.5;
  const lineH = 3.5;
  const w = 24;
  const h = lines.length * lineH + padding * 2;
  const tx = Math.min(x + 2, maxX - w - 1);
  const ty = y - h - 2 < 0 ? y + 2 : y - h - 2;
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

// ─── Half-court panel ─────────────────────────────────────────────────────────

interface HalfCourtPanelProps {
  teamSide: 'home' | 'away';
  teamLabel: string;
  mode: 'density' | 'point';
  endpoint: HeatmapEndpoint;
  events: HeatmapEvent[];
  grid?: HeatmapDensityGrid;
  hoveredCell?: HeatmapDensityGrid['cells'][number] | null;
  hoveredEvent?: HeatmapEvent | null;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

function HalfCourtPanel({
  teamSide,
  teamLabel,
  mode,
  endpoint,
  events,
  grid,
  hoveredCell,
  hoveredEvent,
  onCellHover,
  onEventHover,
}: HalfCourtPanelProps) {
  const toX = teamSide === 'home' ? homeHcX : awayHcX;
  const toY = teamSide === 'home' ? homeHcY : awayHcY;

  const tooltipLines = useMemo<string[]>(() => {
    if (hoveredCell) return [`${hoveredCell.count} touch${hoveredCell.count !== 1 ? 'es' : ''}`];
    if (hoveredEvent) {
      const parts: string[] = [hoveredEvent.skill];
      if (hoveredEvent.evaluation) parts.push(hoveredEvent.evaluation);
      return parts;
    }
    return [];
  }, [hoveredCell, hoveredEvent]);

  const tooltipPos = useMemo(() => {
    if (hoveredCell) {
      return { x: toX(hoveredCell.x), y: toY(hoveredCell.y) };
    }
    if (hoveredEvent) {
      const pt = endpoint === 'end' ? hoveredEvent.end : hoveredEvent.start;
      return { x: toX(pt.x), y: toY(pt.y) };
    }
    return null;
  }, [hoveredCell, hoveredEvent, endpoint, toX, toY]);

  return (
    <svg
      viewBox={`0 0 ${HC_VIEW_W} ${HC_VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className="heatmap-court-svg heatmap-court-svg--half"
      aria-hidden="true"
    >
      <HalfCourtLines teamLabel={teamLabel} />
      {mode === 'density' && grid && (
        <HalfCourtDensityOverlay grid={grid} teamSide={teamSide} onCellHover={onCellHover} />
      )}
      {mode === 'point' && (
        <HalfCourtPointOverlay
          events={events}
          endpoint={endpoint}
          teamSide={teamSide}
          onPointHover={onEventHover}
        />
      )}
      {mode === 'density' && <HalfCourtDensityLegend />}
      {tooltipLines.length > 0 && tooltipPos && (
        <SvgTooltip x={tooltipPos.x} y={tooltipPos.y} lines={tooltipLines} maxX={HC_VIEW_W} />
      )}
    </svg>
  );
}

// ─── Full-court horizontal panel ──────────────────────────────────────────────

interface FullCourtHorizontalPanelProps {
  homeLabel: string;
  awayLabel: string;
  events: HeatmapEvent[];
  hoveredEvent?: HeatmapEvent | null;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

function FullCourtHorizontalPanel({
  homeLabel,
  awayLabel,
  events,
  hoveredEvent,
  onEventHover,
}: FullCourtHorizontalPanelProps) {
  const tooltipLines = useMemo<string[]>(() => {
    if (!hoveredEvent) return [];
    const parts: string[] = [hoveredEvent.skill];
    if (hoveredEvent.evaluation) parts.push(hoveredEvent.evaluation);
    return parts;
  }, [hoveredEvent]);

  const tooltipPos = useMemo(() => {
    if (!hoveredEvent) return null;
    return { x: fcX(hoveredEvent.end.y), y: fcY(hoveredEvent.end.x) };
  }, [hoveredEvent]);

  return (
    <svg
      viewBox={`0 0 ${FC_VIEW_W} ${FC_VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className="heatmap-court-svg heatmap-court-svg--horizontal"
      aria-hidden="true"
    >
      <FullCourtHorizontalLines homeLabel={homeLabel} awayLabel={awayLabel} />
      <FullCourtDirectionOverlay events={events} onLineHover={onEventHover} />
      {tooltipLines.length > 0 && tooltipPos && (
        <SvgTooltip x={tooltipPos.x} y={tooltipPos.y} lines={tooltipLines} maxX={FC_VIEW_W} />
      )}
    </svg>
  );
}

// ─── Public props ─────────────────────────────────────────────────────────────

export interface HeatmapCourtSvgProps {
  mode: HeatmapMode;
  events: HeatmapEvent[];
  homeEvents?: HeatmapEvent[];
  awayEvents?: HeatmapEvent[];
  grid?: HeatmapDensityGrid;
  homeGrid?: HeatmapDensityGrid;
  awayGrid?: HeatmapDensityGrid;
  endpoint: HeatmapEndpoint;
  homeLabel: string;
  awayLabel: string;
  showBothTeams: boolean;
  teamSide?: 'home' | 'away';
  hoveredCell?: HeatmapDensityGrid['cells'][number] | null;
  hoveredEvent?: HeatmapEvent | null;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function HeatmapCourtSvg({
  mode,
  events,
  homeEvents = [],
  awayEvents = [],
  grid,
  homeGrid,
  awayGrid,
  endpoint,
  homeLabel,
  awayLabel,
  showBothTeams,
  teamSide,
  hoveredCell,
  hoveredEvent,
  onCellHover,
  onEventHover,
}: HeatmapCourtSvgProps) {
  if (mode === 'direction') {
    return (
      <div className="heatmap-court-wrap heatmap-court-wrap--horizontal">
        <FullCourtHorizontalPanel
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          events={events}
          hoveredEvent={hoveredEvent}
          onEventHover={onEventHover}
        />
      </div>
    );
  }

  if (showBothTeams) {
    return (
      <div className="heatmap-court-wrap heatmap-court-wrap--split">
        <HalfCourtPanel
          teamSide="home"
          teamLabel={homeLabel}
          mode={mode}
          endpoint={endpoint}
          events={homeEvents}
          grid={homeGrid ?? grid}
          hoveredCell={hoveredCell}
          hoveredEvent={hoveredEvent}
          onCellHover={onCellHover}
          onEventHover={onEventHover}
        />
        <HalfCourtPanel
          teamSide="away"
          teamLabel={awayLabel}
          mode={mode}
          endpoint={endpoint}
          events={awayEvents}
          grid={awayGrid ?? grid}
          hoveredCell={hoveredCell}
          hoveredEvent={hoveredEvent}
          onCellHover={onCellHover}
          onEventHover={onEventHover}
        />
      </div>
    );
  }

  return (
    <div className="heatmap-court-wrap heatmap-court-wrap--single">
      <HalfCourtPanel
        teamSide={teamSide ?? 'home'}
        teamLabel={teamSide === 'away' ? awayLabel : homeLabel}
        mode={mode}
        endpoint={endpoint}
        events={teamSide === 'away' ? awayEvents : homeEvents}
        grid={teamSide === 'away' ? (awayGrid ?? grid) : (homeGrid ?? grid)}
        hoveredCell={hoveredCell}
        hoveredEvent={hoveredEvent}
        onCellHover={onCellHover}
        onEventHover={onEventHover}
      />
    </div>
  );
}
