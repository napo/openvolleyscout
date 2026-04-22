import type { TeamSide } from '../common/enums';

export const SCOUTING_GRID_ROWS = 6;
export const SCOUTING_GRID_COLUMNS = 6;
export const SCOUTING_ZONES_PER_SIDE = SCOUTING_GRID_ROWS * SCOUTING_GRID_COLUMNS;
export const SCOUTING_SURFACE_INSET = 3;
export const SCOUTING_SURFACE_WIDTH = 100 - SCOUTING_SURFACE_INSET * 2;
export const SCOUTING_SIDE_WIDTH = SCOUTING_SURFACE_WIDTH / 2;
export const SCOUTING_SURFACE_HEIGHT = 100 - SCOUTING_SURFACE_INSET * 2;

export type ScoutingZoneId = `${TeamSide}-r${number}c${number}`;
export type ScoutingSubzoneId = string;

export interface ScoutingPoint {
  x: number;
  y: number;
}

export interface ScoutingGridCoordinate {
  row: number;
  column: number;
}

export interface ScoutingZoneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScoutingZone {
  id: ScoutingZoneId;
  teamSide: TeamSide;
  index: number;
  gridCoordinate: ScoutingGridCoordinate;
  bounds: ScoutingZoneBounds;
  center: ScoutingPoint;
}

export interface ScoutingZoneReference {
  teamSide: TeamSide;
  zoneId?: ScoutingZoneId;
  gridCoordinate?: ScoutingGridCoordinate;
  point?: ScoutingPoint;
  subzoneId?: ScoutingSubzoneId;
}

export interface ScoutingDirectionData {
  start?: ScoutingZoneReference;
  end?: ScoutingZoneReference;
  path?: ScoutingPoint[];
}
