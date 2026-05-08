import type { CourtPosition } from '@src/domain/common/enums';
import type { ActiveLineup, ActiveLineupSlot, LineupSlot } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { PlayerRole } from '@src/domain/systems/types';

type RoleMappableLineupSlot = Pick<LineupSlot | ActiveLineupSlot, 'courtPosition' | 'playerId' | 'tacticalRole'>;

const COURT_POSITIONS: CourtPosition[] = [1, 2, 3, 4, 5, 6];
const SIDE_OUT_ROTATION_ORDER: CourtPosition[] = [1, 6, 5, 4, 3, 2];

function getRoleInitialCourtPosition(roleSequence: readonly PlayerRole[], role: PlayerRole): CourtPosition | null {
  const roleIndex = roleSequence.indexOf(role);

  return COURT_POSITIONS[roleIndex] ?? null;
}

function getRotationDistance(from: CourtPosition, to: CourtPosition): number {
  let current = from;

  for (let distance = 0; distance < SIDE_OUT_ROTATION_ORDER.length; distance += 1) {
    if (current === to) {
      return distance;
    }

    const currentIndex = SIDE_OUT_ROTATION_ORDER.indexOf(current);
    current = SIDE_OUT_ROTATION_ORDER[(currentIndex + 1) % SIDE_OUT_ROTATION_ORDER.length];
  }

  return 0;
}

function rotateCourtPosition(position: CourtPosition, rotationDistance: number): CourtPosition {
  let current = position;

  for (let step = 0; step < rotationDistance; step += 1) {
    const currentIndex = SIDE_OUT_ROTATION_ORDER.indexOf(current);
    current = SIDE_OUT_ROTATION_ORDER[(currentIndex + 1) % SIDE_OUT_ROTATION_ORDER.length];
  }

  return current;
}

function isPlayerRole(value: unknown): value is PlayerRole {
  return Object.values(PlayerRole).includes(value as PlayerRole);
}

function mapExplicitRolesToPlayers({
  lineupSlots,
  teamPlayers,
}: {
  lineupSlots: readonly RoleMappableLineupSlot[];
  teamPlayers: readonly Player[];
}): Map<PlayerRole, Player> {
  const playerById = new Map(teamPlayers.map((player) => [player.id, player]));
  const mappedRoles = new Map<PlayerRole, Player>();

  lineupSlots.forEach((slot) => {
    if (!isPlayerRole(slot.tacticalRole) || mappedRoles.has(slot.tacticalRole)) {
      return;
    }

    const player = playerById.get(slot.playerId);
    if (player) {
      mappedRoles.set(slot.tacticalRole, player);
    }
  });

  return mappedRoles;
}

export function mapRolesToPlayers({
  roleSequence,
  lineupSlots,
  teamPlayers,
}: {
  roleSequence: readonly PlayerRole[];
  lineupSlots: readonly RoleMappableLineupSlot[];
  teamPlayers: readonly Player[];
}): Map<PlayerRole, Player> {
  const playerById = new Map(teamPlayers.map((player) => [player.id, player]));
  const sortedSlots = [...lineupSlots].sort((left, right) => left.courtPosition - right.courtPosition);
  const mappedRoles = mapExplicitRolesToPlayers({ lineupSlots, teamPlayers });

  roleSequence.forEach((role, index) => {
    if (mappedRoles.has(role)) {
      return;
    }

    // Backward compatibility only: old saved lineups may not have tacticalRole yet.
    const slot = sortedSlots[index];
    const player = slot ? playerById.get(slot.playerId) : undefined;

    if (player) {
      mappedRoles.set(role, player);
    }
  });

  return mappedRoles;
}

export function getCurrentSetterRotation(
  lineup: ActiveLineup | null | undefined,
  roleSequence: readonly PlayerRole[],
): CourtPosition {
  const setterSlot = lineup?.setterPlayerId
    ? lineup.slots.find((slot) => slot.playerId === lineup.setterPlayerId)
    : null;

  if (setterSlot) {
    return setterSlot.courtPosition;
  }

  if (lineup?.rotationIndex) {
    return lineup.rotationIndex;
  }

  return getRoleInitialCourtPosition(roleSequence, PlayerRole.SETTER) ?? 1;
}

export function getRoleCourtPositionForCurrentRotation({
  role,
  roleSequence,
  setterRotation,
}: {
  role: PlayerRole;
  roleSequence: readonly PlayerRole[];
  setterRotation: CourtPosition;
}): CourtPosition | null {
  const setterInitialPosition = getRoleInitialCourtPosition(roleSequence, PlayerRole.SETTER) ?? 1;
  const roleInitialPosition = getRoleInitialCourtPosition(roleSequence, role);

  if (!roleInitialPosition) {
    return null;
  }

  return rotateCourtPosition(roleInitialPosition, getRotationDistance(setterInitialPosition, setterRotation));
}

export function getTeamRolePlayerMap({
  roleSequence,
  lineup,
  teamPlayers,
}: {
  roleSequence: readonly PlayerRole[];
  lineup: ActiveLineup | null | undefined;
  teamPlayers: readonly Player[];
}): Map<PlayerRole, Player> {
  if (!lineup?.slots.length) {
    return mapRolesToPlayers({
      roleSequence,
      lineupSlots: [],
      teamPlayers,
    });
  }

  const setterRotation = getCurrentSetterRotation(lineup, roleSequence);
  const explicitRoleMap = mapExplicitRolesToPlayers({
    lineupSlots: lineup.slots,
    teamPlayers,
  });

  if (explicitRoleMap.size === roleSequence.length) {
    return explicitRoleMap;
  }

  const slotByCurrentPosition = new Map(lineup.slots.map((slot) => [slot.courtPosition, slot]));
  const roleAlignedSlots = roleSequence
    .map((role, index): RoleMappableLineupSlot | null => {
      const currentCourtPosition = getRoleCourtPositionForCurrentRotation({
        role,
        roleSequence,
        setterRotation,
      });
      const currentSlot = currentCourtPosition ? slotByCurrentPosition.get(currentCourtPosition) : null;
      const initialCourtPosition = COURT_POSITIONS[index];

      return currentSlot && initialCourtPosition
        ? {
            courtPosition: initialCourtPosition,
            playerId: currentSlot.playerId,
            tacticalRole: currentSlot.tacticalRole,
          }
        : null;
    })
    .filter((slot): slot is RoleMappableLineupSlot => Boolean(slot));

  return mapRolesToPlayers({
    roleSequence,
    lineupSlots: roleAlignedSlots,
    teamPlayers,
  });
}
