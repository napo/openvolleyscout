import type { TeamSide } from '../common/enums';
import {
  COURT_SIDE_WIDTH,
  COURT_SURFACE_HEIGHT,
  COURT_SURFACE_INSET,
  COURT_ZONE_COLUMNS,
  COURT_ZONE_ROWS,
  type CourtZone,
  type CourtPoint,
  type CourtZoneId,
} from './types';

export function createCourtZoneId(teamSide: TeamSide, row: number, column: number): CourtZoneId {
  return `${teamSide}-r${row}c${column}`;
}

export function createCourtSideZones(teamSide: TeamSide): CourtZone[] {
  const width = COURT_SIDE_WIDTH / COURT_ZONE_COLUMNS;
  const height = COURT_SURFACE_HEIGHT / COURT_ZONE_ROWS;
  const sideOriginX = teamSide === 'away' ? COURT_SURFACE_INSET : COURT_SURFACE_INSET + COURT_SIDE_WIDTH;
  const sideOriginY = COURT_SURFACE_INSET;

  return Array.from({ length: COURT_ZONE_ROWS * COURT_ZONE_COLUMNS }, (_, index) => {
    const row = Math.floor(index / COURT_ZONE_COLUMNS) + 1;
    const column = (index % COURT_ZONE_COLUMNS) + 1;
    const x = sideOriginX + (column - 1) * width;
    const y = sideOriginY + (row - 1) * height;

    return {
      id: createCourtZoneId(teamSide, row, column),
      teamSide,
      index: index + 1,
      gridPosition: { row, column },
      bounds: { x, y, width, height },
      center: {
        x: x + width / 2,
        y: y + height / 2,
      },
    };
  });
}

export function createCourtZonesBySide() {
  return {
    away: createCourtSideZones('away'),
    home: createCourtSideZones('home'),
  } as const;
}

export function createFullCourtZones() {
  const zonesBySide = createCourtZonesBySide();
  return [...zonesBySide.away, ...zonesBySide.home];
}

export function clampCourtPoint(point: CourtPoint): CourtPoint {
  return {
    x: Math.min(100, Math.max(0, point.x)),
    y: Math.min(100, Math.max(0, point.y)),
  };
}

export function findNearestCourtZone(point: CourtPoint, zones: CourtZone[]): CourtZone {
  return zones.reduce((nearest, zone) => {
    const nearestDistance = Math.hypot(nearest.center.x - point.x, nearest.center.y - point.y);
    const zoneDistance = Math.hypot(zone.center.x - point.x, zone.center.y - point.y);
    return zoneDistance < nearestDistance ? zone : nearest;
  });
}
