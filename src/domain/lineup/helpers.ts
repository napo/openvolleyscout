import type { ActiveLineup, StartingLineup } from './types';

export function createActiveLineup(startingLineup: StartingLineup): ActiveLineup {
  return {
    teamSide: startingLineup.teamSide,
    setterPlayerId: startingLineup.setterPlayerId,
    liberoPlayerIds: startingLineup.liberoPlayerIds,
    slots: startingLineup.slots.map((slot) => ({
      courtPosition: slot.courtPosition,
      playerId: slot.playerId,
      tacticalRole: slot.tacticalRole,
    })),
  };
}
