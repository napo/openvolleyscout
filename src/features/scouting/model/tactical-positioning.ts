import {
  DEFAULT_DEFENSE_SYSTEM_BLOCK,
  DEFAULT_RECEPTION_SYSTEM_BLOCK,
} from '@src/config/systems';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
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
  | 'reception'
  | 'after_reception_setter_release'
  | 'side_out_defense';

export type TeamTacticalPhases = Record<TeamSide, TeamTacticalPhase>;

export type TacticalCourtPlayer = ScoutingPoint & {
  id: string;
  playerId: string;
  courtPosition: CourtPosition;
  jerseyNumber: number | string;
  role?: PlayerRole;
};

type SystemPosition = DefensePosition | ReceptionPosition;
const SETTER_AFTER_RECEPTION_ZONE = '2d';

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

function createFallbackSlots(team: Team | null) {
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
  return phase === 'side_out_defense' ? 'side_out' : 'break_point';
}

function usesReceptionLayout(phase: TeamTacticalPhase): boolean {
  return phase === 'reception' || phase === 'after_reception_setter_release';
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

function shouldReleaseSetterAfterReception(phase: TeamTacticalPhase, touch: BallTouch): boolean {
  return phase === 'reception' && touch.skill === 'receive';
}

function shouldSwitchToSideOutDefenseAfterTouch(phase: TeamTacticalPhase, touch: BallTouch): boolean {
  return (phase === 'reception' || phase === 'after_reception_setter_release') && touch.skill === 'attack';
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

  if (touch.skill === 'serve' && (!previousTouch || touch.teamSide === servingTeam)) {
    nextPhases[touch.teamSide] = 'break_point_defense';
  }

  if (shouldReleaseSetterAfterReception(nextPhases[touch.teamSide], touch)) {
    nextPhases[touch.teamSide] = 'after_reception_setter_release';
  }

  if (shouldSwitchToSideOutDefenseAfterTouch(nextPhases[touch.teamSide], touch)) {
    nextPhases[touch.teamSide] = 'side_out_defense';
  }

  if (
    previousTouch
    && previousTouch.teamSide !== touch.teamSide
    && (
      nextPhases[previousTouch.teamSide] === 'reception'
      || nextPhases[previousTouch.teamSide] === 'after_reception_setter_release'
    )
  ) {
    nextPhases[previousTouch.teamSide] = 'side_out_defense';
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
  const rolePlayerMap = lineup
    ? getTeamRolePlayerMap({ roleSequence, lineup, teamPlayers })
    : new Map<PlayerRole, Player>();
  const playerById = new Map(teamPlayers.map((player) => [player.id, player]));
  const slotByPlayerId = new Map(slots.map((slot) => [slot.playerId, slot]));
  const systemPositions = getSystemRotationPositions({
    phase,
    rotation: setterRotation,
    defenseSystemBlock,
    receptionSystemBlock,
  });
  const tacticalPlayers: TacticalCourtPlayer[] = [];
  const positionedPlayerIds = new Set<string>();

  systemPositions.forEach((position) => {
    const player = rolePlayerMap.get(position.role);
    const slot = player ? slotByPlayerId.get(player.id) : undefined;

    if (!player || !slot) {
      return;
    }

    const halfCourtCoordinate = getSystemPositionCoordinate(position);
    const liveCourtCoordinate = mapHalfCourtSystemPointToLiveCourt(teamSide, halfCourtCoordinate);

    tacticalPlayers.push({
      id: `${teamSide}-${position.role}-${player.id}`,
      playerId: player.id,
      courtPosition: slot.courtPosition,
      jerseyNumber: player.jerseyNumber,
      role: position.role,
      x: liveCourtCoordinate.x,
      y: liveCourtCoordinate.y,
    });
    positionedPlayerIds.add(player.id);
  });

  slots
    .slice()
    .sort((left, right) => left.courtPosition - right.courtPosition)
    .forEach((slot, index) => {
      if (positionedPlayerIds.has(slot.playerId)) {
        return;
      }

      const player = playerById.get(slot.playerId);
      const fallbackPlayer = teamPlayers[index];
      const playerId = player?.id ?? fallbackPlayer?.id ?? slot.playerId;
      const fallbackPosition = COURT_POSITION_COORDINATES[teamSide][slot.courtPosition];

      tacticalPlayers.push({
        id: `${teamSide}-${slot.courtPosition}-${playerId}`,
        playerId,
        courtPosition: slot.courtPosition,
        jerseyNumber: getPlayerJerseyNumber(player, fallbackPlayer, slot.courtPosition),
        x: fallbackPosition.x,
        y: fallbackPosition.y,
      });
    });

  if (serveStartZone?.teamSide === teamSide && phase === 'serving_prepare') {
    const server = tacticalPlayers.find((player) => player.courtPosition === 1);
    if (server) {
      const offsetX = teamSide === 'away' ? -3.2 : 3.2;
      server.x = serveStartZone.center.x + offsetX;
      server.y = serveStartZone.center.y;
    }
  }

  if (phase === 'after_reception_setter_release') {
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
