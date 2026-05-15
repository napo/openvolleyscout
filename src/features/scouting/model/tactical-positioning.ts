import {
  DEFAULT_DEFENSE_SYSTEM_BLOCK,
  DEFAULT_RECEPTION_SYSTEM_BLOCK,
} from '@src/config/systems';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLiberoState, ActiveLineup, ActiveLineupSlot } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import type { ScoutingPoint, ScoutingZone } from '@src/domain/spatial';
import {
  getDataVolleyZoneCoordinate,
  PlayerRole,
  type DefenseContext,
  type DefensePosition,
  type DefenseRotation,
  type DefenseSystemBlock,
  type ReceptionPosition,
  type ReceptionRotation,
  type ReceptionSystemBlock,
} from '@src/domain/systems';
import type { BallTouch } from '@src/domain/touch/types';
import {
  getCurrentSetterRotation,
  getTeamRolePlayerMap,
} from './system-role-mapping';

export type TeamTacticalPhase =
  | 'serving_prepare'
  | 'break_point_defense'
  | 'break_point_setter_release'
  | 'reception'
  | 'after_reception_setter_release'
  | 'side_out_defense'
  | 'side_out_setter_release';

export type TeamTacticalPhases = Record<TeamSide, TeamTacticalPhase>;

export type TacticalCourtPlayer = ScoutingPoint & {
  id: string;
  playerId: string;
  courtPosition: CourtPosition;
  jerseyNumber: number | string;
  role?: PlayerRole;
  isLibero?: boolean;
  isSetter?: boolean;
  replacedPlayerId?: string;
};

type SystemPosition = DefensePosition | ReceptionPosition;
const SETTER_AFTER_RECEPTION_ZONE = '2c';
const FRONT_ROW_POSITIONS = new Set<CourtPosition>([2, 3, 4]);

const COURT_POSITION_COORDINATES: Record<TeamSide, Record<CourtPosition, ScoutingPoint>> = {
  away: {
    1: { x: 18, y: 78 },
    2: { x: 38, y: 78 },
    3: { x: 38, y: 50 },
    4: { x: 38, y: 22 },
    5: { x: 18, y: 22 },
    6: { x: 18, y: 50 },
  },
  home: {
    1: { x: 82, y: 22 },
    2: { x: 62, y: 22 },
    3: { x: 62, y: 50 },
    4: { x: 62, y: 78 },
    5: { x: 82, y: 78 },
    6: { x: 82, y: 50 },
  },
};

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function createFallbackSlots(team: Team | null): ActiveLineupSlot[] {
  return Array.from({ length: 6 }, (_, index) => ({
    courtPosition: (index + 1) as CourtPosition,
    playerId: team?.players[index]?.id ?? `placeholder-${index + 1}`,
  }));
}

function getPlayerJerseyNumber(
  player: Player | undefined,
  fallbackPlayer: Player | undefined,
  courtPosition: CourtPosition,
): number | string {
  return player?.jerseyNumber ?? fallbackPlayer?.jerseyNumber ?? courtPosition;
}

function getSystemPositionCoordinate(position: SystemPosition): ScoutingPoint {
  if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return {
      x: position.x,
      y: position.y,
    };
  }

  return getDataVolleyZoneCoordinate(position.dataVolleyZone);
}

function mapHalfCourtSystemPointToLiveCourt(teamSide: TeamSide, point: ScoutingPoint): ScoutingPoint {
  const depth = clampPercentage(point.y);
  const lateral = clampPercentage(point.x);

  if (teamSide === 'away') {
    return {
      x: 50 - (depth * 41) / 100,
      y: 6 + (lateral * 88) / 100,
    };
  }

  return {
    x: 50 + (depth * 41) / 100,
    y: 94 - (lateral * 88) / 100,
  };
}

function getDefenseContextForTacticalPhase(phase: TeamTacticalPhase): DefenseContext {
  return phase === 'side_out_defense'
    || phase === 'after_reception_setter_release'
    || phase === 'side_out_setter_release'
    ? 'side_out'
    : 'break_point';
}

