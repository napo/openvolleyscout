import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingPoint, ScoutingZone } from '@src/domain/spatial';

export type LiveCourtPhase = 'waiting_to_serve' | 'rally_in_play';

export function getAllowedZonesForLiveCourtPhase(zones: ScoutingZone[], phase: LiveCourtPhase): ScoutingZone[] {
  return phase === 'waiting_to_serve'
    ? zones
    : zones.filter((zone) => zone.kind === 'in_court');
}

export function getNextLiveCourtPhase(currentPhase: LiveCourtPhase, zone: ScoutingZone): LiveCourtPhase {
  if (currentPhase === 'waiting_to_serve' && zone.kind === 'in_court') {
    return 'rally_in_play';
  }

  return currentPhase;
}

export function getServingPlayerServeStartPosition(teamSide: TeamSide, zone: ScoutingZone): ScoutingPoint {
  const offsetX = teamSide === 'away' ? 3.2 : -3.2;

  return {
    x: zone.center.x + offsetX,
    y: zone.center.y,
  };
}
