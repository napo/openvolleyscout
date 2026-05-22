import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import type { ScoutingPoint, ScoutingZone } from '@src/domain/spatial';
import {
  PlayerRole,
  type DefensePosition,
  type DefenseRotation,
  type DefenseSystemBlock,
  type ReceptionPosition,
  type ReceptionRotation,
  type ReceptionSystemBlock,
} from '@src/domain/systems';
import {
  isSetterReleasePhase,
  getSetterReleaseCoordinate,
} from './tactical-setter-layout';
import {
  createFallbackSlots,
  getPlayerJerseyNumber,
  getRoleSequence,
  getRoleSlot,
} from './tactical-formation';
import {
  getCurrentSetterRotation,
  getTeamRolePlayerMap,
} from './tactical-role-mapping';
import {
  CourtDisplaySide,
  getCourtPositionCoordinate,
  getServingPlayerServeCoordinate,
  getSystemPositionCoordinate,
  mapHalfCourtSystemPointToLiveCourt,
} from './court-coordinates';
import {
  createLineupForBaseRoleResolution,
  getActiveLiberoStateForTeam,
  isActiveLiberoForcedOutOfFrontRow,
  resolveLiberoDisplayPlayer,
  resolveSlotDisplayPlayer,
} from './tactical-libero-layout';
import { getDefenseLayoutPositions } from './tactical-defense-layout';
import { getReceptionLayoutPositions } from './tactical-reception-layout';
import { usesReceptionLayout, type TeamTacticalPhase } from '../tactical-transition';
import { getTeamScopedPlayerKey } from '../player-identity';

export type TacticalCourtPlayer = ScoutingPoint & {
  id: string;
  playerId: string;
  courtPosition: CourtPosition;
  jerseyNumber: number | string;
  role?: PlayerRole;
  isLibero?: boolean;
  isSetter?: boolean;
  replacedPlayerId?: string;
  replacedPlayerJerseyNumber?: number | string;
};

export type TacticalSystemPosition = DefensePosition | ReceptionPosition;

export const EXPECTED_COURT_MARKER_COUNT = 6;
const COURT_POSITIONS: CourtPosition[] = [1, 2, 3, 4, 5, 6];

function trackPositionedPlayer(
  positionedPlayerIds: Set<string>,
  teamSide: TeamSide,
  playerId: string,
  replacedPlayerId?: string,
) {
  positionedPlayerIds.add(getTeamScopedPlayerKey(teamSide, playerId));

  if (replacedPlayerId) {
    positionedPlayerIds.add(getTeamScopedPlayerKey(teamSide, replacedPlayerId));
  }
}

type LegalLineupMarker = {
  slot: ActiveLineup['slots'][number];
  playerId: string;
  jerseyNumber: number | string;
  isLibero: boolean;
  isSetter: boolean;
  replacedPlayerId?: string;
  replacedPlayerJerseyNumber?: number | string;
};

function rebuildMarkerIndexes(teamSide: TeamSide, markers: readonly TacticalCourtPlayer[]) {
  const playerIndexById = new Map<string, number>();
  const replacementIndexByReplacedPlayerId = new Map<string, number>();

  markers.forEach((marker, index) => {
    playerIndexById.set(getTeamScopedPlayerKey(teamSide, marker.playerId), index);

    if (marker.replacedPlayerId) {
      replacementIndexByReplacedPlayerId.set(getTeamScopedPlayerKey(teamSide, marker.replacedPlayerId), index);
    }
  });

  return {
    playerIndexById,
    replacementIndexByReplacedPlayerId,
  };
}

function dedupeTacticalCourtPlayers(teamSide: TeamSide, markers: readonly TacticalCourtPlayer[]): TacticalCourtPlayer[] {
  return markers.reduce<TacticalCourtPlayer[]>((dedupedMarkers, marker) => {
    const { playerIndexById, replacementIndexByReplacedPlayerId } = rebuildMarkerIndexes(teamSide, dedupedMarkers);
    const markerPlayerKey = getTeamScopedPlayerKey(teamSide, marker.playerId);
    const replacedPlayerKey = marker.replacedPlayerId
      ? getTeamScopedPlayerKey(teamSide, marker.replacedPlayerId)
      : null;

    if (playerIndexById.has(markerPlayerKey)) {
      return dedupedMarkers;
    }

    if (replacementIndexByReplacedPlayerId.has(markerPlayerKey)) {
      return dedupedMarkers;
    }

    if (replacedPlayerKey && replacementIndexByReplacedPlayerId.has(replacedPlayerKey)) {
      return dedupedMarkers;
    }

    if (!marker.replacedPlayerId) {
      return [...dedupedMarkers, marker];
    }

    return [
      ...dedupedMarkers.filter((existingMarker) => (
        getTeamScopedPlayerKey(teamSide, existingMarker.playerId) !== replacedPlayerKey
      )),
      marker,
    ];
  }, []);
}

