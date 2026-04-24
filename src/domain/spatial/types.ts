import type { TeamSide } from '../common/enums';
import type { CourtPosition } from '../common/enums';

export const SCOUTING_GRID_ROWS = 6;
export const SCOUTING_GRID_COLUMNS = 6;
export const SCOUTING_ZONES_PER_SIDE = SCOUTING_GRID_ROWS * SCOUTING_GRID_COLUMNS;
export const SCOUTING_SERVE_START_CELLS_PER_SIDE = 3;
export const SCOUTING_SURFACE_INSET_X = 9;
export const SCOUTING_SURFACE_INSET_Y = 6;
export const SCOUTING_SURFACE_WIDTH = 100 - SCOUTING_SURFACE_INSET_X * 2;
export const SCOUTING_SURFACE_HEIGHT = 100 - SCOUTING_SURFACE_INSET_Y * 2;
export const SCOUTING_SIDE_WIDTH = SCOUTING_SURFACE_WIDTH / 2;

export type ScoutingCellKind = 'in_court' | 'serve_start';
export type ServeStartLane = 'left' | 'center' | 'right';
export type ScoutingZoneId =
  | `${TeamSide}-r${number}c${number}`
  | `${TeamSide}-serve-${ServeStartLane}`;
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
  kind: ScoutingCellKind;
  gridCoordinate: ScoutingGridCoordinate;
  bounds: ScoutingZoneBounds;
  center: ScoutingPoint;
  serveStartLane?: ServeStartLane;
  alignedCourtPosition?: CourtPosition;
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

export interface ScoutingBallTrackPoint {
  zoneId: ScoutingZoneId;
  teamSide: TeamSide;
  kind: ScoutingCellKind;
  point: ScoutingPoint;
}

export interface ScoutingBallPath {
  start: ScoutingBallTrackPoint;
  steps: ScoutingBallTrackPoint[];
  end?: ScoutingBallTrackPoint;
}
