import { useMemo } from 'react';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { HeatmapDensityGrid, HeatmapEvent } from '../aggregation/heatmap-aggregation';
import type { HeatmapEndpoint, HeatmapMode } from '../filters/heatmap-filters';
import { DensityModePanel, DensityModeLegend } from './DensityMode';
import { PointModePanel, PointModeLegend } from './PointMode';
import { DirectionModePanel, DirectionModeLegend } from './DirectionMode';
import { DensityDirectionModePanel, DensityDirectionModeLegend } from './DensityDirectionMode';
import { ZoneDensityModePanel, ZoneDensityModeLegend } from './ZoneDensityMode';

/**
 * Factory hook to select the appropriate heatmap mode component and legend.
 * Returns componentized rendering logic based on the selected mode.
 */

export interface HeatmapModeConfig {
  mode: HeatmapMode;
  endpoint?: HeatmapEndpoint;
  grid?: HeatmapDensityGrid;
  events: HeatmapEvent[];
  stats?: MatchStats;
  teamSide?: 'home' | 'away';
  teamLabel: string;
  homeLabel?: string;
  awayLabel?: string;
  showArrows?: boolean;
  hoveredCell?: HeatmapDensityGrid['cells'][number] | null;
  hoveredEvent?: HeatmapEvent | null;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

export interface HeatmapModeSelection {
  renderPanel: React.ReactNode;
  renderLegend: React.ReactNode;
  mode: HeatmapMode;
}

/**
 * Select the correct panel and legend renderer based on mode.
 * Memoized to prevent unnecessary re-renders.
 */
export function useHeatmapMode(config: HeatmapModeConfig): HeatmapModeSelection {
  return useMemo(() => {
    const { mode, endpoint, grid, events, teamSide, teamLabel, homeLabel, awayLabel, showArrows, hoveredCell, hoveredEvent, onCellHover, onEventHover } = config;

    switch (mode) {
      case 'density':
        if (!teamSide) throw new Error('teamSide required for density mode');
        return {
          mode: 'density',
          renderPanel: (
            <DensityModePanel
              grid={grid}
              teamSide={teamSide}
              teamLabel={teamLabel}
              hoveredCell={hoveredCell}
              onCellHover={onCellHover}
            />
          ),
          renderLegend: <DensityModeLegend />,
        };

      case 'point':
        if (!endpoint || !teamSide) throw new Error('endpoint and teamSide required for point mode');
        return {
          mode: 'point',
          renderPanel: (
            <PointModePanel
              events={events}
              endpoint={endpoint}
              teamSide={teamSide}
              teamLabel={teamLabel}
              hoveredEvent={hoveredEvent}
              onEventHover={onEventHover}
            />
          ),
          renderLegend: <PointModeLegend />,
        };

      case 'direction':
        if (!homeLabel || !awayLabel) throw new Error('homeLabel and awayLabel required for direction mode');
        return {
          mode: 'direction',
          renderPanel: (
            <DirectionModePanel
              events={events}
              homeLabel={homeLabel}
              awayLabel={awayLabel}
              hoveredEvent={hoveredEvent}
              onEventHover={onEventHover}
            />
          ),
          renderLegend: <DirectionModeLegend />,
        };

      case 'density-direction':
        if (!teamSide) throw new Error('teamSide required for density-direction mode');
        return {
          mode: 'density-direction',
          renderPanel: (
            <DensityDirectionModePanel
              grid={grid}
              events={events}
              teamSide={teamSide}
              teamLabel={teamLabel}
              showArrows={showArrows ?? true}
              hoveredCell={hoveredCell}
              hoveredEvent={hoveredEvent}
              onCellHover={onCellHover}
              onEventHover={onEventHover}
            />
          ),
          renderLegend: <DensityDirectionModeLegend />,
        };

      case 'zone-density':
        if (!stats) throw new Error('stats required for zone-density mode');
        return {
          mode: 'zone-density',
          renderPanel: <ZoneDensityModePanel stats={stats} />,
          renderLegend: <ZoneDensityModeLegend />,
        };

      default:
        const _exhaustive: never = mode;
        return _exhaustive;
    }
  }, [config]);
}

/**
 * Alternative selector for just the panel component.
 */
export function useHeatmapModePanel(config: HeatmapModeConfig): React.ReactNode {
  const selection = useHeatmapMode(config);
  return selection.renderPanel;
}

/**
 * Alternative selector for just the legend component.
 */
export function useHeatmapModeLegend(config: HeatmapModeConfig): React.ReactNode {
  const selection = useHeatmapMode(config);
  return selection.renderLegend;
}
