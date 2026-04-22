import type { ActiveLineup } from '../lineup';
import type { TacticalSystem, PlayerResolutionResult } from './types';
import type { ScoutingZoneId } from '../spatial';

export function resolvePlayerForZone(
  zoneId: ScoutingZoneId,
  activeLineup: ActiveLineup,
  tacticalSystem: TacticalSystem,
): PlayerResolutionResult {
  const phaseMap = tacticalSystem.phases[tacticalSystem.activePhase];
  const assignment = phaseMap.assignments.find((entry) => entry.zoneId === zoneId);
  const resolvedCourtPositions = assignment?.courtPositions ?? [];

  const candidatePlayerIds = resolvedCourtPositions
    .map((courtPosition) => activeLineup.slots.find((slot) => slot.courtPosition === courtPosition)?.playerId)
    .filter((playerId): playerId is string => Boolean(playerId));

  return {
    zoneId,
    phase: tacticalSystem.activePhase,
    primaryPlayerId: candidatePlayerIds[0] ?? null,
    candidatePlayerIds,
    resolvedCourtPositions,
  };
}
