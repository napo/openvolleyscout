import type { ActiveLineup, StartingLineup } from './types';

export function createActiveLineup(startingLineup: StartingLineup): ActiveLineup {
  return {
    teamSide: startingLineup.teamSide,
    slots: startingLineup.slots.map((slot) => ({
      courtPosition: slot.courtPosition,
      playerId: slot.playerId,
      isLibero: startingLineup.liberoPlayerIds.includes(slot.playerId),
    })),
  };
}
