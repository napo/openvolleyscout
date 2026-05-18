import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLiberoState, ActiveLineup, ActiveLineupSlot } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { FRONT_ROW_POSITIONS, isFrontRowPosition } from '../../libero';

export function getActiveLiberoStateForTeam(
  lineup: ActiveLineup | null | undefined,
  teamSide: TeamSide,
): ActiveLiberoState | null {
  const activeLiberoState = lineup?.personnelState.activeLiberoState;

  return activeLiberoState?.teamSide === teamSide ? activeLiberoState : null;
}

export function createLineupForBaseRoleResolution(
  lineup: ActiveLineup,
  activeLiberoState: ActiveLiberoState | null,
): ActiveLineup {
  if (!activeLiberoState) {
    return lineup;
  }

  return {
    ...lineup,
    slots: lineup.slots.map((slot) => (
      slot.playerId === activeLiberoState.liberoPlayerId
        || slot.replacedPlayerId === activeLiberoState.replacedPlayerId
        ? {
            ...slot,
            playerId: activeLiberoState.replacedPlayerId,
            tacticalRole: activeLiberoState.replacedPlayerRole ?? slot.tacticalRole,
            isLibero: false,
            replacedPlayerId: undefined,
          }
        : slot
    )),
  };
}

export function resolveLiberoDisplayPlayer({
  rolePlayer,
  activeLiberoState,
  playerById,
  forceRegularPlayer,
}: {
  rolePlayer: Player;
  activeLiberoState: ActiveLiberoState | null;
  playerById: ReadonlyMap<string, Player>;
  forceRegularPlayer: boolean;
}): {
  displayPlayer: Player;
  isLibero: boolean;
  replacedPlayerId?: string;
} {
  if (activeLiberoState && rolePlayer.id === activeLiberoState.replacedPlayerId) {
    if (forceRegularPlayer) {
      return {
        displayPlayer: rolePlayer,
        isLibero: false,
      };
    }

    const liberoPlayer = playerById.get(activeLiberoState.liberoPlayerId);

    if (liberoPlayer) {
      return {
        displayPlayer: liberoPlayer,
        isLibero: true,
        replacedPlayerId: activeLiberoState.replacedPlayerId,
      };
    }
  }

  return {
    displayPlayer: rolePlayer,
    isLibero: !forceRegularPlayer && activeLiberoState?.liberoPlayerId === rolePlayer.id,
    replacedPlayerId: !forceRegularPlayer && rolePlayer.id === activeLiberoState?.liberoPlayerId
      ? activeLiberoState.replacedPlayerId
      : undefined,
  };
}

export function resolveSlotDisplayPlayer({
  slot,
  player,
  activeLiberoState,
  playerById,
  forceRegularPlayer,
}: {
  slot: ActiveLineupSlot;
  player: Player | undefined;
  activeLiberoState: ActiveLiberoState | null;
  playerById: ReadonlyMap<string, Player>;
  forceRegularPlayer: boolean;
}): {
  displayPlayer: Player | undefined;
  displayPlayerId: string;
  isLibero: boolean;
  replacedPlayerId?: string;
} {
  const isActiveLiberoSlot = Boolean(activeLiberoState && (
    slot.playerId === activeLiberoState.liberoPlayerId
      || slot.playerId === activeLiberoState.replacedPlayerId
      || slot.replacedPlayerId === activeLiberoState.replacedPlayerId
  ));

  if (activeLiberoState && isActiveLiberoSlot) {
    if (forceRegularPlayer) {
      const replacedPlayer = playerById.get(activeLiberoState.replacedPlayerId);

      return {
        displayPlayer: replacedPlayer ?? player,
        displayPlayerId: replacedPlayer?.id ?? player?.id ?? activeLiberoState.replacedPlayerId,
        isLibero: false,
      };
    }

    const liberoPlayer = playerById.get(activeLiberoState.liberoPlayerId);

    return {
      displayPlayer: liberoPlayer ?? player,
      displayPlayerId: liberoPlayer?.id ?? player?.id ?? slot.playerId,
      isLibero: Boolean(liberoPlayer),
      replacedPlayerId: activeLiberoState.replacedPlayerId,
    };
  }

  if (slot.isLibero && slot.replacedPlayerId && isFrontRowPosition(slot.courtPosition)) {
    const replacedPlayer = playerById.get(slot.replacedPlayerId);

    return {
      displayPlayer: replacedPlayer ?? player,
      displayPlayerId: replacedPlayer?.id ?? slot.replacedPlayerId,
      isLibero: false,
    };
  }

  return {
    displayPlayer: player,
    displayPlayerId: player?.id ?? slot.playerId,
    isLibero: Boolean(slot.isLibero),
    replacedPlayerId: slot.replacedPlayerId,
  };
}

export function isActiveLiberoForcedOutOfFrontRow(
  slots: readonly ActiveLineupSlot[],
  activeLiberoState: ActiveLiberoState | null,
): boolean {
  if (!activeLiberoState) {
    return false;
  }

  const liberoSlot = slots.find((slot) => (
    slot.playerId === activeLiberoState.liberoPlayerId
    || slot.replacedPlayerId === activeLiberoState.replacedPlayerId
  ));

  return Boolean(
    activeLiberoState.mustExitBeforeFrontRow
    || (liberoSlot && isFrontRowPosition(liberoSlot.courtPosition)),
  );
}

export { FRONT_ROW_POSITIONS };
