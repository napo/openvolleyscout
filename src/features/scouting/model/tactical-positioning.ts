export {
  getInitialTeamTacticalPhases,
  getNextTeamTacticalPhasesAfterTouch,
  getTeamPhaseFromCurrentRally,
  getTeamTacticalPhase,
  getTeamTacticalPhasesAfterTouches,
  type TeamTacticalPhase,
  type TeamTacticalPhases,
} from '../live/tactical/tactical-transition';

export {
  SETTER_RELEASE_COORDINATE,
  SETTER_RELEASE_ZONE,
  getSetterAfterReceptionOverride,
  getSetterReleaseCoordinate,
  getSetterReturnToDefenseTarget,
} from '../live/tactical/positioning/tactical-setter-layout';

export {
  getPlayerTacticalPositions,
  getSystemRotationPositions,
  resolveTacticalCourtPlayers,
  type TacticalCourtPlayer,
  type TacticalSystemPosition,
} from '../live/tactical/positioning/tactical-position-resolver';
