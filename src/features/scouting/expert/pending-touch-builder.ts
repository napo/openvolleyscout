import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { TeamSide } from '@src/domain/common/enums';
import { createFullScoutingCells, type ScoutingGridCoordinate, type ScoutingZone } from '@src/domain/spatial';
import type { PendingTouch } from '@src/features/scouting/model';
import { RECEIVE_TO_SERVE_EVALUATION } from '../model/datavolley-flow';
import type { ParsedTouchCode } from './code-parser';

/**
 * Turns parsed DataVolley codes into pending touches (players resolved by
 * jersey number, default zones, serve inferred from a reception).
 * Shared by the typed code input and the button-based tag input.
 */

type PlayerContext = {
  lineup: ActiveLineup | null;
  players: Player[];
};

const EXPERT_ZONES = createFullScoutingCells();

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

function getZoneGridCoordinate(zoneCode: string): ScoutingGridCoordinate | undefined {
  const zoneMap: Record<string, ScoutingGridCoordinate> = {
    '1': { row: 5, column: 5 },
    '2': { row: 2, column: 5 },
    '3': { row: 2, column: 3 },
    '4': { row: 2, column: 1 },
    '5': { row: 5, column: 1 },
    '6': { row: 5, column: 3 },
    '7': { row: 4, column: 1 },
    '8': { row: 4, column: 3 },
    '9': { row: 4, column: 5 },
  };

  return zoneMap[zoneCode];
}

function findZoneByGrid(teamSide: TeamSide, coordinate: ScoutingGridCoordinate): ScoutingZone | undefined {
  return EXPERT_ZONES.find((zone) => (
    zone.teamSide === teamSide
    && zone.kind === 'in_court'
    && zone.gridCoordinate.row === coordinate.row
    && zone.gridCoordinate.column === coordinate.column
  ));
}

function zoneCodeToScoutingZone(zoneCode: string | undefined, teamSide: TeamSide): ScoutingZone | undefined {
  if (!zoneCode) return undefined;
  const coordinate = getZoneGridCoordinate(zoneCode);
  return coordinate ? findZoneByGrid(teamSide, coordinate) : undefined;
}

function getDefaultTouchZone(teamSide: TeamSide): ScoutingZone {
  return (
    findZoneByGrid(teamSide, { row: 3, column: 3 })
    ?? EXPERT_ZONES.find((zone) => zone.teamSide === teamSide && zone.kind === 'in_court')
    ?? EXPERT_ZONES[0]
  );
}

function getDefaultServeZone(teamSide: TeamSide): ScoutingZone {
  return (
    EXPERT_ZONES.find((zone) => (
      zone.teamSide === teamSide
      && zone.kind === 'serve_start'
      && zone.alignedCourtPosition === 1
    ))
    ?? getDefaultTouchZone(teamSide)
  );
}

function findPlayerByJerseyNumber(context: PlayerContext, jerseyNumber: number): Player | null {
  const player = context.players.find((candidate) => candidate.jerseyNumber === jerseyNumber);
  if (!player) return null;

  if (!context.lineup || context.lineup.slots.some((slot) => slot.playerId === player.id)) {
    return player;
  }

  return player;
}

function getPlayerContext(
  teamSide: TeamSide,
  homeLineup: ActiveLineup | null,
  awayLineup: ActiveLineup | null,
  homePlayers: Player[],
  awayPlayers: Player[],
): PlayerContext {
  return teamSide === 'home'
    ? { lineup: homeLineup, players: homePlayers }
    : { lineup: awayLineup, players: awayPlayers };
}

function getServingPlayerId(lineup: ActiveLineup | null, servingTeam: TeamSide | null): string | undefined {
  if (!lineup || !servingTeam || lineup.teamSide !== servingTeam) {
    return undefined;
  }

  return lineup.slots.find((slot) => slot.courtPosition === 1)?.playerId;
}

export function formatDataVolleyTime(value: string | number | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '--:--:--';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}


