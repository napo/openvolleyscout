import type { TeamSide } from '../common/enums';

export const SCOUTING_GRID_ROWS = 6;
export const SCOUTING_GRID_COLUMNS = 6;
export const SCOUTING_ZONES_PER_SIDE = SCOUTING_GRID_ROWS * SCOUTING_GRID_COLUMNS;
/** DataVolley manual 13.2: the baseline is split into 5 serve start zones (1, 9, 6, 7, 5). */
export const SCOUTING_SERVE_START_CELLS_PER_SIDE = 5;
export const SCOUTING_SURFACE_INSET_X = 12;
export const SCOUTING_SURFACE_INSET_Y = 12;
export const SCOUTING_SURFACE_INSET = SCOUTING_SURFACE_INSET_X;
export const SCOUTING_SURFACE_WIDTH = 100 - SCOUTING_SURFACE_INSET_X * 2;
export const SCOUTING_SURFACE_HEIGHT = 100 - SCOUTING_SURFACE_INSET_Y * 2;
export const SCOUTING_SIDE_WIDTH = SCOUTING_SURFACE_WIDTH / 2;

export type ScoutingCellKind = 'in_court' | 'serve_start';
/**
 * Lanes run along the baseline. `mid-left` and `mid-right` are the two conflict zones
 * between 5/6 and 6/1 (DataVolley serve start zones 7 and 9).
 */
export type ServeStartLane = 'left' | 'mid-left' | 'center' | 'mid-right' | 'right';
/** DataVolley serve start zone: 1, 6, 5 on the baseline, plus 9 (between 6 and 1) and 7 (between 6 and 5). */
export type ServeStartPosition = 1 | 5 | 6 | 7 | 9;
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
  /** For serve start cells: the DataVolley serve start zone (1, 5, 6, 7 or 9). */
  alignedCourtPosition?: ServeStartPosition;
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