function getLegalLineupMarkers({
  slots,
  teamSide,
  teamPlayers,
  playerById,
  activeLiberoState,
  forceRegularPlayerForLiberoFrontRow,
}: {
  slots: readonly ActiveLineup['slots'][number][];
  teamSide: TeamSide;
  teamPlayers: readonly Player[];
  playerById: ReadonlyMap<string, Player>;
  activeLiberoState: ReturnType<typeof getActiveLiberoStateForTeam>;
  forceRegularPlayerForLiberoFrontRow: boolean;
}): LegalLineupMarker[] {
  const seenCourtPositions = new Set<CourtPosition>();
  const seenPlayerIds = new Set<string>();
  const seenReplacedPlayerIds = new Set<string>();
  const legalMarkers: LegalLineupMarker[] = [];

  slots
    .slice()
    .sort((left, right) => left.courtPosition - right.courtPosition)
    .forEach((slot, index) => {
      if (seenCourtPositions.has(slot.courtPosition)) {
        return;
      }

      const player = playerById.get(slot.playerId);
      const fallbackPlayer = teamPlayers[index];
      const resolvedPlayer = resolveSlotDisplayPlayer({
        slot,
        player: player ?? fallbackPlayer,
        activeLiberoState,
        playerById,
        forceRegularPlayer: forceRegularPlayerForLiberoFrontRow,
      });
      const playerId = resolvedPlayer.displayPlayerId;

      const playerKey = getTeamScopedPlayerKey(teamSide, playerId);

      if (seenPlayerIds.has(playerKey) || seenReplacedPlayerIds.has(playerKey)) {
        return;
      }

      const replacedPlayerKey = resolvedPlayer.replacedPlayerId
        ? getTeamScopedPlayerKey(teamSide, resolvedPlayer.replacedPlayerId)
        : null;

      if (replacedPlayerKey && seenReplacedPlayerIds.has(replacedPlayerKey)) {
        return;
      }

      if (replacedPlayerKey && seenPlayerIds.has(replacedPlayerKey)) {
        const replacedMarkerIndex = legalMarkers.findIndex((marker) => (
          marker.playerId === resolvedPlayer.replacedPlayerId
        ));

        if (replacedMarkerIndex >= 0) {
          legalMarkers.splice(replacedMarkerIndex, 1);
        }

        seenPlayerIds.delete(replacedPlayerKey);
      }

      const replacedPlayer = resolvedPlayer.replacedPlayerId
        ? playerById.get(resolvedPlayer.replacedPlayerId)
        : undefined;

      legalMarkers.push({
        slot,
        playerId,
        jerseyNumber: getPlayerJerseyNumber(resolvedPlayer.displayPlayer, fallbackPlayer, slot.courtPosition),
        isLibero: resolvedPlayer.isLibero,
        isSetter: slot.tacticalRole === PlayerRole.SETTER,
        replacedPlayerId: resolvedPlayer.replacedPlayerId,
        replacedPlayerJerseyNumber: replacedPlayer?.jerseyNumber,
      });
      seenCourtPositions.add(slot.courtPosition);
      seenPlayerIds.add(playerKey);

      if (replacedPlayerKey) {
        seenReplacedPlayerIds.add(replacedPlayerKey);
        seenPlayerIds.delete(replacedPlayerKey);
      }
    });

  if (legalMarkers.length < EXPECTED_COURT_MARKER_COUNT) {
    const fallbackPlayers = [
      ...teamPlayers.filter((player) => !player.isLibero),
      ...teamPlayers.filter((player) => player.isLibero),
    ].filter((player) => {
      const playerKey = getTeamScopedPlayerKey(teamSide, player.id);
      return !seenPlayerIds.has(playerKey) && !seenReplacedPlayerIds.has(playerKey);
    });

    COURT_POSITIONS
      .filter((courtPosition) => !seenCourtPositions.has(courtPosition))
      .forEach((courtPosition, index) => {
        if (legalMarkers.length >= EXPECTED_COURT_MARKER_COUNT) {
          return;
        }

        const fallbackPlayer = fallbackPlayers[index];
        const playerId = fallbackPlayer?.id ?? `${teamSide}-placeholder-${courtPosition}`;
        const playerKey = getTeamScopedPlayerKey(teamSide, playerId);

        if (seenPlayerIds.has(playerKey) || seenReplacedPlayerIds.has(playerKey)) {
          return;
        }

        legalMarkers.push({
          slot: {
            courtPosition,
            playerId,
          },
          playerId,
          jerseyNumber: getPlayerJerseyNumber(fallbackPlayer, undefined, courtPosition),
          isLibero: Boolean(fallbackPlayer?.isLibero),
          isSetter: false,
        });
        seenCourtPositions.add(courtPosition);
        seenPlayerIds.add(playerKey);
      });
  }

  return legalMarkers.slice(0, EXPECTED_COURT_MARKER_COUNT);
}

