import type { SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchEvent } from '@src/domain/events/types';
import {
  getActiveLiberoSlot,
  getLineupForTeamSide,
  getSlotByPlayerId,
  isBackRowPosition,
  isRegisteredLiberoPlayer,
} from './libero-rules';
import { hasCompletedRallySinceLastLiberoReplacement, normalizeActiveLineup } from './libero-state';

export type LiberoReplacementViolation =
  | 'no_player_out_slot'
  | 'libero_replacement_too_soon'
  | 'active_libero_required'
  | 'incoming_must_be_registered_libero'
  | 'outgoing_must_be_active_libero'
  | 'incoming_must_be_different_libero'
  | 'replacement_pair_mismatch'
  | 'replacement_target_must_be_back_row'
  | 'active_libero_already_on_court'
  | 'incoming_regular_must_not_be_libero'
  | 'outgoing_regular_must_not_be_libero';

export type LiberoTouchViolation =
  | 'libero_illegal_serve'
  | 'libero_illegal_block'
  | 'libero_illegal_attack';

export interface LiberoTouchValidationResult {
  isValid: boolean;
  violation?: LiberoTouchViolation;
}

export function getLiberoReplacementViolation(
  lineup: ActiveLineup,
  event: Extract<MatchEvent, { type: 'libero_replacement_made' }>,
): LiberoReplacementViolation | null {
  const normalizedLineup = normalizeActiveLineup(lineup);
  const slot = getSlotByPlayerId(normalizedLineup, event.playerOutId);
  if (!slot) {
    return 'no_player_out_slot';
  }

  if (!hasCompletedRallySinceLastLiberoReplacement(normalizedLineup, event.rallyNumber)) {
    return 'libero_replacement_too_soon';
  }

  const activeLiberoState = normalizedLineup.personnelState.activeLiberoState;
  const isIncomingRegisteredLibero = isRegisteredLiberoPlayer(normalizedLineup, event.playerInId);
  const isOutgoingRegisteredLibero = isRegisteredLiberoPlayer(normalizedLineup, event.playerOutId);

  if (event.action === 'regular_returns') {
    if (!activeLiberoState) {
      return 'active_libero_required';
    }

    if (event.playerOutId !== activeLiberoState.liberoPlayerId) {
      return 'outgoing_must_be_active_libero';
    }

    if (
      event.playerInId !== activeLiberoState.replacedPlayerId
      || event.replacedPlayerId !== activeLiberoState.replacedPlayerId
    ) {
      return 'replacement_pair_mismatch';
    }

    return null;
  }

  if (event.action === 'second_libero_enters') {
    if (!activeLiberoState) {
      return 'active_libero_required';
    }

    if (!isIncomingRegisteredLibero) {
      return 'incoming_must_be_registered_libero';
    }

    if (event.playerOutId !== activeLiberoState.liberoPlayerId) {
      return 'outgoing_must_be_active_libero';
    }

    if (event.playerInId === activeLiberoState.liberoPlayerId) {
      return 'incoming_must_be_different_libero';
    }

    if (event.replacedPlayerId !== activeLiberoState.replacedPlayerId) {
      return 'replacement_pair_mismatch';
    }

    if (!isBackRowPosition(slot.courtPosition)) {
      return 'replacement_target_must_be_back_row';
    }

    return null;
  }

  if (activeLiberoState) {
    return 'active_libero_already_on_court';
  }

  if (!isIncomingRegisteredLibero) {
    return 'incoming_must_be_registered_libero';
  }

  if (isOutgoingRegisteredLibero) {
    return 'outgoing_regular_must_not_be_libero';
  }

  if (event.replacedPlayerId !== event.playerOutId) {
    return 'replacement_pair_mismatch';
  }

  if (!isBackRowPosition(slot.courtPosition)) {
    return 'replacement_target_must_be_back_row';
  }

  return null;
}

export function getActiveLiberoPlayerId(lineup: ActiveLineup | null | undefined): string | null {
  return lineup?.personnelState.activeLiberoState?.liberoPlayerId ?? null;
}

export function isActiveLiberoPlayer(
  lineup: ActiveLineup | null | undefined,
  playerId: string | null | undefined,
): boolean {
  if (!lineup || !playerId) {
    return false;
  }

  return getActiveLiberoPlayerId(lineup) === playerId;
}

export function validateLiberoTouch(input: {
  lineups: {
    homeActiveLineup: ActiveLineup | null;
    awayActiveLineup: ActiveLineup | null;
  };
  teamSide: TeamSide;
  playerId?: string;
  skill: SkillType;
  allowLiberoServe?: boolean;
}): LiberoTouchValidationResult {
  const lineup = getLineupForTeamSide(input.lineups, input.teamSide);
  if (!isActiveLiberoPlayer(lineup, input.playerId)) {
    return { isValid: true };
  }

  if (input.skill === 'serve' && !input.allowLiberoServe) {
    return { isValid: false, violation: 'libero_illegal_serve' };
  }

  if (input.skill === 'block') {
    return { isValid: false, violation: 'libero_illegal_block' };
  }

  if (input.skill === 'attack') {
    return { isValid: false, violation: 'libero_illegal_attack' };
  }

  return { isValid: true };
}

function getPlayerTeam(input: { homeTeam: Team; awayTeam: Team }, teamSide: TeamSide): Team {
  return teamSide === 'home' ? input.homeTeam : input.awayTeam;
}

function isRosterLibero(input: {
  homeTeam: Team;
  awayTeam: Team;
  touch: Pick<BallTouch, 'teamSide' | 'playerId'>;
}): boolean {
  if (!input.touch.playerId) {
    return false;
  }

  return Boolean(
    getPlayerTeam(input, input.touch.teamSide).players.find((player) => (
      player.id === input.touch.playerId && player.isLibero
    )),
  );
}

export function getIllegalLiberoStatsViolation(input: {
  homeTeam: Team;
  awayTeam: Team;
  touch: BallTouch;
  allowLiberoServe?: boolean;
}): LiberoTouchViolation | null {
  if (!isRosterLibero(input)) {
    return null;
  }

  if (input.touch.skill === 'serve' && !input.allowLiberoServe) {
    return 'libero_illegal_serve';
  }

  if (input.touch.skill === 'block') {
    return 'libero_illegal_block';
  }

  if (input.touch.skill === 'attack') {
    return 'libero_illegal_attack';
  }

  return null;
}

export function isIllegalLiberoStatsTouch(input: {
  homeTeam: Team;
  awayTeam: Team;
  touch: BallTouch;
  allowLiberoServe?: boolean;
}): boolean {
  return getIllegalLiberoStatsViolation(input) !== null;
}

export function isActiveLiberoServing(input: {
  lineup: ActiveLineup;
  servingTeam: TeamSide | null | undefined;
  teamSide: TeamSide;
  allowLiberoServe?: boolean;
}): boolean {
  if (input.allowLiberoServe || input.servingTeam !== input.teamSide) {
    return false;
  }

  const liberoSlot = getActiveLiberoSlot(input.lineup);

  return Boolean(liberoSlot && liberoSlot.courtPosition === 1);
}

