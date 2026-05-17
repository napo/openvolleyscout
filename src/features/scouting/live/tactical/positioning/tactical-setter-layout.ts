import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingPoint } from '@src/domain/spatial';
import { PlayerRole, type DefenseRotation, type DefenseSystemBlock } from '@src/domain/systems';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK } from '@src/config/systems';
import {
  getDefenseContextForTacticalPhase,
  type TeamTacticalPhase,
} from '../tactical-transition';
import {
  getSystemPositionCoordinate,
  mapHalfCourtSystemPointToLiveCourt,
} from './court-coordinates';
import { getDefenseRotationPositions } from './tactical-defense-layout';

export const SETTER_RELEASE_ZONE = '2c';

// Half-court tactical coordinate: lateral x, depth y. This intentionally
// sits closer to the net and more central than the generic DataVolley 2c spot.
export const SETTER_RELEASE_COORDINATE: ScoutingPoint = { x: 66, y: 10 };

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

export function getSetterReturnToDefenseTarget({
  teamSide,
  phase,
  rotation,
  defenseSystemBlock,
}: {
  teamSide: TeamSide;
  phase: TeamTacticalPhase;
  rotation: DefenseRotation;
  defenseSystemBlock?: DefenseSystemBlock | null;
}): ScoutingPoint | null {
  const setterPosition = getDefenseRotationPositions(
    defenseSystemBlock ?? DEFAULT_DEFENSE_SYSTEM_BLOCK,
    getDefenseContextForTacticalPhase(phase),
    rotation,
  ).find((position) => position.role === PlayerRole.SETTER);

  if (!setterPosition) {
    return null;
  }

  return mapHalfCourtSystemPointToLiveCourt(
    teamSide,
    getSystemPositionCoordinate(setterPosition),
  );
}
