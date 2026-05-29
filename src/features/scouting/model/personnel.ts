import type { TeamSide } from '@src/domain/common/enums';
import type {
  ActiveLineup,
  NormalSubstitutionRecord,
  TeamSetPersonnelState,
} from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { LiveMatchState } from './index';
import {
  getRegisteredLiberoPlayerIds,
  getSlotByPlayerId,
  legalizeActiveLineup,
  normalizeActiveLineup,
  uniquePlayerIds,
} from '../live/libero';

export {
  applyLiberoReplacementToLineup,
  buildLiberoReplacementMadeEvent,
  getAutomaticLiberoReplacementProposal,
  getManualLiberoReplacementProposals,
  isBackRowPosition,
  isFrontRowPosition,
  isMiddleBlockerRole,
  legalizeActiveLineup,
  normalizeActiveLineup,
  normalizePersonnelState,
  updateLiberoFrontRowStatus,
  type LiberoReplacementAction,
  type LiberoReplacementProposal,
} from '../live/libero';

export type DeadBallEventType =
  | 'replay'
  | 'video_check'
  | 'rotation_fault'
  | 'red_card'
  | 'timeout'
  | 'substitution'
  | 'libero_replacement'
  | 'sanction'
  | 'other';

export interface SubstitutionEligibilityResult {
  isEligible: boolean;
  reason?: 'libero_not_allowed' | 'player_out_not_on_court' | 'player_in_not_on_bench' | 'reentry_not_allowed';
}

function createEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function updateBenchAfterSwap(personnel: TeamSetPersonnelState, playerOutId: string, playerInId: string) {
  return uniquePlayerIds([
    ...personnel.benchPlayerIds.filter((playerId) => playerId !== playerInId),
    playerOutId,
  ]).filter((playerId) => playerId && !personnel.onCourtPlayerIds.includes(playerId));
}

function updateOnCourtAfterSwap(personnel: TeamSetPersonnelState, playerOutId: string, playerInId: string) {
  return uniquePlayerIds(personnel.onCourtPlayerIds.map((playerId) => (
    playerId === playerOutId ? playerInId : playerId
  )));
}

function buildSubstitutionRecord(
  event: Extract<MatchEvent, { type: 'substitution_made' }>,
  hasReentered: boolean,
): NormalSubstitutionRecord {
  return {
    teamSide: event.teamSide,
    playerOutId: event.playerOutId,
    playerInId: event.playerInId,
    setNumber: event.setNumber,
    rallyNumber: event.rallyNumber ?? 0,
    canReenterOnlyForPlayerId: event.canReenterOnlyForPlayerId ?? event.playerInId,
    hasReentered,
  };
}

export function applyNormalSubstitutionToLineup(
  lineup: ActiveLineup,
  event: Extract<MatchEvent, { type: 'substitution_made' }>,
): ActiveLineup | null {
  const normalizedLineup = normalizeActiveLineup(lineup);
  const slot = getSlotByPlayerId(normalizedLineup, event.playerOutId);
  if (!slot || slot.isLibero) {
    return null;
  }

  const existingPair = normalizedLineup.personnelState.substitutionPairs.find((pair) => (
    pair.playerOutId === event.playerInId && pair.playerInId === event.playerOutId
  ));
  const isReentry = Boolean(existingPair && !existingPair.hasReentered);
  const record = buildSubstitutionRecord(event, isReentry);
  const nextPairs = isReentry
    ? normalizedLineup.personnelState.substitutionPairs.map((pair) => (
        pair === existingPair ? { ...pair, hasReentered: true } : pair
      ))
    : [
        ...normalizedLineup.personnelState.substitutionPairs,
        buildSubstitutionRecord(event, false),
      ];
  const nextPersonnelBase = {
    ...normalizedLineup.personnelState,
    onCourtPlayerIds: updateOnCourtAfterSwap(normalizedLineup.personnelState, event.playerOutId, event.playerInId),
    substitutionPairs: nextPairs,
    substitutionHistory: [
      ...normalizedLineup.personnelState.substitutionHistory,
      record,
    ],
  };

  return {
    ...normalizedLineup,
    slots: normalizedLineup.slots.map((currentSlot) => (
      currentSlot.playerId === event.playerOutId
        ? {
            ...currentSlot,
            playerId: event.playerInId,
          }
        : currentSlot
    )),
    personnelState: {
      ...nextPersonnelBase,
      benchPlayerIds: updateBenchAfterSwap(nextPersonnelBase, event.playerOutId, event.playerInId),
    },
  };
}

