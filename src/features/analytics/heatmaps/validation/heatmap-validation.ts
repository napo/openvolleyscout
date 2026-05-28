import type { StagePoint } from '@src/domain/trajectory/types';
import {
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
  SCOUTING_SURFACE_HEIGHT,
} from '@src/domain/spatial/types';
import type { HeatmapEvent } from '../aggregation/heatmap-aggregation';

export interface HeatmapPointBoundsReport {
  total: number;
  outsideCourt: number;
  insideCourt: number;
  outsideStage: number;
}

function isInsideCourt(pt: StagePoint): boolean {
  return (
    pt.x >= SCOUTING_SURFACE_INSET_X &&
    pt.x <= SCOUTING_SURFACE_INSET_X + SCOUTING_SURFACE_WIDTH &&
    pt.y >= SCOUTING_SURFACE_INSET_Y &&
    pt.y <= SCOUTING_SURFACE_INSET_Y + SCOUTING_SURFACE_HEIGHT
  );
}

function isInsideStage(pt: StagePoint): boolean {
  return pt.x >= 0 && pt.x <= 100 && pt.y >= 0 && pt.y <= 100;
}

export function checkHeatmapEventBounds(
  events: readonly HeatmapEvent[],
  useEndPoint = true,
): HeatmapPointBoundsReport {
  let outsideCourt = 0;
  let outsideStage = 0;

  for (const ev of events) {
    const pt = useEndPoint ? ev.end : ev.start;
    if (!isInsideStage(pt)) {
      outsideStage += 1;
    } else if (!isInsideCourt(pt)) {
      outsideCourt += 1;
    }
  }

  return {
    total: events.length,
    outsideCourt,
    insideCourt: events.length - outsideCourt - outsideStage,
    outsideStage,
  };
}
