import type { ActiveLineup } from '@src/domain/lineup/types';
import type { MatchEvent } from '@src/domain/events/types';
import {
  getSlotByPlayerId,
  isFrontRowPosition,
} from './libero-rules';
import {
  normalizeActiveLineup,
  updateBenchAfterLiberoSwap,
  updateLiberoFrontRowStatus,
  updateOnCourtAfterLiberoSwap,
} from './libero-state';
import { getLiberoReplacementViolation } from './libero-validation';

export function applyLiberoReplacementToLineup(
  lineup: ActiveLineup,
  event: Extract<MatchEvent, { type: 'libero_replacement_made' }>,
): ActiveLineup | null {
  const normalizedLineup = normalizeActiveLineup(lineup);
  const slot = getSlotByPlayerId(normalizedLineup, event.playerOutId);
  if (!slot || getLiberoReplacementViolation(normalizedLineup, event)) {
    return null;
  }

  const nextSlots = normalizedLineup.slots.map((currentSlot) => {
    if (currentSlot.playerId !== event.playerOutId) {
      return currentSlot;
    }

    if (event.action === 'regular_returns') {
      return {
        ...currentSlot,
        playerId: event.playerInId,
        tacticalRole: event.replacedPlayerRole ?? currentSlot.tacticalRole,
        isLibero: false,
        replacedPlayerId: undefined,
      };
    }

    return {
      ...currentSlot,
      playerId: event.playerInId,
      tacticalRole: event.replacedPlayerRole ?? currentSlot.tacticalRole,
      isLibero: true,
      replacedPlayerId: event.replacedPlayerId,
    };
  });
  const nextPersonnelBase = {
    ...normalizedLineup.personnelState,
    onCourtPlayerIds: updateOnCourtAfterLiberoSwap(normalizedLineup.personnelState, event.playerOutId, event.playerInId),
    lastLiberoReplacementRallyNumber: event.rallyNumber,
    activeLiberoState: event.action === 'regular_returns'
      ? undefined
      : {
          liberoPlayerId: event.playerInId,
          replacedPlayerId: event.replacedPlayerId,
          replacedPlayerRole: event.replacedPlayerRole,
          teamSide: event.teamSide,
          enteredAtRallyNumber: event.rallyNumber,
          mustExitBeforeFrontRow: isFrontRowPosition(slot.courtPosition),
        },
  };

  return updateLiberoFrontRowStatus({
    ...normalizedLineup,
    slots: nextSlots,
    personnelState: {
      ...nextPersonnelBase,
      benchPlayerIds: updateBenchAfterLiberoSwap(nextPersonnelBase, event.playerOutId, event.playerInId),
    },
  });
}

