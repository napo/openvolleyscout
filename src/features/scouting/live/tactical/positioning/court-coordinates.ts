import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ScoutingPoint, ScoutingZone } from '@src/domain/spatial';
import { getDataVolleyZoneCoordinate } from './datavolley-zones';
import { orientAwayCourtPointForTeam } from './tactical-mirroring';

export type CoordinateBackedSystemPosition = {
  dataVolleyZone: string;
  x: number;
  y: number;
};

const LIVE_COURT_NET_X = 50;
const LIVE_COURT_HALF_DEPTH = 41;
const LIVE_COURT_LATERAL_INSET = 6;
const LIVE_COURT_LATERAL_SPAN = 88;
const SERVE_START_OFFSET_X = 3.2;
const LIVE_COURT_POINT_CACHE = new Map<string, ScoutingPoint>();

const AWAY_COURT_POSITION_COORDINATES: Record<CourtPosition, ScoutingPoint> = {
  1: { x: 18, y: 78 },
  2: { x: 38, y: 78 },
  3: { x: 38, y: 50 },
  4: { x: 38, y: 22 },
  5: { x: 18, y: 22 },
  6: { x: 18, y: 50 },
};

export const COURT_POSITION_COORDINATES: Record<TeamSide, Record<CourtPosition, ScoutingPoint>> = {
  away: AWAY_COURT_POSITION_COORDINATES,
  home: {
    1: orientAwayCourtPointForTeam('home', AWAY_COURT_POSITION_COORDINATES[1]),
    2: orientAwayCourtPointForTeam('home', AWAY_COURT_POSITION_COORDINATES[2]),
    3: orientAwayCourtPointForTeam('home', AWAY_COURT_POSITION_COORDINATES[3]),
    4: orientAwayCourtPointForTeam('home', AWAY_COURT_POSITION_COORDINATES[4]),
    5: orientAwayCourtPointForTeam('home', AWAY_COURT_POSITION_COORDINATES[5]),
    6: orientAwayCourtPointForTeam('home', AWAY_COURT_POSITION_COORDINATES[6]),
  },
};

export function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getLiveCourtPointCacheKey(teamSide: TeamSide, depth: number, lateral: number): string {
  return `${teamSide}:${depth}:${lateral}`;
}

export function mapHalfCourtSystemPointToLiveCourt(teamSide: TeamSide, point: ScoutingPoint): ScoutingPoint {
  const depth = clampPercentage(point.y);
  const lateral = clampPercentage(point.x);
  const cacheKey = getLiveCourtPointCacheKey(teamSide, depth, lateral);
  const cachedPoint = LIVE_COURT_POINT_CACHE.get(cacheKey);

  if (cachedPoint) {
    return { ...cachedPoint };
  }

  const awayPoint = {
    x: LIVE_COURT_NET_X - (depth * LIVE_COURT_HALF_DEPTH) / 100,
    y: LIVE_COURT_LATERAL_INSET + (lateral * LIVE_COURT_LATERAL_SPAN) / 100,
  };
  const liveCourtPoint = orientAwayCourtPointForTeam(teamSide, awayPoint);

  LIVE_COURT_POINT_CACHE.set(cacheKey, liveCourtPoint);

  return { ...liveCourtPoint };
}

export function getCourtPositionCoordinate(teamSide: TeamSide, courtPosition: CourtPosition): ScoutingPoint {
  return COURT_POSITION_COORDINATES[teamSide][courtPosition];
}

export function getServingPlayerServeCoordinate(teamSide: TeamSide, zone: ScoutingZone): ScoutingPoint {
  const offsetX = teamSide === 'away' ? -SERVE_START_OFFSET_X : SERVE_START_OFFSET_X;

  return {
    x: zone.center.x + offsetX,
    y: zone.center.y,
  };
}

export function getSystemPositionCoordinate(position: CoordinateBackedSystemPosition): ScoutingPoint {
  if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return {
      x: position.x,
      y: position.y,
    };
  }

  return getDataVolleyZoneCoordinate(position.dataVolleyZone);
}
