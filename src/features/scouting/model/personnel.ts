import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type {
  ActiveLineup,
  ActiveLineupSlot,
  NormalSubstitutionRecord,
  TeamSetPersonnelState,
} from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { PlayerRole } from '@src/domain/systems/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { LiveMatchState } from './index';

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

export type LiberoReplacementAction = Extract<
  MatchEvent,
  { type: 'libero_replacement_made' }
>['action'];

export interface LiberoReplacementProposal {
  teamSide: TeamSide;
  action: LiberoReplacementAction;
  liberoPlayerId: string;
  replacedPlayerId: string;
  replacedPlayerRole?: PlayerRole;
  playerOutId: string;
  playerInId: string;
  reason: 'middle_back_row' | 'front_row_exit' | 'manual';
}

export interface SubstitutionEligibilityResult {
  isEligible: boolean;
  reason?: 'libero_not_allowed' | 'player_out_not_on_court' | 'player_in_not_on_bench' | 'reentry_not_allowed';
}

const BACK_ROW_POSITIONS = new Set<CourtPosition>([1, 5, 6]);
const FRONT_ROW_POSITIONS = new Set<CourtPosition>([2, 3, 4]);
const MIDDLE_ROLES = new Set<PlayerRole>([PlayerRole.MIDDLE_BLOCKER_1, PlayerRole.MIDDLE_BLOCKER_2]);

function createEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function isBackRowPosition(position: CourtPosition): boolean {
  return BACK_ROW_POSITIONS.has(position);
}

export function isFrontRowPosition(position: CourtPosition): boolean {
  return FRONT_ROW_POSITIONS.has(position);
}

export function isMiddleBlockerRole(role: PlayerRole | undefined): boolean {
  return Boolean(role && MIDDLE_ROLES.has(role));
}

function getSlotByPlayerId(lineup: ActiveLineup, playerId: string): ActiveLineupSlot | null {
  return lineup.slots.find((slot) => slot.playerId === playerId) ?? null;
}

function getActiveLiberoSlot(lineup: ActiveLineup): ActiveLineupSlot | null {
  const activeLiberoPlayerId = lineup.personnelState.activeLiberoState?.liberoPlayerId;

  return lineup.slots.find((slot) => (
    slot.isLibero || (activeLiberoPlayerId ? slot.playerId === activeLiberoPlayerId : false)
  )) ?? null;
}

function isRegisteredLiberoPlayer(lineup: ActiveLineup, playerId: string): boolean {
  return new Set([
    ...lineup.liberoPlayerIds,
    lineup.personnelState.liberoPlayerId,
    lineup.personnelState.secondLiberoPlayerId,
  ].filter((id): id is string => Boolean(id))).has(playerId);
}

function uniquePlayerIds(playerIds: readonly string[]): string[] {
  return [...new Set(playerIds.filter(Boolean))];
}

export function normalizePersonnelState(lineup: ActiveLineup): TeamSetPersonnelState {
  const existingPersonnel = lineup.personnelState;
  const onCourtPlayerIds = uniquePlayerIds(lineup.slots.map((slot) => slot.playerId));
  const liberoPlayerIds = lineup.liberoPlayerIds ?? [];
  const benchPlayerIds = uniquePlayerIds([
    ...(existingPersonnel?.benchPlayerIds ?? []),
    ...liberoPlayerIds,
  ]).filter((playerId) => !onCourtPlayerIds.includes(playerId));
  const [liberoPlayerId, secondLiberoPlayerId] = liberoPlayerIds;

  return {
    onCourtPlayerIds,
    benchPlayerIds,
    liberoPlayerId: existingPersonnel?.liberoPlayerId ?? liberoPlayerId,
    secondLiberoPlayerId: existingPersonnel?.secondLiberoPlayerId ?? secondLiberoPlayerId,
    liberoAutoMiddleReplacement: existingPersonnel?.liberoAutoMiddleReplacement ?? true,
    activeLiberoState: existingPersonnel?.activeLiberoState,
    substitutionPairs: existingPersonnel?.substitutionPairs ?? [],
    substitutionHistory: existingPersonnel?.substitutionHistory ?? [],
  };
}

