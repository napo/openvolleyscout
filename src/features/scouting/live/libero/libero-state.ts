import type { ActiveLineup, TeamSetPersonnelState } from '@src/domain/lineup/types';
import type { MatchEvent } from '@src/domain/events/types';
import {
  getSlotByPlayerId,
  isFrontRowPosition,
} from './libero-rules';

export function uniquePlayerIds(playerIds: readonly string[]): string[] {
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
    lastLiberoReplacementRallyNumber: existingPersonnel?.lastLiberoReplacementRallyNumber,
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

export function updateBenchAfterLiberoSwap(
  personnel: TeamSetPersonnelState,
  playerOutId: string,
  playerInId: string,
) {
  return uniquePlayerIds([
    ...personnel.benchPlayerIds.filter((playerId) => playerId !== playerInId),
    playerOutId,
  ]).filter((playerId) => playerId && !personnel.onCourtPlayerIds.includes(playerId));
}

export function updateOnCourtAfterLiberoSwap(
  personnel: TeamSetPersonnelState,
  playerOutId: string,
  playerInId: string,
) {
  return uniquePlayerIds(personnel.onCourtPlayerIds.map((playerId) => (
    playerId === playerOutId ? playerInId : playerId
  )));
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

export function getLastLiberoReplacementRallyNumber(lineup: ActiveLineup): number | undefined {
  return normalizeActiveLineup(lineup).personnelState.lastLiberoReplacementRallyNumber;
}

export function hasCompletedRallySinceLastLiberoReplacement(
  lineup: ActiveLineup,
  rallyNumber: number,
): boolean {
  const lastRallyNumber = getLastLiberoReplacementRallyNumber(lineup);

  return lastRallyNumber === undefined || rallyNumber > lastRallyNumber;
}

export function getLiberoReplacementRallyNumber(
  event: Extract<MatchEvent, { type: 'libero_replacement_made' }>,
): number {
  return event.rallyNumber;
}