function usesReceptionLayout(phase: TeamTacticalPhase): boolean {
  return phase === 'reception';
}

function getDefenseRotationPositions(
  system: DefenseSystemBlock,
  context: DefenseContext,
  rotation: DefenseRotation,
): DefensePosition[] {
  return system.contexts[context].find((entry) => entry.rotation === rotation)?.positions
    ?? DEFAULT_DEFENSE_SYSTEM_BLOCK.contexts[context].find((entry) => entry.rotation === rotation)?.positions
    ?? [];
}

function getReceptionRotationPositions(
  system: ReceptionSystemBlock,
  rotation: ReceptionRotation,
): ReceptionPosition[] {
  return system.rotations.find((entry) => entry.rotation === rotation)?.positions
    ?? DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.find((entry) => entry.rotation === rotation)?.positions
    ?? [];
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
}): SystemPosition[] {
  if (usesReceptionLayout(phase)) {
    return getReceptionRotationPositions(
      receptionSystemBlock ?? DEFAULT_RECEPTION_SYSTEM_BLOCK,
      rotation as ReceptionRotation,
    );
  }

  return getDefenseRotationPositions(
    defenseSystemBlock ?? DEFAULT_DEFENSE_SYSTEM_BLOCK,
    getDefenseContextForTacticalPhase(phase),
    rotation as DefenseRotation,
  );
}

export function getInitialTeamTacticalPhases(servingTeam: TeamSide | null | undefined): TeamTacticalPhases {
  if (!servingTeam) {
    return {
      away: 'reception',
      home: 'reception',
    };
  }

  return {
    [servingTeam]: 'serving_prepare',
    [getOppositeTeamSide(servingTeam)]: 'reception',
  } as TeamTacticalPhases;
}

function getSetterReleasePhaseAfterTouch(phase: TeamTacticalPhase, touch: BallTouch): TeamTacticalPhase | null {
  if (phase === 'reception' && touch.skill === 'receive') {
    return 'after_reception_setter_release';
  }

  if (touch.skill !== 'dig') {
    return null;
  }

  if (phase === 'break_point_defense' || phase === 'break_point_setter_release') {
    return 'break_point_setter_release';
  }

  if (
    phase === 'side_out_defense'
    || phase === 'side_out_setter_release'
    || phase === 'after_reception_setter_release'
  ) {
    return 'side_out_setter_release';
  }

  return null;
}

function isTerminalAce(touch: BallTouch): boolean {
  return touch.skill === 'serve' && touch.evaluation === '#';
}

function shouldSwitchToSideOutDefenseAfterTouch(phase: TeamTacticalPhase, touch: BallTouch): boolean {
  return (
    phase === 'reception'
    || phase === 'after_reception_setter_release'
    || phase === 'side_out_setter_release'
  ) && touch.skill === 'attack';
}

function getDefensePhaseAfterOpponentTouch(phase: TeamTacticalPhase): TeamTacticalPhase | null {
  if (phase === 'break_point_setter_release') {
    return 'break_point_defense';
  }

  if (
    phase === 'reception'
    || phase === 'after_reception_setter_release'
    || phase === 'side_out_setter_release'
  ) {
    return 'side_out_defense';
  }

  return null;
}

export function getNextTeamTacticalPhasesAfterTouch({
  phases,
  touch,
  previousTouch,
  servingTeam,
}: {
  phases: TeamTacticalPhases;
  touch: BallTouch;
  previousTouch?: BallTouch | null;
  servingTeam?: TeamSide | null;
}): TeamTacticalPhases {
  const nextPhases: TeamTacticalPhases = { ...phases };

  if (isTerminalAce(touch)) {
    return nextPhases;
  }

  if (touch.skill === 'serve' && (!previousTouch || touch.teamSide === servingTeam)) {
    nextPhases[touch.teamSide] = 'break_point_defense';
  }

  const setterReleasePhase = getSetterReleasePhaseAfterTouch(nextPhases[touch.teamSide], touch);
  if (setterReleasePhase) {
    nextPhases[touch.teamSide] = setterReleasePhase;
  }

  if (shouldSwitchToSideOutDefenseAfterTouch(nextPhases[touch.teamSide], touch)) {
    nextPhases[touch.teamSide] = 'side_out_defense';
  }

  if (previousTouch && previousTouch.teamSide !== touch.teamSide) {
    const previousTeamDefensePhase = getDefensePhaseAfterOpponentTouch(nextPhases[previousTouch.teamSide]);

    if (previousTeamDefensePhase) {
      nextPhases[previousTouch.teamSide] = previousTeamDefensePhase;
    }
  }

  return nextPhases;
}