export function normalizeActiveLineup(lineup: ActiveLineup): ActiveLineup {
  return {
    ...lineup,
    liberoPlayerIds: lineup.liberoPlayerIds ?? [],
    personnelState: normalizePersonnelState(lineup),
  };
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
  const liberoPlayerIds = new Set([
    ...lineup.liberoPlayerIds,
    lineup.personnelState.liberoPlayerId,
    lineup.personnelState.secondLiberoPlayerId,
  ].filter((playerId): playerId is string => Boolean(playerId)));
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

export function applyLiberoReplacementToLineup(
  lineup: ActiveLineup,
  event: Extract<MatchEvent, { type: 'libero_replacement_made' }>,
): ActiveLineup | null {
  const normalizedLineup = normalizeActiveLineup(lineup);
  const slot = getSlotByPlayerId(normalizedLineup, event.playerOutId);
  if (!slot) {
    return null;
  }

  const activeLiberoState = normalizedLineup.personnelState.activeLiberoState;
  const isIncomingRegisteredLibero = isRegisteredLiberoPlayer(normalizedLineup, event.playerInId);
  const isOutgoingRegisteredLibero = isRegisteredLiberoPlayer(normalizedLineup, event.playerOutId);

  if (event.action === 'regular_returns') {
    if (
      !activeLiberoState
      || event.playerOutId !== activeLiberoState.liberoPlayerId
      || event.playerInId !== activeLiberoState.replacedPlayerId
      || event.replacedPlayerId !== activeLiberoState.replacedPlayerId
    ) {
      return null;
    }
  } else if (event.action === 'second_libero_enters') {
    if (
      !activeLiberoState
      || !isIncomingRegisteredLibero
      || event.playerOutId !== activeLiberoState.liberoPlayerId
      || event.playerInId === activeLiberoState.liberoPlayerId
      || event.replacedPlayerId !== activeLiberoState.replacedPlayerId
      || !isBackRowPosition(slot.courtPosition)
    ) {
      return null;
    }
  } else if (
    activeLiberoState
    || !isIncomingRegisteredLibero
    || isOutgoingRegisteredLibero
    || event.replacedPlayerId !== event.playerOutId
    || !isBackRowPosition(slot.courtPosition)
  ) {
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
    onCourtPlayerIds: updateOnCourtAfterSwap(normalizedLineup.personnelState, event.playerOutId, event.playerInId),
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
      benchPlayerIds: updateBenchAfterSwap(nextPersonnelBase, event.playerOutId, event.playerInId),
    },
  });
}

export function updateLiberoFrontRowStatus(lineup: ActiveLineup): ActiveLineup {
  const normalizedLineup = normalizeActiveLineup(lineup);
  const activeLiberoState = normalizedLineup.personnelState.activeLiberoState;
  if (!activeLiberoState) {
    return normalizedLineup;
  }

  const liberoSlot = getSlotByPlayerId(normalizedLineup, activeLiberoState.liberoPlayerId);

  return {
    ...normalizedLineup,
    personnelState: {
      ...normalizedLineup.personnelState,
      activeLiberoState: {
        ...activeLiberoState,
        mustExitBeforeFrontRow: liberoSlot ? isFrontRowPosition(liberoSlot.courtPosition) : true,
      },
    },
  };
}

