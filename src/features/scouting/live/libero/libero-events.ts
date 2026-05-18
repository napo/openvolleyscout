import type { MatchEvent } from '@src/domain/events/types';
import type { LiberoLiveMatchSnapshot } from './libero-automation';
import type { LiberoReplacementProposal } from './libero-rules';

function createEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function buildLiberoReplacementMadeEvent(
  liveMatch: Pick<LiberoLiveMatchSnapshot, 'currentRallyNumber'> & { currentSetNumber: number },
  proposal: LiberoReplacementProposal,
): MatchEvent {
  return {
    id: createEventId(),
    type: 'libero_replacement_made',
    createdAt: Date.now(),
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide: proposal.teamSide,
    liberoPlayerId: proposal.liberoPlayerId,
    replacedPlayerId: proposal.replacedPlayerId,
    replacedPlayerRole: proposal.replacedPlayerRole,
    playerOutId: proposal.playerOutId,
    playerInId: proposal.playerInId,
    action: proposal.action,
  };
}

