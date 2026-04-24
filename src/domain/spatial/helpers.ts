import type { CourtPosition, TeamSide } from '../common/enums';
import {
  SCOUTING_SERVE_START_CELLS_PER_SIDE,
  SCOUTING_ZONES_PER_SIDE,
  SCOUTING_SIDE_WIDTH,
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_GRID_COLUMNS,
  SCOUTING_GRID_ROWS,
  type ScoutingBallPath,
  type ScoutingBallTrackPoint,
  type ScoutingPoint,
  type ScoutingZone,
  type ScoutingZoneId,
  type ServeStartLane,
} from './types';

export function createScoutingZoneId(teamSide: TeamSide, row: number, column: number): ScoutingZoneId {
  return `${teamSide}-r${row}c${column}`;
}

export function createServeStartZoneId(teamSide: TeamSide, lane: ServeStartLane): ScoutingZoneId {
  return `${teamSide}-serve-${lane}`;
}

function getServeStartLaneOrder(teamSide: TeamSide): ServeStartLane[] {
  return teamSide === 'away'
    ? ['left', 'center', 'right']
    : ['right', 'center', 'left'];
}

function getServeStartAlignedCourtPosition(teamSide: TeamSide, lane: ServeStartLane): CourtPosition {
  const laneOrder = getServeStartLaneOrder(teamSide);
  const alignedPositions: CourtPosition[] = [5, 6, 1];
  return alignedPositions[laneOrder.indexOf(lane)] ?? 1;
}

export function createScoutingSideZones(teamSide: TeamSide): ScoutingZone[] {
  const width = SCOUTING_SIDE_WIDTH / SCOUTING_GRID_COLUMNS;
  const height = SCOUTING_SURFACE_HEIGHT / SCOUTING_GRID_ROWS;
  const sideOriginX = teamSide === 'away' ? SCOUTING_SURFACE_INSET_X : SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH;
  const sideOriginY = SCOUTING_SURFACE_INSET_Y;

  return Array.from({ length: SCOUTING_GRID_ROWS * SCOUTING_GRID_COLUMNS }, (_, index) => {
    const row = Math.floor(index / SCOUTING_GRID_COLUMNS) + 1;
    const column = (index % SCOUTING_GRID_COLUMNS) + 1;
    const x = sideOriginX + (column - 1) * width;
    const y = sideOriginY + (row - 1) * height;

    return {
      id: createScoutingZoneId(teamSide, row, column),
      teamSide,
      index: index + 1,
      kind: 'in_court',
      gridCoordinate: { row, column },
      bounds: { x, y, width, height },
      center: {
        x: x + width / 2,
        y: y + height / 2,
      },
    };
  });
}

export function createServeStartZones(teamSide: TeamSide): ScoutingZone[] {
  const width = SCOUTING_SURFACE_INSET_X;
  const height = SCOUTING_SURFACE_HEIGHT / SCOUTING_SERVE_START_CELLS_PER_SIDE;
  const originX = teamSide === 'away' ? 0 : 100 - SCOUTING_SURFACE_INSET_X;
  const originY = SCOUTING_SURFACE_INSET_Y;
  const laneByRow = getServeStartLaneOrder(teamSide);

  return laneByRow.map((lane, index) => {
    const row = index + 1;
    const y = originY + index * height;

    return {
      id: createServeStartZoneId(teamSide, lane),
      teamSide,
      index: SCOUTING_ZONES_PER_SIDE + row,
      kind: 'serve_start',
      gridCoordinate: { row, column: 0 },
      bounds: { x: originX, y, width, height },
      center: {
        x: originX + width / 2,
        y: y + height / 2,
      },
      serveStartLane: lane,
      alignedCourtPosition: getServeStartAlignedCourtPosition(teamSide, lane),
    };
  });
}

export function createScoutingZonesBySide() {
  return {
    away: [...createScoutingSideZones('away'), ...createServeStartZones('away')],
    home: [...createScoutingSideZones('home'), ...createServeStartZones('home')],
  } as const;
}

export function createFullScoutingZones() {
  const zonesBySide = createScoutingZonesBySide();
  return [...zonesBySide.away, ...zonesBySide.home];
}

export function createFullScoutingCells() {
  return createFullScoutingZones();
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

export function findScoutingZoneById(zones: ScoutingZone[], zoneId: ScoutingZoneId | null | undefined) {
  if (!zoneId) {
    return null;
  }

  return zones.find((zone) => zone.id === zoneId) ?? null;
}

export function isServeStartZone(zone: ScoutingZone | null | undefined): boolean {
  return zone?.kind === 'serve_start';
}

export function getDefaultServeStartLane(teamSide: TeamSide): ServeStartLane {
  return teamSide === 'away' ? 'right' : 'left';
}

export function getDefaultServeStartZoneId(teamSide: TeamSide): ScoutingZoneId {
  return createServeStartZoneId(teamSide, getDefaultServeStartLane(teamSide));
}

export function getDefaultServeStartZone(teamSide: TeamSide, zones: ScoutingZone[]) {
  return findScoutingZoneById(zones, getDefaultServeStartZoneId(teamSide));
}

export function createScoutingBallTrackPoint(zone: ScoutingZone): ScoutingBallTrackPoint {
  return {
    zoneId: zone.id,
    teamSide: zone.teamSide,
    kind: zone.kind,
    point: zone.center,
  };
}

export function createScoutingBallPath(start: ScoutingZone, steps: ScoutingZone[] = [], end?: ScoutingZone): ScoutingBallPath {
  const mappedSteps = steps.map((zone) => createScoutingBallTrackPoint(zone));

  return {
    start: createScoutingBallTrackPoint(start),
    steps: mappedSteps,
    end: end ? createScoutingBallTrackPoint(end) : mappedSteps.at(-1),
  };
}