function createPendingTouchFromCode(
  code: ParsedTouchCode,
  context: {
    homeLineup: ActiveLineup | null;
    awayLineup: ActiveLineup | null;
    homePlayers: Player[];
    awayPlayers: Player[];
    recordedAtIso: string;
    recordedAtTime: string;
  },
): PendingTouch | null {
  if (!code.valid || code.isAutomatic || !code.teamSide || !code.jerseyNumber || !code.skill) {
    return null;
  }

  const playerContext = getPlayerContext(
    code.teamSide,
    context.homeLineup,
    context.awayLineup,
    context.homePlayers,
    context.awayPlayers,
  );
  const player = findPlayerByJerseyNumber(playerContext, code.jerseyNumber);
  if (!player) return null;

  const zone = zoneCodeToScoutingZone(code.endZone ?? code.startZone, code.teamSide)
    ?? getDefaultTouchZone(code.teamSide);

  return {
    id: `touch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    playerId: player.id,
    teamSide: code.teamSide,
    skill: code.skill,
    evaluation: code.evaluation,
    zone,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    requiredExplicitInput: false,
    skillTypeCode: code.skillType,
    serveType: code.skill === 'serve' ? code.skillType : undefined,
    attackType: code.skill === 'attack' ? code.skillType : undefined,
    setType: code.skill === 'set' ? code.setTypeCode ?? code.skillType : undefined,
    combinationCode: code.skill === 'attack' ? code.actionCode : undefined,
    setterCallCode: code.skill === 'set' ? code.actionCode : undefined,
    customCode: code.customCode,
    startZoneCode: code.startZone,
    endZoneCode: code.endZone,
    recordedAtTime: context.recordedAtTime,
    recordedAtIso: context.recordedAtIso,
  };
}

function createInferredServeTouch(input: {
  receiveCode: ParsedTouchCode;
  servingTeam: TeamSide;
  servingPlayerId?: string;
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  recordedAtIso: string;
  recordedAtTime: string;
}): PendingTouch | null {
  if (!input.servingPlayerId) return null;

  const serveEvaluation = input.receiveCode.evaluation
    ? RECEIVE_TO_SERVE_EVALUATION[input.receiveCode.evaluation]
    : undefined;

  return {
    id: `touch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    playerId: input.servingPlayerId,
    teamSide: input.servingTeam,
    skill: 'serve',
    evaluation: serveEvaluation,
    zone: getDefaultServeZone(input.servingTeam),
    source: 'inferred',
    touchOrigin: 'implicit_inference',
    requiredExplicitInput: false,
    inferenceReason: 'serve_from_reception',
    skillTypeCode: input.receiveCode.skillType,
    serveType: input.receiveCode.skillType,
    endZoneCode: input.receiveCode.startZone ?? input.receiveCode.endZone,
    recordedAtTime: input.recordedAtTime,
    recordedAtIso: input.recordedAtIso,
  };
}

export function buildPendingTouchesFromParsed(
  parsed: ParsedTouchCode[],
  context: {
    homeLineup: ActiveLineup | null;
    awayLineup: ActiveLineup | null;
    homePlayers: Player[];
    awayPlayers: Player[];
    currentRallyTouches: BallTouch[];
    servingTeam: TeamSide | null;
    recordedAtIso: string;
    recordedAtTime: string;
  },
): PendingTouch[] {
  const touches: PendingTouch[] = [];
  const servingLineup = context.servingTeam === 'home' ? context.homeLineup : context.awayLineup;
  const servingPlayerId = getServingPlayerId(servingLineup, context.servingTeam);

  parsed.forEach((code) => {
    if (!code.valid || code.isAutomatic) return;

    const shouldInferServe = (
      code.skill === 'receive'
      && context.servingTeam
      && code.teamSide === getOppositeTeamSide(context.servingTeam)
      && !context.currentRallyTouches.some((touch) => touch.skill === 'serve')
      && !touches.some((touch) => touch.skill === 'serve')
    );

    if (shouldInferServe) {
      const inferredServe = context.servingTeam ? createInferredServeTouch({
        receiveCode: code,
        servingTeam: context.servingTeam,
        servingPlayerId,
        homeLineup: context.homeLineup,
        awayLineup: context.awayLineup,
        recordedAtIso: context.recordedAtIso,
        recordedAtTime: context.recordedAtTime,
      }) : null;
      if (inferredServe) {
        touches.push(inferredServe);
      }
    }

    const touch = createPendingTouchFromCode(code, context);
    if (touch) {
      touches.push(touch);
    }
  });

  return touches;
}
