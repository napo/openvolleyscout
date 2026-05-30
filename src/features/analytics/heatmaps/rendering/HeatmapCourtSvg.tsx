import type { HeatmapDensityGrid, HeatmapEvent } from '../aggregation/heatmap-aggregation';
import type { HeatmapEndpoint, HeatmapMode } from '../filters/heatmap-filters';
import { useHeatmapMode } from '../modes/useHeatmapMode.tsx';
import { DirectionModePanel, DirectionModeLegend } from '../modes/DirectionMode';

const HC_VIEW_W = 50;
const HC_VIEW_H = 80;
const HC_INSET_X = 5;
const HC_INSET_Y = 8;
const HC_W = HC_VIEW_W - HC_INSET_X * 2;
const HC_H = HC_VIEW_H - HC_INSET_Y * 2;

function HalfCourtWrapper({
  children,
  tooltipContent,
}: {
  children: React.ReactNode;
  tooltipContent?: React.ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${HC_VIEW_W} ${HC_VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className="heatmap-court-svg heatmap-court-svg--half"
      aria-hidden="true"
    >
      {children}
      {tooltipContent}
    </svg>
  );
}

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

// ─── Half-Court Panel (Density or Point mode) ─────────────────────────────────

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
  const modeSelection = useHeatmapMode({
    mode,
    events,
    endpoint,
    grid,
    teamSide,
    teamLabel,
    hoveredCell,
    hoveredEvent,
    onCellHover,
    onEventHover,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <HalfCourtWrapper>
        {modeSelection.renderPanel}
      </HalfCourtWrapper>
      {modeSelection.renderLegend}
    </div>
  );
}

// ─── Full-Court Horizontal Panel (Direction mode) ───────────────────────────────

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <DirectionModePanel
        events={events}
        homeLabel={homeLabel}
        awayLabel={awayLabel}
        hoveredEvent={hoveredEvent}
        onEventHover={onEventHover}
      />
      <DirectionModeLegend />
    </div>
  );
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
