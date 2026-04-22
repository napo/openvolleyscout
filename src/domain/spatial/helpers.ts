import type { TeamSide } from '../common/enums';
import {
  SCOUTING_SIDE_WIDTH,
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET,
  SCOUTING_GRID_COLUMNS,
  SCOUTING_GRID_ROWS,
  type ScoutingPoint,
  type ScoutingZone,
  type ScoutingZoneId,
} from './types';

export function createScoutingZoneId(teamSide: TeamSide, row: number, column: number): ScoutingZoneId {
  return `${teamSide}-r${row}c${column}`;
}

export function createScoutingSideZones(teamSide: TeamSide): ScoutingZone[] {
  const width = SCOUTING_SIDE_WIDTH / SCOUTING_GRID_COLUMNS;
  const height = SCOUTING_SURFACE_HEIGHT / SCOUTING_GRID_ROWS;
  const sideOriginX = teamSide === 'away' ? SCOUTING_SURFACE_INSET : SCOUTING_SURFACE_INSET + SCOUTING_SIDE_WIDTH;
  const sideOriginY = SCOUTING_SURFACE_INSET;

  return Array.from({ length: SCOUTING_GRID_ROWS * SCOUTING_GRID_COLUMNS }, (_, index) => {
    const row = Math.floor(index / SCOUTING_GRID_COLUMNS) + 1;
    const column = (index % SCOUTING_GRID_COLUMNS) + 1;
    const x = sideOriginX + (column - 1) * width;
    const y = sideOriginY + (row - 1) * height;

    return {
      id: createScoutingZoneId(teamSide, row, column),
      teamSide,
      index: index + 1,
      gridCoordinate: { row, column },
      bounds: { x, y, width, height },
      center: {
        x: x + width / 2,
        y: y + height / 2,
      },
    };
  });
}

export function createScoutingZonesBySide() {
  return {
    away: createScoutingSideZones('away'),
    home: createScoutingSideZones('home'),
  } as const;
}

export function createFullScoutingZones() {
  const zonesBySide = createScoutingZonesBySide();
  return [...zonesBySide.away, ...zonesBySide.home];
}

export function clampScoutingPoint(point: ScoutingPoint): ScoutingPoint {
  return {
    x: Math.min(100, Math.max(0, point.x)),
    y: Math.min(100, Math.max(0, point.y)),
  };
}

export function findNearestScoutingZone(point: ScoutingPoint, zones: ScoutingZone[]): ScoutingZone {
  return zones.reduce((nearest, zone) => {
    const nearestDistance = Math.hypot(nearest.center.x - point.x, nearest.center.y - point.y);
    const zoneDistance = Math.hypot(zone.center.x - point.x, zone.center.y - point.y);
    return zoneDistance < nearestDistance ? zone : nearest;
  });
}
