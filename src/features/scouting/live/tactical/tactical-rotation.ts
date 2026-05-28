import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup, ActiveLineupSlot } from '@src/domain/lineup/types';
import { updateLiberoFrontRowStatus } from './tactical-libero';

export const SIDEOUT_ROTATION_MAP: Record<CourtPosition, CourtPosition> = {
  1: 6,
  6: 5,
  5: 4,
  4: 3,
  3: 2,
  2: 1,
};

const ALL_COURT_POSITIONS = new Set<CourtPosition>([1, 2, 3, 4, 5, 6]);

export function validateRotatedLineup(lineup: ActiveLineup): void {
  const positions = lineup.slots.map((slot) => slot.courtPosition);
  const positionSet = new Set(positions);
  const playerIds = lineup.slots.map((slot) => slot.playerId).filter(Boolean);
  const playerSet = new Set(playerIds);

  if (positionSet.size !== 6) {
    console.error('[OpenVolleyScout] Rotation invariant violated: duplicate court positions after side-out', {
      teamSide: lineup.teamSide,
      positions,
      duplicates: positions.filter((p, i) => positions.indexOf(p) !== i),
    });
  }

  for (const required of ALL_COURT_POSITIONS) {
    if (!positionSet.has(required)) {
      console.error('[OpenVolleyScout] Rotation invariant violated: missing court position after side-out', {
        teamSide: lineup.teamSide,
        missingPosition: required,
        positions,
      });
    }
  }

  if (playerSet.size !== playerIds.length) {
    console.error('[OpenVolleyScout] Rotation invariant violated: duplicate player IDs in lineup after side-out', {
      teamSide: lineup.teamSide,
      duplicates: playerIds.filter((id, i) => playerIds.indexOf(id) !== i),
    });
  }

  if (lineup.slots.length !== 6) {
    console.error('[OpenVolleyScout] Rotation invariant violated: lineup must have exactly 6 slots', {
      teamSide: lineup.teamSide,
      slotCount: lineup.slots.length,
    });
  }
}

export function getNextServingTeamAfterPoint(servingTeam: TeamSide, pointWinner: TeamSide): TeamSide {
  return pointWinner === servingTeam ? servingTeam : pointWinner;
}

export function shouldRotateLineupAfterPoint(servingTeam: TeamSide, pointWinner: TeamSide): boolean {
  return pointWinner !== servingTeam;
}

export function rotateLineupForSideOut(lineup: ActiveLineup): ActiveLineup {
  const rotatedSlots = lineup.slots.map((slot) => rotateLineupSlot(slot));
  const rotatedLineup = updateLiberoFrontRowStatus({
    ...lineup,
    slots: rotatedSlots,
  });

  validateRotatedLineup(rotatedLineup);

  return rotatedLineup;
}

function rotateLineupSlot(slot: ActiveLineupSlot): ActiveLineupSlot {
  return {
    ...slot,
    courtPosition: SIDEOUT_ROTATION_MAP[slot.courtPosition],
  };
}
