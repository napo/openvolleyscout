import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingPoint } from '@src/domain/spatial';
import type { TeamTacticalPhase } from './tactical-transition';

export const SETTER_RELEASE_ZONE = '2c';

// Half-court tactical coordinate: lateral x, depth y. This intentionally
// sits closer to the net and more central than the generic DataVolley 2c spot.
export const SETTER_RELEASE_COORDINATE: ScoutingPoint = { x: 66, y: 10 };

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function mapHalfCourtSystemPointToLiveCourt(teamSide: TeamSide, point: ScoutingPoint): ScoutingPoint {
  const depth = clampPercentage(point.y);
  const lateral = clampPercentage(point.x);

  if (teamSide === 'away') {
    return {
      x: 50 - (depth * 41) / 100,
      y: 6 + (lateral * 88) / 100,
    };
  }

  return {
    x: 50 + (depth * 41) / 100,
    y: 94 - (lateral * 88) / 100,
  };
}

export function getSetterReleaseCoordinate(teamSide: TeamSide): ScoutingPoint {
  return mapHalfCourtSystemPointToLiveCourt(teamSide, SETTER_RELEASE_COORDINATE);
}

export function getSetterAfterReceptionOverride(teamSide: TeamSide): ScoutingPoint {
  return getSetterReleaseCoordinate(teamSide);
}

export function isSetterReleasePhase(phase: TeamTacticalPhase): boolean {
  return (
    phase === 'after_reception_setter_release'
    || phase === 'break_point_setter_release'
    || phase === 'side_out_setter_release'
  );
}