function createFallbackTacticalMarker({
  teamSide,
  legalMarker,
  displaySide,
}: {
  teamSide: TeamSide;
  legalMarker: LegalLineupMarker;
  displaySide: CourtDisplaySide;
}): TacticalCourtPlayer {
  const fallbackPosition = getCourtPositionCoordinate(displaySide, legalMarker.slot.courtPosition);

  return {
    id: getTeamScopedPlayerKey(teamSide, legalMarker.playerId),
    playerId: legalMarker.playerId,
    courtPosition: legalMarker.slot.courtPosition,
    jerseyNumber: legalMarker.jerseyNumber,
    isLibero: legalMarker.isLibero,
    isSetter: legalMarker.isSetter,
    replacedPlayerId: legalMarker.replacedPlayerId,
    replacedPlayerJerseyNumber: legalMarker.replacedPlayerJerseyNumber,
    x: fallbackPosition.x,
    y: fallbackPosition.y,
  };
}

function warnTacticalMarkerInvariant({
  teamSide,
  markers,
  legalMarkers,
  recoveryReasons,
}: {
  teamSide: TeamSide;
  markers: readonly TacticalCourtPlayer[];
  legalMarkers: readonly LegalLineupMarker[];
  recoveryReasons: readonly string[];
}) {
  if (markers.length === EXPECTED_COURT_MARKER_COUNT && recoveryReasons.length === 0) {
    return;
  }

  console.warn('[OpenVolleyScout] Tactical marker invariant recovered', {
    teamSide,
    renderedMarkerCount: markers.length,
    expectedMarkerCount: EXPECTED_COURT_MARKER_COUNT,
    renderedPlayerIds: markers.map((marker) => marker.playerId),
    legalPlayerIds: legalMarkers.map((marker) => marker.playerId),
    recoveryReasons,
  });
}

function normalizeTacticalCourtPlayers({
  teamSide,
  markers,
  legalMarkers,
  displaySide,
}: {
  teamSide: TeamSide;
  markers: readonly TacticalCourtPlayer[];
  legalMarkers: readonly LegalLineupMarker[];
  displaySide: CourtDisplaySide;
}): TacticalCourtPlayer[] {
  const dedupedMarkers = dedupeTacticalCourtPlayers(teamSide, markers);
  const markerByPlayerId = new Map(dedupedMarkers.map((marker) => [
    getTeamScopedPlayerKey(teamSide, marker.playerId),
    marker,
  ]));
  const usedPlayerIds = new Set<string>();
  const normalizedMarkers: TacticalCourtPlayer[] = [];
  const recoveryReasons: string[] = [];

  if (dedupedMarkers.length !== markers.length) {
    recoveryReasons.push('duplicate_team_scoped_markers_removed');
  }

  legalMarkers.forEach((legalMarker) => {
    const playerKey = getTeamScopedPlayerKey(teamSide, legalMarker.playerId);

    if (usedPlayerIds.has(playerKey)) {
      return;
    }

    const existingMarker = markerByPlayerId.get(playerKey);
    const marker = existingMarker
      ?? createFallbackTacticalMarker({ teamSide, legalMarker, displaySide });

    if (!existingMarker) {
      recoveryReasons.push(`filled_from_lineup:${legalMarker.playerId}`);
    }

    normalizedMarkers.push({
      ...marker,
      courtPosition: legalMarker.slot.courtPosition,
      jerseyNumber: legalMarker.jerseyNumber,
      isLibero: legalMarker.isLibero,
      isSetter: marker.isSetter || legalMarker.isSetter,
      replacedPlayerId: legalMarker.replacedPlayerId,
      replacedPlayerJerseyNumber: legalMarker.replacedPlayerJerseyNumber,
    });
    usedPlayerIds.add(playerKey);
  });

  const cappedMarkers = normalizedMarkers.slice(0, EXPECTED_COURT_MARKER_COUNT);
  if (normalizedMarkers.length > EXPECTED_COURT_MARKER_COUNT) {
    recoveryReasons.push('extra_markers_capped');
  }

  warnTacticalMarkerInvariant({
    teamSide,
    markers: cappedMarkers,
    legalMarkers,
    recoveryReasons,
  });

  return cappedMarkers;
}