export function getNormalSubstitutionEligibility(input: {
  lineup: ActiveLineup;
  playerOutId: string;
  playerInId: string;
  rosterPlayers: readonly Player[];
}): SubstitutionEligibilityResult {
  const lineup = normalizeActiveLineup(input.lineup);
  const playerOutSlot = getSlotByPlayerId(lineup, input.playerOutId);
  const onCourtPlayerIds = new Set(lineup.personnelState.onCourtPlayerIds);
  const liberoPlayerIds = getRegisteredLiberoPlayerIds(lineup);
  const outgoingRosterPlayer = input.rosterPlayers.find((player) => player.id === input.playerOutId);
  const incomingRosterPlayer = input.rosterPlayers.find((player) => player.id === input.playerInId);

  if (!playerOutSlot || playerOutSlot.isLibero) {
    return { isEligible: false, reason: 'player_out_not_on_court' };
  }

  if (
    liberoPlayerIds.has(input.playerOutId)
    || liberoPlayerIds.has(input.playerInId)
    || outgoingRosterPlayer?.isLibero
    || incomingRosterPlayer?.isLibero
  ) {
    return { isEligible: false, reason: 'libero_not_allowed' };
  }

  if (onCourtPlayerIds.has(input.playerInId)) {
    return { isEligible: false, reason: 'player_in_not_on_bench' };
  }

  const pairForIncomingStarter = lineup.personnelState.substitutionPairs.find((pair) => (
    pair.playerOutId === input.playerInId
  ));
  const pairForIncomingSubstitute = lineup.personnelState.substitutionPairs.find((pair) => (
    pair.playerInId === input.playerInId
  ));
  const pairForOutgoingStarter = lineup.personnelState.substitutionPairs.find((pair) => (
    pair.playerOutId === input.playerOutId
  ));
  const pairForOutgoingSubstitute = lineup.personnelState.substitutionPairs.find((pair) => (
    pair.playerInId === input.playerOutId
  ));

  if (pairForOutgoingSubstitute) {
    return {
      isEligible: pairForOutgoingSubstitute.playerOutId === input.playerInId && !pairForOutgoingSubstitute.hasReentered,
      reason: 'reentry_not_allowed',
    };
  }

  if (pairForIncomingStarter) {
    return {
      isEligible: pairForIncomingStarter.playerInId === input.playerOutId && !pairForIncomingStarter.hasReentered,
      reason: 'reentry_not_allowed',
    };
  }

  if (pairForIncomingSubstitute || pairForOutgoingStarter?.hasReentered) {
    return { isEligible: false, reason: 'reentry_not_allowed' };
  }

  return { isEligible: true };
}

export function getEligiblePlayersInForSubstitution(input: {
  lineup: ActiveLineup;
  playerOutId: string;
  rosterPlayers: readonly Player[];
}): Player[] {
  const lineup = normalizeActiveLineup(input.lineup);
  const onCourtPlayerIds = new Set(lineup.personnelState.onCourtPlayerIds);

  return input.rosterPlayers.filter((player) => (
    !onCourtPlayerIds.has(player.id)
    && getNormalSubstitutionEligibility({
      lineup,
      playerOutId: input.playerOutId,
      playerInId: player.id,
      rosterPlayers: input.rosterPlayers,
    }).isEligible
  ));
}

export function buildTimeoutCalledEvent(liveMatch: LiveMatchState, teamSide: TeamSide): MatchEvent {
  return {
    id: createEventId(),
    type: 'timeout_called',
    createdAt: Date.now(),
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide,
  };
}

export function buildSubstitutionMadeEvent(input: {
  liveMatch: LiveMatchState;
  teamSide: TeamSide;
  playerOutId: string;
  playerInId: string;
  canReenterOnlyForPlayerId: string;
  hasReentered: boolean;
}): MatchEvent {
  return {
    id: createEventId(),
    type: 'substitution_made',
    createdAt: Date.now(),
    setNumber: input.liveMatch.currentSetNumber,
    rallyNumber: input.liveMatch.currentRallyNumber,
    teamSide: input.teamSide,
    playerOutId: input.playerOutId,
    playerInId: input.playerInId,
    canReenterOnlyForPlayerId: input.canReenterOnlyForPlayerId,
    hasReentered: input.hasReentered,
  };
}

export function buildRedCardPointEvent(input: {
  liveMatch: LiveMatchState;
  penalizedTeamSide: TeamSide;
}): MatchEvent {
  return {
    id: createEventId(),
    type: 'red_card_point',
    createdAt: Date.now(),
    setNumber: input.liveMatch.currentSetNumber,
    rallyNumber: input.liveMatch.currentRallyNumber,
    teamSide: input.penalizedTeamSide === 'home' ? 'away' : 'home',
    penalizedTeamSide: input.penalizedTeamSide,
    reason: 'red_card',
  };
}

export function buildReplayActionEvent(liveMatch: LiveMatchState, teamSide?: TeamSide): MatchEvent {
  return {
    id: createEventId(),
    type: 'replay_action',
    createdAt: Date.now(),
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide,
    reason: 'replay',
  };
}

export function buildVideoCheckCorrectionEvent(liveMatch: LiveMatchState, touchId?: string, teamSide?: TeamSide): MatchEvent {
  return {
    id: createEventId(),
    type: 'video_check_correction',
    createdAt: Date.now(),
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide,
    reason: 'video_check',
    touchId,
  };
}

export function buildSanctionRecordedEvent(liveMatch: LiveMatchState, teamSide: TeamSide): MatchEvent {
  return {
    id: createEventId(),
    type: 'sanction_recorded',
    createdAt: Date.now(),
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide,
    reason: 'warning',
  };
}

export function buildOtherDeadBallEvent(liveMatch: LiveMatchState, teamSide: TeamSide): MatchEvent {
  return {
    id: createEventId(),
    type: 'dead_ball_event_recorded',
    createdAt: Date.now(),
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide,
    reason: 'other',
  };
}
