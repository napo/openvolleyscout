import type { CourtPosition } from '../common/enums';
import { PlayerRole } from '../systems/types';
import type { ActiveLineup, StartingLineup, TeamSetPersonnelState } from './types';

type InitialLiberoReplacement = {
  liberoPlayerId: string;
  replacedPlayerId: string;
  replacedPlayerRole?: PlayerRole;
};

const BACK_ROW_POSITIONS = new Set<CourtPosition>([1, 5, 6]);
const MIDDLE_ROLES = new Set<PlayerRole>([PlayerRole.MIDDLE_BLOCKER_1, PlayerRole.MIDDLE_BLOCKER_2]);

function uniquePlayerIds(playerIds: readonly string[]): string[] {
  return [...new Set(playerIds.filter(Boolean))];
}

function getInitialLiberoReplacement(startingLineup: StartingLineup): InitialLiberoReplacement | null {
  const liberoPlayerId = startingLineup.liberoPlayerIds?.[0];
  if (!liberoPlayerId || !(startingLineup.liberoAutoMiddleReplacement ?? true)) {
    return null;
  }

  const replacedSlot = startingLineup.slots.find((slot) => (
    BACK_ROW_POSITIONS.has(slot.courtPosition)
    && Boolean(slot.playerId)
    && Boolean(slot.tacticalRole && MIDDLE_ROLES.has(slot.tacticalRole))
  ));

  if (!replacedSlot) {
    return null;
  }

  return {
    liberoPlayerId,
    replacedPlayerId: replacedSlot.playerId,
    replacedPlayerRole: replacedSlot.tacticalRole,
  };
}

function createTeamSetPersonnelState(
  startingLineup: StartingLineup,
  initialLiberoReplacement: InitialLiberoReplacement | null,
): TeamSetPersonnelState {
  const onCourtPlayerIds = startingLineup.slots.map((slot) => slot.playerId).filter(Boolean);
  const liberoPlayerIds = startingLineup.liberoPlayerIds ?? [];
  const activeOnCourtPlayerIds = initialLiberoReplacement
    ? uniquePlayerIds(onCourtPlayerIds.map((playerId) => (
      playerId === initialLiberoReplacement.replacedPlayerId
        ? initialLiberoReplacement.liberoPlayerId
        : playerId
    )))
    : onCourtPlayerIds;
  const benchPlayerIds = (startingLineup.benchPlayerIds ?? [])
    .filter((playerId) => playerId && !activeOnCourtPlayerIds.includes(playerId));
  const activeBenchPlayerIds = initialLiberoReplacement
    ? uniquePlayerIds([
      ...benchPlayerIds.filter((playerId) => playerId !== initialLiberoReplacement.liberoPlayerId),
      initialLiberoReplacement.replacedPlayerId,
    ])
    : benchPlayerIds;
  const [liberoPlayerId, secondLiberoPlayerId] = liberoPlayerIds;

  return {
    onCourtPlayerIds: activeOnCourtPlayerIds,
    benchPlayerIds: activeBenchPlayerIds,
    liberoPlayerId,
    secondLiberoPlayerId,
    liberoAutoMiddleReplacement: startingLineup.liberoAutoMiddleReplacement ?? true,
    activeLiberoState: initialLiberoReplacement
      ? {
          liberoPlayerId: initialLiberoReplacement.liberoPlayerId,
          replacedPlayerId: initialLiberoReplacement.replacedPlayerId,
          replacedPlayerRole: initialLiberoReplacement.replacedPlayerRole,
          teamSide: startingLineup.teamSide,
          enteredAtRallyNumber: 1,
          mustExitBeforeFrontRow: false,
        }
      : undefined,
    substitutionPairs: [],
    substitutionHistory: [],
  };
}

export function createActiveLineup(startingLineup: StartingLineup): ActiveLineup {
  const initialLiberoReplacement = getInitialLiberoReplacement(startingLineup);

  return {
    teamSide: startingLineup.teamSide,
    setterPlayerId: startingLineup.setterPlayerId,
    liberoPlayerIds: startingLineup.liberoPlayerIds ?? [],
    slots: startingLineup.slots.map((slot) => {
      if (slot.playerId !== initialLiberoReplacement?.replacedPlayerId) {
        return {
          courtPosition: slot.courtPosition,
          playerId: slot.playerId,
          tacticalRole: slot.tacticalRole,
        };
      }

      return {
        courtPosition: slot.courtPosition,
        playerId: initialLiberoReplacement.liberoPlayerId,
        tacticalRole: initialLiberoReplacement.replacedPlayerRole ?? slot.tacticalRole,
        isLibero: true,
        replacedPlayerId: initialLiberoReplacement.replacedPlayerId,
      };
    }),
    personnelState: createTeamSetPersonnelState(startingLineup, initialLiberoReplacement),
  };
}
