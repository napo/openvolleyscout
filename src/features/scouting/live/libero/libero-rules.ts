import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup, ActiveLineupSlot } from '@src/domain/lineup/types';
import { PlayerRole } from '@src/domain/systems/types';
import type { MatchEvent } from '@src/domain/events/types';

export type LiberoReplacementAction = Extract<
  MatchEvent,
  { type: 'libero_replacement_made' }
>['action'];

export type LiberoReplacementReason =
  | 'middle_back_row'
  | 'front_row_exit'
  | 'service_exit'
  | 'manual'
  | 'illegal_state';

export interface LiberoReplacementProposal {
  teamSide: TeamSide;
  action: LiberoReplacementAction;
  liberoPlayerId: string;
  replacedPlayerId: string;
  replacedPlayerRole?: PlayerRole;
  playerOutId: string;
  playerInId: string;
  reason: LiberoReplacementReason;
}

export const BACK_ROW_POSITIONS = new Set<CourtPosition>([1, 5, 6]);
export const FRONT_ROW_POSITIONS = new Set<CourtPosition>([2, 3, 4]);
export const MIDDLE_ROLES = new Set<PlayerRole>([PlayerRole.MIDDLE_BLOCKER_1, PlayerRole.MIDDLE_BLOCKER_2]);

export function isBackRowPosition(position: CourtPosition): boolean {
  return BACK_ROW_POSITIONS.has(position);
}

export function isFrontRowPosition(position: CourtPosition): boolean {
  return FRONT_ROW_POSITIONS.has(position);
}

export function isMiddleBlockerRole(role: PlayerRole | undefined): boolean {
  return Boolean(role && MIDDLE_ROLES.has(role));
}

export function getSlotByPlayerId(lineup: ActiveLineup, playerId: string): ActiveLineupSlot | null {
  return lineup.slots.find((slot) => slot.playerId === playerId) ?? null;
}

export function getActiveLiberoSlot(lineup: ActiveLineup): ActiveLineupSlot | null {
  const activeLiberoPlayerId = lineup.personnelState.activeLiberoState?.liberoPlayerId;

  return lineup.slots.find((slot) => (
    slot.isLibero || (activeLiberoPlayerId ? slot.playerId === activeLiberoPlayerId : false)
  )) ?? null;
}

export function getRegisteredLiberoPlayerIds(lineup: ActiveLineup): Set<string> {
  return new Set([
    ...lineup.liberoPlayerIds,
    lineup.personnelState.liberoPlayerId,
    lineup.personnelState.secondLiberoPlayerId,
  ].filter((id): id is string => Boolean(id)));
}

export function isRegisteredLiberoPlayer(lineup: ActiveLineup, playerId: string): boolean {
  return getRegisteredLiberoPlayerIds(lineup).has(playerId);
}

export function getLineupForTeamSide(
  lineups: {
    homeActiveLineup: ActiveLineup | null;
    awayActiveLineup: ActiveLineup | null;
  },
  teamSide: TeamSide,
): ActiveLineup | null {
  return teamSide === 'home' ? lineups.homeActiveLineup : lineups.awayActiveLineup;
}

