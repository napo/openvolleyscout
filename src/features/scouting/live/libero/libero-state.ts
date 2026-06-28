import type { ActiveLineup, TeamSetPersonnelState } from '@src/domain/lineup/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { TeamSide } from '@src/domain/common/enums';
import {
  getActiveLiberoSlot,
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

function replaceActiveLiberoWithRegularPlayer(lineup: ActiveLineup): ActiveLineup {
  const normalizedLineup = normalizeActiveLineup(lineup);
  const activeLiberoState = normalizedLineup.personnelState.activeLiberoState;
  if (!activeLiberoState) {
    return normalizedLineup;
  }

  const liberoSlot = getSlotByPlayerId(normalizedLineup, activeLiberoState.liberoPlayerId);
  const replacedPlayerId = activeLiberoState.replacedPlayerId;
  if (!liberoSlot || !replacedPlayerId) {
    return normalizedLineup;
  }

  const restoredSlots = normalizedLineup.slots.map((slot) => {
    if (slot.playerId === activeLiberoState.liberoPlayerId && slot.courtPosition === liberoSlot.courtPosition) {
      return {
        ...slot,
        playerId: replacedPlayerId,
        isLibero: false,
        replacedPlayerId: undefined,
      };
    }

    return slot;
  });

  const updatedOnCourtPlayerIds = updateOnCourtAfterLiberoSwap(
    normalizedLineup.personnelState,
    activeLiberoState.liberoPlayerId,
    replacedPlayerId,
  );

  return {
    ...normalizedLineup,
    slots: restoredSlots,
    personnelState: {
      ...normalizedLineup.personnelState,
      onCourtPlayerIds: updatedOnCourtPlayerIds,
      benchPlayerIds: updateBenchAfterLiberoSwap(
        normalizedLineup.personnelState,
        activeLiberoState.liberoPlayerId,
        replacedPlayerId,
      ).filter((playerId) => !updatedOnCourtPlayerIds.includes(playerId)),
      activeLiberoState: undefined,
    },
  };
}

function isActiveLiberoPerformingIllegalService(
  lineup: ActiveLineup,
  servingTeam: TeamSide | null | undefined,
): boolean {
  if (servingTeam !== lineup.teamSide) {
    return false;
  }

  const liberoSlot = getActiveLiberoSlot(lineup);
  return Boolean(liberoSlot && liberoSlot.courtPosition === 1);
}

export function legalizeActiveLineup(
  lineup: ActiveLineup,
  servingTeam: TeamSide | null | undefined,
): ActiveLineup {
  const normalizedLineup = normalizeActiveLineup(lineup);
  const activeLiberoState = normalizedLineup.personnelState.activeLiberoState;
  if (!activeLiberoState) {
    return normalizedLineup;
  }

  const liberoSlot = getSlotByPlayerId(normalizedLineup, activeLiberoState.liberoPlayerId);
  const isFrontRow = liberoSlot ? isFrontRowPosition(liberoSlot.courtPosition) : false;
  const isIllegalService = isActiveLiberoPerformingIllegalService(normalizedLineup, servingTeam);

  if (!isFrontRow && !isIllegalService) {
    return normalizedLineup;
  }

  console.warn('[OpenVolleyScout] Illegal libero placement repaired during lineup normalization', {
    teamSide: normalizedLineup.teamSide,
    liberoPlayerId: activeLiberoState.liberoPlayerId,
    replacedPlayerId: activeLiberoState.replacedPlayerId,
    courtPosition: liberoSlot?.courtPosition,
    isFrontRow,
    isIllegalService,
  });

  return replaceActiveLiberoWithRegularPlayer(normalizedLineup);
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

  if (activeLiberoState) {
    const liberoSlot = getSlotByPlayerId(normalizedLineup, activeLiberoState.liberoPlayerId);
    const isInFrontRow = liberoSlot ? isFrontRowPosition(liberoSlot.courtPosition) : false;

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

  const slotLibero = normalizedLineup.slots.find((slot) => slot.isLibero && slot.replacedPlayerId);
  if (slotLibero && isFrontRowPosition(slotLibero.courtPosition)) {
    return {
      ...normalizedLineup,
      slots: normalizedLineup.slots.map((slot) => (
        slot === slotLibero
          ? { ...slot, playerId: slot.replacedPlayerId!, isLibero: false, replacedPlayerId: undefined }
          : slot
      )),
    };
  }

  return normalizedLineup;
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

