import type { ActiveLineup, StartingLineup, TeamSetPersonnelState } from './types';

function createTeamSetPersonnelState(startingLineup: StartingLineup): TeamSetPersonnelState {
  const onCourtPlayerIds = startingLineup.slots.map((slot) => slot.playerId).filter(Boolean);
  const liberoPlayerIds = startingLineup.liberoPlayerIds ?? [];
  const benchPlayerIds = (startingLineup.benchPlayerIds ?? [])
    .filter((playerId) => playerId && !onCourtPlayerIds.includes(playerId));
  const [liberoPlayerId, secondLiberoPlayerId] = liberoPlayerIds;

  return {
    onCourtPlayerIds,
    benchPlayerIds,
    liberoPlayerId,
    secondLiberoPlayerId,
    liberoAutoMiddleReplacement: startingLineup.liberoAutoMiddleReplacement ?? true,
    substitutionPairs: [],
    substitutionHistory: [],
  };
}

export function createActiveLineup(startingLineup: StartingLineup): ActiveLineup {
  return {
    teamSide: startingLineup.teamSide,
    setterPlayerId: startingLineup.setterPlayerId,
    liberoPlayerIds: startingLineup.liberoPlayerIds ?? [],
    slots: startingLineup.slots.map((slot) => ({
      courtPosition: slot.courtPosition,
      playerId: slot.playerId,
      tacticalRole: slot.tacticalRole,
    })),
    personnelState: createTeamSetPersonnelState(startingLineup),
  };
}
