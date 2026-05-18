import type { TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup, ActiveLineupSlot } from '@src/domain/lineup/types';
import type { MatchEvent } from '@src/domain/events/types';
import {
  isBackRowPosition,
  isMiddleBlockerRole,
  isRegisteredLiberoPlayer,
} from './libero-rules';
import { getLiberoReplacementViolation } from './libero-validation';
import { normalizeActiveLineup } from './libero-state';

export function canLiberoReplaceSlot(input: {
  lineup: ActiveLineup;
  slot: ActiveLineupSlot;
  servingTeam?: TeamSide | null;
  allowLiberoServe?: boolean;
}): boolean {
  const normalizedLineup = normalizeActiveLineup(input.lineup);
  const wouldLiberoServe = input.slot.courtPosition === 1
    && input.servingTeam === normalizedLineup.teamSide;

  return (
    isBackRowPosition(input.slot.courtPosition)
    && !input.slot.isLibero
    && !isRegisteredLiberoPlayer(normalizedLineup, input.slot.playerId)
    && (input.allowLiberoServe || !wouldLiberoServe)
  );
}

export function canLiberoReplaceMiddleSlot(input: {
  lineup: ActiveLineup;
  slot: ActiveLineupSlot;
  servingTeam?: TeamSide | null;
  allowLiberoServe?: boolean;
}): boolean {
  return canLiberoReplaceSlot(input) && isMiddleBlockerRole(input.slot.tacticalRole);
}

export function validateLiberoReplacementEvent(
  lineup: ActiveLineup,
  event: Extract<MatchEvent, { type: 'libero_replacement_made' }>,
): boolean {
  return getLiberoReplacementViolation(lineup, event) === null;
}