export function getTeamTacticalPhasesAfterTouches({
  servingTeam,
  touches,
}: {
  servingTeam?: TeamSide | null;
  touches: readonly BallTouch[];
}): TeamTacticalPhases {
  return touches.reduce<TeamTacticalPhases>((phases, touch, index) => getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch,
    previousTouch: touches[index - 1],
    servingTeam,
  }), getInitialTeamTacticalPhases(servingTeam));
}

export function getTeamTacticalPhase({
  teamSide,
  phases,
  servingTeam,
}: {
  teamSide: TeamSide;
  phases?: TeamTacticalPhases | null;
  servingTeam?: TeamSide | null;
}): TeamTacticalPhase {
  return phases?.[teamSide] ?? getInitialTeamTacticalPhases(servingTeam)[teamSide];
}

export function getTeamPhaseFromCurrentRally({
  teamSide,
  servingTeam,
  touches,
}: {
  teamSide: TeamSide;
  servingTeam?: TeamSide | null;
  touches: readonly BallTouch[];
}): TeamTacticalPhase {
  return getTeamTacticalPhasesAfterTouches({ servingTeam, touches })[teamSide];
}

export function getSetterAfterReceptionOverride(teamSide: TeamSide): ScoutingPoint {
  return mapHalfCourtSystemPointToLiveCourt(
    teamSide,
    getDataVolleyZoneCoordinate(SETTER_AFTER_RECEPTION_ZONE),
  );
}

function getActiveLiberoStateForTeam(
  lineup: ActiveLineup | null | undefined,
  teamSide: TeamSide,
): ActiveLiberoState | null {
  const activeLiberoState = lineup?.personnelState.activeLiberoState;

  return activeLiberoState?.teamSide === teamSide ? activeLiberoState : null;
}

