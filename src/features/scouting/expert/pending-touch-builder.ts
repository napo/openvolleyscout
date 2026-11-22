import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { parseNumBlockersCode, parseAttackSubtypeCode, type BallTouch } from '@src/domain/touch/types';
import type { SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallDirection, StagePoint } from '@src/domain/trajectory/types';
import { createFullScoutingCells, remapScoutingZonesForDisplaySides, type ScoutingDisplaySideAssignments, type ScoutingGridCoordinate, type ScoutingZone } from '@src/domain/spatial';
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

function findZoneByGrid(teamSide: TeamSide, coordinate: ScoutingGridCoordinate, zones: readonly ScoutingZone[] = EXPERT_ZONES): ScoutingZone | undefined {
  return zones.find((zone) => (
    zone.teamSide === teamSide
    && zone.kind === 'in_court'
    && zone.gridCoordinate.row === coordinate.row
    && zone.gridCoordinate.column === coordinate.column
  ));
}

function zoneCodeToScoutingZone(zoneCode: string | undefined, teamSide: TeamSide, zones: readonly ScoutingZone[] = EXPERT_ZONES): ScoutingZone | undefined {
  if (!zoneCode) return undefined;
  const coordinate = getZoneGridCoordinate(zoneCode);
  return coordinate ? findZoneByGrid(teamSide, coordinate, zones) : undefined;
}

/** Behind the baseline: zones 1, 6, 5 face their position, 9 and 7 lie between 1-6 and 6-5. */
function serveStartPoint(zoneCode: string | undefined, teamSide: TeamSide, zones: readonly ScoutingZone[]): StagePoint | undefined {
  const lane = (position: number) => zones.find((zone) => (
    zone.teamSide === teamSide && zone.kind === 'serve_start' && zone.alignedCourtPosition === position
  ))?.center;
  const between = (a: number, b: number) => {
    const pa = lane(a);
    const pb = lane(b);
    return pa && pb ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } : undefined;
  };
  if (zoneCode === '1' || zoneCode === '6' || zoneCode === '5') return lane(Number(zoneCode));
  if (zoneCode === '9') return between(1, 6);
  if (zoneCode === '7') return between(6, 5);
  return undefined;
}

/**
 * The ball's course from the typed start and end zones, so a typed code is drawn on
 * the court like a dragged one. Serve and attack go from the player's side to the
 * other; reception and dig come from the other side to the player's.
 */
export function ballDirectionFromZoneCodes(
  skill: SkillType,
  teamSide: TeamSide,
  startZone: string | undefined,
  endZone: string | undefined,
  displaySides?: ScoutingDisplaySideAssignments,
): BallDirection | undefined {
  if (!startZone || !endZone) return undefined;
  // Points on the court as drawn: each team on the side where it is shown.
  const zones = displaySides ? remapScoutingZonesForDisplaySides(EXPERT_ZONES, displaySides) : EXPERT_ZONES;
  const other = getOppositeTeamSide(teamSide);
  const centre = (code: string, side: TeamSide) => zoneCodeToScoutingZone(code, side, zones)?.center;
  let start: StagePoint | undefined;
  let end: StagePoint | undefined;
  if (skill === 'serve') {
    start = serveStartPoint(startZone, teamSide, zones) ?? centre(startZone, teamSide);
    end = centre(endZone, other);
  } else if (skill === 'attack') {
    start = centre(startZone, teamSide);
    end = centre(endZone, other);
  } else if (skill === 'receive') {
    start = serveStartPoint(startZone, other, zones) ?? centre(startZone, other);
    end = centre(endZone, teamSide);
  } else if (skill === 'dig') {
    start = centre(startZone, other);
    end = centre(endZone, teamSide);
  }
  if (!start || !end) return undefined;
  return { start: { ...start }, end: { ...end }, courtZoneStart: startZone, courtZoneEnd: endZone };
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
    displaySides?: ScoutingDisplaySideAssignments;
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
  const dvAttackType = code.skill === 'attack'
    ? (code.evaluation === '#' && code.specialCode?.toUpperCase() === 'F'
      ? 'block_out'
      : code.skillSubtypeCode?.toUpperCase() === 'T'
        ? 'tip'
        : code.skillSubtypeCode?.toUpperCase() === 'P'
          ? 'roll_shot'
        : code.skillSubtypeCode?.toUpperCase() === 'H'
          ? 'power'
          : undefined)
    : undefined;

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
    ...(dvAttackType ? { advancedDetails: { attack: { type: dvAttackType } } } : {}),
    setType: code.skill === 'set' ? code.setTypeCode ?? code.skillType : undefined,
    combinationCode: code.skill === 'attack' ? code.actionCode : undefined,
    setterCallCode: code.skill === 'set' ? code.actionCode : undefined,
    customCode: code.customCode,
    startZoneCode: code.startZone,
    endZoneCode: code.endZone,
    ballDirection: ballDirectionFromZoneCodes(code.skill, code.teamSide, code.startZone, code.endZone, context.displaySides),
    numBlockers: parseNumBlockersCode(code.skill, code.playersCode),
    attackSubtype: parseAttackSubtypeCode(code.skill, code.skillSubtypeCode),
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
  displaySides?: ScoutingDisplaySideAssignments;
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
    startZoneCode: input.receiveCode.endZone ? input.receiveCode.startZone : undefined,
    endZoneCode: input.receiveCode.endZone ?? input.receiveCode.startZone,
    // Typed reception with both zones: the serve is drawn from where it started to the receiver.
    ballDirection: input.receiveCode.startZone && input.receiveCode.endZone
      ? ballDirectionFromZoneCodes('serve', input.servingTeam, input.receiveCode.startZone, input.receiveCode.endZone, input.displaySides)
      : undefined,
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
    /** Where each team is shown, so typed zones are drawn on the right half. */
    displaySides?: ScoutingDisplaySideAssignments;
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
        displaySides: context.displaySides,
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

/**
 * Basic input: the serve of the current rally, by the player in position 1
 * when the lineup knows them (otherwise no player, exported as 00). No
 * evaluation: its time only marks where the rally starts in the video.
 */
export function createBasicServeTouch(input: {
  servingTeam: TeamSide;
  servingLineup: ActiveLineup | null;
  recordedAtIso: string;
  recordedAtTime: string;
}): PendingTouch {
  const serverId = input.servingLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId;
  return {
    id: `touch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    playerId: serverId || undefined,
    teamSide: input.servingTeam,
    skill: 'serve',
    zone: getDefaultServeZone(input.servingTeam),
    source: 'explicit',
    touchOrigin: 'live_scouting',
    withoutZones: true,
    recordedAtTime: input.recordedAtTime,
    recordedAtIso: input.recordedAtIso,
  };
}