export function getAutomaticLiberoReplacementProposal(
  liveMatch: LiveMatchState,
  teamSide: TeamSide,
): LiberoReplacementProposal | null {
  const lineup = teamSide === 'home' ? liveMatch.homeActiveLineup : liveMatch.awayActiveLineup;
  if (!lineup) {
    return null;
  }

  const normalizedLineup = updateLiberoFrontRowStatus(lineup);
  const personnel = normalizedLineup.personnelState;
  if (!personnel.liberoAutoMiddleReplacement || !personnel.liberoPlayerId) {
    return null;
  }

  const activeLiberoState = personnel.activeLiberoState;
  if (activeLiberoState?.mustExitBeforeFrontRow) {
    const liberoSlot = getActiveLiberoSlot(normalizedLineup);
    if (!liberoSlot) {
      return null;
    }

    return {
      teamSide,
      action: 'regular_returns',
      liberoPlayerId: activeLiberoState.liberoPlayerId,
      replacedPlayerId: activeLiberoState.replacedPlayerId,
      replacedPlayerRole: activeLiberoState.replacedPlayerRole,
      playerOutId: activeLiberoState.liberoPlayerId,
      playerInId: activeLiberoState.replacedPlayerId,
      reason: 'front_row_exit',
    };
  }

  if (activeLiberoState) {
    return null;
  }

  const backRowMiddle = normalizedLineup.slots.find((slot) => (
    isBackRowPosition(slot.courtPosition)
    && !slot.isLibero
    && isMiddleBlockerRole(slot.tacticalRole)
  ));

  if (!backRowMiddle) {
    return null;
  }

  return {
    teamSide,
    action: 'libero_enters',
    liberoPlayerId: personnel.liberoPlayerId,
    replacedPlayerId: backRowMiddle.playerId,
    replacedPlayerRole: backRowMiddle.tacticalRole,
    playerOutId: backRowMiddle.playerId,
    playerInId: personnel.liberoPlayerId,
    reason: 'middle_back_row',
  };
}

export function getManualLiberoReplacementProposals(
  liveMatch: LiveMatchState,
  teamSide: TeamSide,
): LiberoReplacementProposal[] {
  const lineup = teamSide === 'home' ? liveMatch.homeActiveLineup : liveMatch.awayActiveLineup;
  if (!lineup) {
    return [];
  }

  const normalizedLineup = updateLiberoFrontRowStatus(lineup);
  const personnel = normalizedLineup.personnelState;
  const activeLiberoState = personnel.activeLiberoState;

  if (activeLiberoState) {
    const proposals: LiberoReplacementProposal[] = [
      {
        teamSide,
        action: 'regular_returns',
        liberoPlayerId: activeLiberoState.liberoPlayerId,
        replacedPlayerId: activeLiberoState.replacedPlayerId,
        replacedPlayerRole: activeLiberoState.replacedPlayerRole,
        playerOutId: activeLiberoState.liberoPlayerId,
        playerInId: activeLiberoState.replacedPlayerId,
        reason: 'manual',
      },
    ];
    const secondLiberoId = [personnel.liberoPlayerId, personnel.secondLiberoPlayerId]
      .find((playerId) => playerId && playerId !== activeLiberoState.liberoPlayerId);

    if (secondLiberoId) {
      proposals.push({
        teamSide,
        action: 'second_libero_enters',
        liberoPlayerId: secondLiberoId,
        replacedPlayerId: activeLiberoState.replacedPlayerId,
        replacedPlayerRole: activeLiberoState.replacedPlayerRole,
        playerOutId: activeLiberoState.liberoPlayerId,
        playerInId: secondLiberoId,
        reason: 'manual',
      });
    }

    return proposals;
  }

  const liberoPlayerId = personnel.liberoPlayerId;
  if (!liberoPlayerId) {
    return [];
  }

  return normalizedLineup.slots
    .filter((slot) => isBackRowPosition(slot.courtPosition) && !slot.isLibero)
    .map((slot) => ({
      teamSide,
      action: 'libero_enters' as const,
      liberoPlayerId,
      replacedPlayerId: slot.playerId,
      replacedPlayerRole: slot.tacticalRole,
      playerOutId: slot.playerId,
      playerInId: liberoPlayerId,
      reason: 'manual' as const,
    }));
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

export function buildLiberoReplacementMadeEvent(
  liveMatch: LiveMatchState,
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