function createLineupForBaseRoleResolution(
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

function getRoleSlot({
  slots,
  rolePlayerId,
  displayPlayerId,
}: {
  slots: readonly ActiveLineupSlot[];
  rolePlayerId: string;
  displayPlayerId: string;
}): ActiveLineupSlot | undefined {
  return slots.find((slot) => slot.playerId === rolePlayerId)
    ?? slots.find((slot) => slot.playerId === displayPlayerId)
    ?? slots.find((slot) => slot.replacedPlayerId === rolePlayerId);
}

function resolveLiberoDisplayPlayer({
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

function resolveSlotDisplayPlayer({
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

  if (slot.isLibero && slot.replacedPlayerId && FRONT_ROW_POSITIONS.has(slot.courtPosition)) {
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

function trackPositionedPlayer(
  positionedPlayerIds: Set<string>,
  playerId: string,
  replacedPlayerId?: string,
) {
  positionedPlayerIds.add(playerId);

  if (replacedPlayerId) {
    positionedPlayerIds.add(replacedPlayerId);
  }
}

function isActiveLiberoForcedOutOfFrontRow(
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
    || (liberoSlot && FRONT_ROW_POSITIONS.has(liberoSlot.courtPosition)),
  );
}

export function getPlayerTacticalPositions({
  teamSide,
  team,
  lineup,
  phase,
  defenseSystemBlock,
  receptionSystemBlock,
  serveStartZone,
}: {
  teamSide: TeamSide;
  team: Team | null;
  lineup: ActiveLineup | null;
  phase: TeamTacticalPhase;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
  serveStartZone?: ScoutingZone | null;
}): TacticalCourtPlayer[] {
  const teamPlayers = team?.players ?? [];
  const slots = lineup?.slots.length ? lineup.slots : createFallbackSlots(team);
  const systemBlock = usesReceptionLayout(phase)
    ? receptionSystemBlock ?? DEFAULT_RECEPTION_SYSTEM_BLOCK
    : defenseSystemBlock ?? DEFAULT_DEFENSE_SYSTEM_BLOCK;
  const roleSequence = systemBlock.roleSequence.length > 0
    ? systemBlock.roleSequence
    : DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence;
  const setterRotation = getCurrentSetterRotation(lineup, roleSequence);
  const playerById = new Map(teamPlayers.map((player) => [player.id, player]));
  const slotByPlayerId = new Map(slots.map((slot) => [slot.playerId, slot]));
  const activeLiberoState = getActiveLiberoStateForTeam(lineup, teamSide);
  const forceRegularPlayerForLiberoFrontRow = isActiveLiberoForcedOutOfFrontRow(slots, activeLiberoState);
  const roleResolutionLineup = lineup && activeLiberoState
    ? createLineupForBaseRoleResolution(lineup, activeLiberoState)
    : lineup;
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
    const liveCourtCoordinate = mapHalfCourtSystemPointToLiveCourt(teamSide, halfCourtCoordinate);

    tacticalPlayers.push({
      id: `${teamSide}-${position.role}`,
      playerId: displayPlayer.id,
      courtPosition: slot.courtPosition,
      jerseyNumber: displayPlayer.jerseyNumber,
      role: position.role,
      isLibero: resolvedPlayer.isLibero,
      isSetter: position.role === PlayerRole.SETTER,
      replacedPlayerId: resolvedPlayer.replacedPlayerId,
      x: liveCourtCoordinate.x,
      y: liveCourtCoordinate.y,
    });
    trackPositionedPlayer(positionedPlayerIds, displayPlayer.id, resolvedPlayer.replacedPlayerId);
  });

  slots
    .slice()
    .sort((left, right) => left.courtPosition - right.courtPosition)
    .forEach((slot, index) => {
      if (positionedPlayerIds.has(slot.playerId) || (slot.replacedPlayerId && positionedPlayerIds.has(slot.replacedPlayerId))) {
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
      const fallbackPosition = COURT_POSITION_COORDINATES[teamSide][slot.courtPosition];

      tacticalPlayers.push({
        id: `${teamSide}-${slot.courtPosition}`,
        playerId,
        courtPosition: slot.courtPosition,
        jerseyNumber: getPlayerJerseyNumber(resolvedPlayer.displayPlayer, fallbackPlayer, slot.courtPosition),
        isLibero: resolvedPlayer.isLibero,
        isSetter: slot.tacticalRole === PlayerRole.SETTER,
        replacedPlayerId: resolvedPlayer.replacedPlayerId,
        x: fallbackPosition.x,
        y: fallbackPosition.y,
      });
      trackPositionedPlayer(positionedPlayerIds, playerId, resolvedPlayer.replacedPlayerId);
    });

  if (serveStartZone?.teamSide === teamSide && phase === 'serving_prepare') {
    const server = tacticalPlayers.find((player) => player.courtPosition === 1);
    if (server) {
      const offsetX = teamSide === 'away' ? -3.2 : 3.2;
      server.x = serveStartZone.center.x + offsetX;
      server.y = serveStartZone.center.y;
    }
  }

  if (
    phase === 'after_reception_setter_release'
    || phase === 'break_point_setter_release'
    || phase === 'side_out_setter_release'
  ) {
    const setter = rolePlayerMap.get(PlayerRole.SETTER);
    const setterMarker = setter
      ? tacticalPlayers.find((player) => player.playerId === setter.id)
      : null;

    if (setterMarker) {
      const setterReleasePosition = getSetterAfterReceptionOverride(teamSide);
      setterMarker.x = setterReleasePosition.x;
      setterMarker.y = setterReleasePosition.y;
    }
  }

  return tacticalPlayers;
}
