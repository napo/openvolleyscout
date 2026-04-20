import type { TeamSide } from '../common/enums';

export const COURT_ZONE_ROWS = 6;
export const COURT_ZONE_COLUMNS = 6;
export const COURT_ZONES_PER_SIDE = COURT_ZONE_ROWS * COURT_ZONE_COLUMNS;
export const COURT_SURFACE_INSET = 3;
export const COURT_SURFACE_WIDTH = 100 - COURT_SURFACE_INSET * 2;
export const COURT_SIDE_WIDTH = COURT_SURFACE_WIDTH / 2;
export const COURT_SURFACE_HEIGHT = 100 - COURT_SURFACE_INSET * 2;

export type CourtZoneId = `${TeamSide}-r${number}c${number}`;

export interface CourtPoint {
  x: number;
  y: number;
}

export interface CourtGridPosition {
  row: number;
  column: number;
}

export interface CourtZoneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CourtZone {
  id: CourtZoneId;
  teamSide: TeamSide;
  index: number;
  gridPosition: CourtGridPosition;
  bounds: CourtZoneBounds;
  center: CourtPoint;
}
