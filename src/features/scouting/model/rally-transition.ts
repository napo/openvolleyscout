import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup, ActiveLineupSlot } from '@src/domain/lineup/types';
import { updateLiberoFrontRowStatus } from './personnel';

export const SIDEOUT_ROTATION_MAP: Record<CourtPosition, CourtPosition> = {
  1: 6,
  6: 5,
  5: 4,
  4: 3,
  3: 2,
  2: 1,
};

export function getNextServingTeamAfterPoint(servingTeam: TeamSide, pointWinner: TeamSide): TeamSide {
  return pointWinner === servingTeam ? servingTeam : pointWinner;
}

export function shouldRotateLineupAfterPoint(servingTeam: TeamSide, pointWinner: TeamSide): boolean {
  return pointWinner !== servingTeam;
}

export function rotateLineupForSideOut(lineup: ActiveLineup): ActiveLineup {
  const rotatedSlots = lineup.slots.map((slot) => rotateLineupSlot(slot));

  return updateLiberoFrontRowStatus({
    ...lineup,
    slots: rotatedSlots,
  });
}

function rotateLineupSlot(slot: ActiveLineupSlot): ActiveLineupSlot {
  return {
    ...slot,
    courtPosition: SIDEOUT_ROTATION_MAP[slot.courtPosition],
  };
}
