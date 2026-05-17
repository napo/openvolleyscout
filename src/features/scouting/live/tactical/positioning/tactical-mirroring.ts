import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingPoint } from '@src/domain/spatial';

export function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

export function mirrorLiveCourtPoint(point: ScoutingPoint): ScoutingPoint {
  return {
    x: 100 - point.x,
    y: 100 - point.y,
  };
}

export function orientAwayCourtPointForTeam(teamSide: TeamSide, awayPoint: ScoutingPoint): ScoutingPoint {
  return teamSide === 'home' ? mirrorLiveCourtPoint(awayPoint) : awayPoint;
}