function getResolvedSystemBlock({
  phase,
  defenseSystemBlock,
  receptionSystemBlock,
}: {
  phase: TeamTacticalPhase;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
}) {
  return usesReceptionLayout(phase)
    ? receptionSystemBlock ?? DEFAULT_RECEPTION_SYSTEM_BLOCK
    : defenseSystemBlock ?? DEFAULT_DEFENSE_SYSTEM_BLOCK;
}

export function getSystemRotationPositions({
  phase,
  rotation,
  defenseSystemBlock,
  receptionSystemBlock,
}: {
  phase: TeamTacticalPhase;
  rotation: CourtPosition;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
}): TacticalSystemPosition[] {
  if (usesReceptionLayout(phase)) {
    return getReceptionLayoutPositions({
      receptionSystemBlock,
      rotation: rotation as ReceptionRotation,
    });
  }

  return getDefenseLayoutPositions({
    phase,
    defenseSystemBlock,
    rotation: rotation as DefenseRotation,
  });
}

export function resolveTacticalCourtPlayers({
  teamSide,
  team,
  lineup,
  phase,
  defenseSystemBlock,
  receptionSystemBlock,
  serveStartZone,
  displaySide,
}: {
  teamSide: TeamSide;
  team: Team | null;
  lineup: ActiveLineup | null;
  phase: TeamTacticalPhase;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
  serveStartZone?: ScoutingZone | null;
  displaySide?: CourtDisplaySide;
}): TacticalCourtPlayer[] {
  const teamPlayers = team?.players ?? [];
  const slots = lineup?.slots.length ? lineup.slots : createFallbackSlots(team);
  const systemBlock = getResolvedSystemBlock({ phase, defenseSystemBlock, receptionSystemBlock });
  const roleSequence = getRoleSequence(systemBlock);
  const setterRotation = getCurrentSetterRotation(lineup, roleSequence);
  const playerById = new Map(teamPlayers.map((player) => [player.id, player]));
  const slotByPlayerId = new Map(slots.map((slot) => [slot.playerId, slot]));
  const activeLiberoState = getActiveLiberoStateForTeam(lineup, teamSide);
  const forceRegularPlayerForLiberoFrontRow = isActiveLiberoForcedOutOfFrontRow(slots, activeLiberoState);
  const roleResolutionLineup = lineup && activeLiberoState
    ? createLineupForBaseRoleResolution(lineup, activeLiberoState)
    : lineup;
  const resolvedDisplaySide = displaySide ?? (teamSide === 'away' ? 'left' : 'right');
  const legalLineupMarkers = getLegalLineupMarkers({
    slots,
    teamSide,
    teamPlayers,
    playerById,
    activeLiberoState,
    forceRegularPlayerForLiberoFrontRow,
  });
  const systemPositions = getSystemRotationPositions({
    phase,
    rotation: setterRotation,
    defenseSystemBlock,
    receptionSystemBlock,
  });
  const tacticalPlayers: TacticalCourtPlayer[] = [];
  const positionedPlayerIds = new Set<string>();
  const rolePlayerMap = roleResolutionLineup
    ? getTeamRolePlayerMap({ roleSequence, lineup: roleResolutionLineup, teamPlayers })
    : new Map<PlayerRole, Player>();

  systemPositions.forEach((position) => {
    const rolePlayer = rolePlayerMap.get(position.role);
    const resolvedPlayer = rolePlayer
      ? resolveLiberoDisplayPlayer({
          rolePlayer,
          activeLiberoState,
          playerById,
          forceRegularPlayer: forceRegularPlayerForLiberoFrontRow,
        })
      : null;
    const displayPlayer = resolvedPlayer?.displayPlayer;
    const slot = rolePlayer && displayPlayer
      ? getRoleSlot({
          slots,
          rolePlayerId: rolePlayer.id,
          displayPlayerId: displayPlayer.id,
        }) ?? slotByPlayerId.get(displayPlayer.id)
      : undefined;

    if (!rolePlayer || !displayPlayer || !slot) {
      return;
    }

    const halfCourtCoordinate = getSystemPositionCoordinate(position);
    const liveCourtCoordinate = mapHalfCourtSystemPointToLiveCourt(resolvedDisplaySide, halfCourtCoordinate);
    const replacedPlayer = resolvedPlayer.replacedPlayerId
      ? playerById.get(resolvedPlayer.replacedPlayerId)
      : undefined;

    tacticalPlayers.push({
      id: getTeamScopedPlayerKey(teamSide, displayPlayer.id),
      playerId: displayPlayer.id,
      courtPosition: slot.courtPosition,
      jerseyNumber: displayPlayer.jerseyNumber,
      role: position.role,
      isLibero: resolvedPlayer.isLibero,
      isSetter: position.role === PlayerRole.SETTER,
      replacedPlayerId: resolvedPlayer.replacedPlayerId,
      replacedPlayerJerseyNumber: replacedPlayer?.jerseyNumber,
      x: liveCourtCoordinate.x,
      y: liveCourtCoordinate.y,
    });
    trackPositionedPlayer(positionedPlayerIds, teamSide, displayPlayer.id, resolvedPlayer.replacedPlayerId);
  });

  slots
    .slice()
    .sort((left, right) => left.courtPosition - right.courtPosition)
    .forEach((slot, index) => {
      if (
        positionedPlayerIds.has(getTeamScopedPlayerKey(teamSide, slot.playerId))
        || (slot.replacedPlayerId && positionedPlayerIds.has(getTeamScopedPlayerKey(teamSide, slot.replacedPlayerId)))
      ) {
        return;
      }

      const player = playerById.get(slot.playerId);
      const fallbackPlayer = teamPlayers[index];
      const resolvedPlayer = resolveSlotDisplayPlayer({
        slot,
        player: player ?? fallbackPlayer,
        activeLiberoState,
        playerById,
        forceRegularPlayer: forceRegularPlayerForLiberoFrontRow,
      });
      const playerId = resolvedPlayer.displayPlayerId;
      const fallbackPosition = getCourtPositionCoordinate(resolvedDisplaySide, slot.courtPosition);
      const replacedPlayer = resolvedPlayer.replacedPlayerId
        ? playerById.get(resolvedPlayer.replacedPlayerId)
        : undefined;

      tacticalPlayers.push({
        id: getTeamScopedPlayerKey(teamSide, playerId),
        playerId,
        courtPosition: slot.courtPosition,
        jerseyNumber: getPlayerJerseyNumber(resolvedPlayer.displayPlayer, fallbackPlayer, slot.courtPosition),
        isLibero: resolvedPlayer.isLibero,
        isSetter: slot.tacticalRole === PlayerRole.SETTER,
        replacedPlayerId: resolvedPlayer.replacedPlayerId,
        replacedPlayerJerseyNumber: replacedPlayer?.jerseyNumber,
        x: fallbackPosition.x,
        y: fallbackPosition.y,
      });
      trackPositionedPlayer(positionedPlayerIds, teamSide, playerId, resolvedPlayer.replacedPlayerId);
    });

  if (serveStartZone?.teamSide === teamSide && phase === 'serving_prepare') {
    const server = tacticalPlayers.find((player) => player.courtPosition === 1);
    if (server) {
      const serveCoordinate = getServingPlayerServeCoordinate(resolvedDisplaySide, serveStartZone);
      server.x = serveCoordinate.x;
      server.y = serveCoordinate.y;
    }
  }

  if (isSetterReleasePhase(phase)) {
    const setter = rolePlayerMap.get(PlayerRole.SETTER);
    const setterMarker = setter
      ? tacticalPlayers.find((player) => player.playerId === setter.id)
      : null;

    if (setterMarker) {
      const setterReleasePosition = getSetterReleaseCoordinate(resolvedDisplaySide);
      setterMarker.x = setterReleasePosition.x;
      setterMarker.y = setterReleasePosition.y;
    }
  }

  return normalizeTacticalCourtPlayers({
    teamSide,
    markers: tacticalPlayers,
    legalMarkers: legalLineupMarkers,
    displaySide: resolvedDisplaySide,
  });
}
