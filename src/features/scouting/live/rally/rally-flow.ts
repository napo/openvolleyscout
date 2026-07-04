import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import {
  SCOUTING_SIDE_WIDTH,
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  type ScoutingZone,
} from '@src/domain/spatial';
import type { BallTouch, NumBlockers, TouchInferenceReason } from '@src/domain/touch/types';
import { updateBallTrajectoryMetadata, type BallDirection, type BallTrajectory } from '@src/domain/trajectory';
import {
  ATTACK_TO_DIG_EVALUATION,
  BLOCK_TO_ATTACK_EVALUATION,
  isAce,
  RECEIVE_TO_SERVE_EVALUATION,
  resolveAceFlow,
  type PendingTouch,
} from '../../model/datavolley-flow';
import {
  getDefaultBallTypeCodeForSkill,
  isBallTypeCodeAllowedForSkill,
  type DataVolleyBallTypeCode,
} from '../../model/datavolley-ball-types';
import { getDefaultEvaluationForSkill } from '../../model/touch-popup';
import {
  getOppositeTeamSide,
  resolveRallyOutcomeFromTouch,
} from '../../model/scoring-rules';
import { getZoneCode } from '../../model/datavolley-code';
import type { TacticalCourtPlayer } from '../tactical/positioning/tactical-position-resolver';

export type CourtCoordinate = {
  x: number;
  y: number;
};

function getZoneCodeForZone(zone: ScoutingZone): string {
  return getZoneCode({
    teamSide: zone.teamSide,
    zoneId: zone.id,
    gridCoordinate: zone.gridCoordinate,
    point: zone.center,
  });
}

export type RallyEndPreview = {
  pointTeam: TeamSide;
  reason: string;
};

export type AceVictimSelection = {
  serveTouch: PendingTouch;
  receivingTeam: TeamSide;
  pointTeam: TeamSide;
};

export type AttackBlockerSelection = {
  attackTouch: PendingTouch;
  blockingTeam: TeamSide;
  pointTeam: TeamSide;
  blockContactZone?: ScoutingZone;
  /** Evaluation recorded on the inferred block touch (e.g. '#' for A/, '!' for A!). */
  blockEvaluation: SkillEvaluation;
  /** When true the rally continues after blocker is selected (A! case); when false the rally ends. */
  rallyContinues: boolean;
  /** Deflection segment (block contact → landing point) when drawn geometrically. */
  blockDirection?: BallDirection;
  blockTrajectory?: BallTrajectory;
  blockDestinationPoint?: CourtCoordinate;
  /** When true the outcome was derived from the deflection geometry and no evaluation chip is shown. */
  autoResolve?: boolean;
};

/** Outcome of a block deflection segment, classified from where the ball lands (C&S §4.4.4). */
export type BlockDeflectionOutcome =
  | { kind: 'block_out'; blockEvaluation: '='; autoResolve: true; rallyContinues: false }
  | { kind: 'covered'; blockEvaluation: '!'; autoResolve: true; rallyContinues: true }
  | { kind: 'in_play'; blockEvaluation: '+'; autoResolve: false; rallyContinues: true };

export type TeamTacticalPlayers = Record<TeamSide, TacticalCourtPlayer[]>;

export type ReceptionDrivenServeEvaluationFlowResult =
  | {
      kind: 'touch_committed';
      touches: PendingTouch[];
    }
  | {
      kind: 'rally_ended';
      touches: PendingTouch[];
      preview: RallyEndPreview;
    };

export const MAX_AUTO_RECEIVER_STAGE_DISTANCE = 18;
export const ATTACK_BLOCK_INFERENCE_REASON = 'block_from_attack' as const;
/** DataVolley convention: attacks are recorded against a two-player block unless stated otherwise. */
export const DEFAULT_NUM_BLOCKERS: NumBlockers = 2;
export const ATTACK_DEFAULT_EVAL: SkillEvaluation = '+';

function createPendingTouchId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getPreviousRallyTouch(touches: readonly BallTouch[]): BallTouch | undefined {
  return touches.length > 0 ? touches[touches.length - 1] : undefined;
}

export function getServingPlayerId(players: readonly TacticalCourtPlayer[], servingTeam: TeamSide | null): string | null {
  if (!servingTeam) {
    return null;
  }

  return players.find((player) => player.courtPosition === 1)?.playerId ?? null;
}

export function getServingPlayerIdFromLineup(
  lineup: ActiveLineup | null | undefined,
  servingTeam: TeamSide | null,
): string | null {
  if (!servingTeam || !lineup || lineup.teamSide !== servingTeam) {
    return null;
  }

  return lineup.slots.find((slot) => slot.courtPosition === 1)?.playerId ?? null;
}

function getPointDistance(left: CourtCoordinate, right: CourtCoordinate): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function findNearestReceivingPlayer(input: {
  destinationPoint: CourtCoordinate;
  receivingTeam: TeamSide;
  teamPlayersBySide: TeamTacticalPlayers;
}): TacticalCourtPlayer | null {
  const receivingPlayers = input.teamPlayersBySide[input.receivingTeam] ?? [];

  return receivingPlayers.reduce<TacticalCourtPlayer | null>((nearestPlayer, player) => {
    if (!nearestPlayer) {
      return player;
    }

    return getPointDistance(player, input.destinationPoint) < getPointDistance(nearestPlayer, input.destinationPoint)
      ? player
      : nearestPlayer;
  }, null);
}

export function isReceivingPlayerCloseEnoughForAutoSelection(input: {
  destinationPoint: CourtCoordinate;
  receiver: TacticalCourtPlayer | null | undefined;
  maxDistance?: number;
}): boolean {
  if (!input.receiver) {
    return false;
  }

  return getPointDistance(input.receiver, input.destinationPoint) <= (
    input.maxDistance ?? MAX_AUTO_RECEIVER_STAGE_DISTANCE
  );
}

/** Find the nearest in-court zone to a court position (e.g. a player's current spot). */
export function findNearestZone(
  courtZones: ScoutingZone[],
  teamSide: TeamSide,
  position: CourtCoordinate,
): ScoutingZone | null {
  const inCourtZones = courtZones.filter((z) => z.kind === 'in_court' && z.teamSide === teamSide);
  if (inCourtZones.length === 0) return null;

  return inCourtZones.reduce<ScoutingZone>((nearest, candidate) => (
    getPointDistance(candidate.center, position) < getPointDistance(nearest.center, position)
      ? candidate
      : nearest
  ), inCourtZones[0]);
}

/**
 * Resolve which player an inferred SET should be assigned to: the team's
 * setter when exactly one is flagged (unambiguous), the first flagged setter
 * when two or more are (same guess the code already made before this existed),
 * or — when nobody is flagged as setter — the player nearest the release
 * point, mirroring the dig heuristic.
 */
export function resolveInferredSetterPlayer(input: {
  teamPlayersBySide: TeamTacticalPlayers;
  possessionTeam: TeamSide;
  destinationPoint: CourtCoordinate;
}): TacticalCourtPlayer | null {
  const players = input.teamPlayersBySide[input.possessionTeam] ?? [];
  const setters = players.filter((p) => p.isSetter);
  if (setters.length >= 1) {
    return setters[0];
  }

  return findNearestReceivingPlayer({
    destinationPoint: input.destinationPoint,
    receivingTeam: input.possessionTeam,
    teamPlayersBySide: input.teamPlayersBySide,
  });
}

/** Build an inferred SET touch (setter auto-assignment), untyped — the ball type/tempo is
 * backfilled later from the following attack, see `flushPendingInferredTouches`. */
export function buildInferredSetTouch(input: {
  teamPlayersBySide: TeamTacticalPlayers;
  possessionTeam: TeamSide;
  courtZones: ScoutingZone[];
  isGoodReception: boolean;
  destinationPoint: CourtCoordinate;
  inferenceReason: TouchInferenceReason;
  /** The set auto-assigned after a reception mirrors the reception's evaluation. */
  evaluation?: SkillEvaluation;
}): PendingTouch | null {
  const setter = resolveInferredSetterPlayer({
    teamPlayersBySide: input.teamPlayersBySide,
    possessionTeam: input.possessionTeam,
    destinationPoint: input.destinationPoint,
  });
  if (!setter || !input.courtZones.length) return null;

  const setterZone = findNearestZone(input.courtZones, input.possessionTeam, setter);
  if (!setterZone) return null;

  return {
    playerId: setter.playerId,
    teamSide: input.possessionTeam,
    skill: 'set',
    zone: setterZone,
    evaluation: input.evaluation ?? '+',
    setterCallCode: input.isGoodReception ? 'K1' : undefined,
    destinationPoint: { x: setter.x, y: setter.y },
    source: 'inferred',
    touchOrigin: 'implicit_inference',
    inferenceReason: input.inferenceReason,
  };
}

export function isReceptionDrivenServePendingTouch(touch: PendingTouch | null | undefined): boolean {
  return touch?.skill === 'receive' && Boolean(touch.serveContext);
}

export function canSelectReceptionDrivenServeReceiver(
  touch: PendingTouch | null | undefined,
  teamSide: TeamSide,
): boolean {
  return !isReceptionDrivenServePendingTouch(touch) || touch?.teamSide === teamSide;
}

const NET_X = SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH;
const NET_TOLERANCE = 2;
/** Wider band used to detect a mid-drag pause at the net (single continuous gesture). */
export const NET_DWELL_TOLERANCE = 5;
/** How long the ball must linger inside `NET_DWELL_TOLERANCE` before it counts as a block touch. */
export const NET_DWELL_MS = 180;

export function isBallReleaseOnNet(point: CourtCoordinate): boolean {
  return Math.abs(point.x - NET_X) <= NET_TOLERANCE
    && point.y >= SCOUTING_SURFACE_INSET_Y
    && point.y <= SCOUTING_SURFACE_INSET_Y + SCOUTING_SURFACE_HEIGHT;
}

export function isBallNearNet(x: number, tolerance: number = NET_TOLERANCE): boolean {
  return Math.abs(x - NET_X) <= tolerance;
}

export function isPointInsideCourtSurface(point: CourtCoordinate): boolean {
  return point.x >= SCOUTING_SURFACE_INSET_X
    && point.x <= SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH * 2
    && point.y >= SCOUTING_SURFACE_INSET_Y
    && point.y <= SCOUTING_SURFACE_INSET_Y + SCOUTING_SURFACE_HEIGHT;
}

/** Display side (left/right half of the stage) currently occupied by a team. */
export function getTeamDisplayCourtSide(
  teamSide: TeamSide,
  zones: readonly ScoutingZone[],
): 'left' | 'right' | null {
  const zone = zones.find((item) => item.kind === 'in_court' && item.teamSide === teamSide);
  if (!zone) {
    return null;
  }

  return zone.bounds.x + zone.bounds.width / 2 < 50 ? 'left' : 'right';
}

/** True when a drawn touch is released out of bounds past the net (attack out, C&S §4.4.3). */
export function isAttackOutRelease(input: {
  releasePoint: CourtCoordinate;
  attackerCourtSide: 'left' | 'right';
}): boolean {
  if (isPointInsideCourtSurface(input.releasePoint) || isBallReleaseOnNet(input.releasePoint)) {
    return false;
  }

  return input.attackerCourtSide === 'left'
    ? input.releasePoint.x > NET_X
    : input.releasePoint.x < NET_X;
}

/**
 * Classify a block deflection segment (drawn from the net contact point) by
 * where the ball lands. Returns null while the ball is still on the net.
 * DataVolley compound pairs are applied downstream: B= → A#, B! → A!, B+ → A-.
 */
export function classifyBlockDeflection(input: {
  releasePoint: CourtCoordinate;
  attackerCourtSide: 'left' | 'right';
}): BlockDeflectionOutcome | null {
  if (isBallReleaseOnNet(input.releasePoint)) {
    return null;
  }

  if (!isPointInsideCourtSurface(input.releasePoint)) {
    return { kind: 'block_out', blockEvaluation: '=', autoResolve: true, rallyContinues: false };
  }

  const landsLeft = input.releasePoint.x < NET_X;
  const landsInAttackerCourt = (input.attackerCourtSide === 'left') === landsLeft;

  return landsInAttackerCourt
    ? { kind: 'covered', blockEvaluation: '!', autoResolve: true, rallyContinues: true }
    : { kind: 'in_play', blockEvaluation: '+', autoResolve: false, rallyContinues: true };
}

/** Build the blocker selection for a geometrically drawn block deflection. */
export function createBlockDeflectionSelection(input: {
  attackTouch: PendingTouch;
  outcome: BlockDeflectionOutcome;
  blockDirection?: BallDirection | null;
  blockTrajectory?: BallTrajectory | null;
  destinationPoint: CourtCoordinate;
}): AttackBlockerSelection {
  return {
    attackTouch: input.attackTouch,
    blockingTeam: getOppositeTeamSide(input.attackTouch.teamSide),
    // block_out is the only deflection outcome that ends the rally: attacker point.
    pointTeam: input.attackTouch.teamSide,
    blockEvaluation: input.outcome.blockEvaluation,
    rallyContinues: input.outcome.rallyContinues,
    blockDirection: input.blockDirection ?? undefined,
    blockTrajectory: input.blockTrajectory ?? undefined,
    blockDestinationPoint: input.destinationPoint,
    autoResolve: input.outcome.autoResolve,
  };
}

function isPointInsideTeamCourt(point: CourtCoordinate, teamSide: TeamSide): boolean {
  const courtMinY = SCOUTING_SURFACE_INSET_Y;
  const courtMaxY = SCOUTING_SURFACE_INSET_Y + SCOUTING_SURFACE_HEIGHT;
  const awayMinX = SCOUTING_SURFACE_INSET_X;
  const awayMaxX = SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH;
  const homeMinX = awayMaxX;
  const homeMaxX = SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH * 2;

  if (point.y < courtMinY || point.y > courtMaxY) {
    return false;
  }

  return teamSide === 'away'
    ? point.x >= awayMinX && point.x < awayMaxX
    : point.x > homeMinX && point.x <= homeMaxX;
}

function isPointInsideDisplayedZoneCourt(point: CourtCoordinate, zone: ScoutingZone): boolean {
  if (zone.kind !== 'in_court') {
    return false;
  }

  const courtMinY = SCOUTING_SURFACE_INSET_Y;
  const courtMaxY = SCOUTING_SURFACE_INSET_Y + SCOUTING_SURFACE_HEIGHT;
  const leftSide = zone.bounds.x + zone.bounds.width / 2 < 50;
  const courtMinX = leftSide ? SCOUTING_SURFACE_INSET_X : SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH;
  const courtMaxX = leftSide
    ? SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH
    : SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH * 2;

  return (
    point.y >= courtMinY
    && point.y <= courtMaxY
    && (leftSide
      ? point.x >= courtMinX && point.x < courtMaxX
      : point.x > courtMinX && point.x <= courtMaxX)
  );
}

export function isServeReleaseInReceivingCourt(input: {
  destinationPoint: CourtCoordinate;
  servingTeam: TeamSide;
  receivingZone?: ScoutingZone | null;
}): boolean {
  const receivingTeam = getOppositeTeamSide(input.servingTeam);

  if (input.receivingZone) {
    return input.receivingZone.teamSide === receivingTeam
      && isPointInsideDisplayedZoneCourt(input.destinationPoint, input.receivingZone);
  }

  return isPointInsideTeamCourt(input.destinationPoint, receivingTeam);
}

export function buildServeErrorConfirmationTouch(input: {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  servingTeam: TeamSide;
  servingPlayerId: string;
  serveDirection?: BallDirection | null;
  serveTrajectory?: BallTrajectory | null;
  /** The server's own physical position, used for the DVW start-zone code (not `zone`, the error's landing point). */
  startZone?: ScoutingZone;
}): PendingTouch {
  const ballDirection = input.serveDirection ?? input.serveTrajectory?.direction;
  const trajectory = input.serveTrajectory
    ? updateBallTrajectoryMetadata(input.serveTrajectory, {
        teamSide: input.servingTeam,
        skill: 'serve',
        evaluation: '=',
      })
    : undefined;

  return {
    playerId: input.servingPlayerId,
    teamSide: input.servingTeam,
    skill: 'serve',
    zone: input.zone,
    evaluation: '=',
    destinationPoint: input.destinationPoint,
    ballDirection,
    trajectory,
    startZoneCode: input.startZone ? getZoneCodeForZone(input.startZone) : undefined,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
}

export function isServeErrorConfirmationPendingTouch(
  touch: PendingTouch | null | undefined,
  servingTeam?: TeamSide | null,
): boolean {
  return Boolean(
    touch
    && touch.skill === 'serve'
    && touch.evaluation === '='
    && (!servingTeam || touch.teamSide === servingTeam)
    && !isReceptionDrivenServePendingTouch(touch),
  );
}

export function buildReceptionDrivenServeReceiveTouch(input: {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  servingTeam: TeamSide;
  servingPlayerId: string;
  teamPlayersBySide: TeamTacticalPlayers;
  evaluation?: SkillEvaluation;
  serveDirection?: BallDirection | null;
  serveTrajectory?: BallTrajectory | null;
  /** The server's own physical position — distinct from `zone`, which is where the serve landed. */
  startZone?: ScoutingZone;
}): PendingTouch | null {
  if (input.zone.kind !== 'in_court') {
    return null;
  }

  if (!isServeReleaseInReceivingCourt({
    destinationPoint: input.destinationPoint,
    servingTeam: input.servingTeam,
    receivingZone: input.zone,
  })) {
    return null;
  }

  const receivingTeam = getOppositeTeamSide(input.servingTeam);
  if (input.zone.teamSide !== receivingTeam) {
    return null;
  }

  const receiver = findNearestReceivingPlayer({
    destinationPoint: input.destinationPoint,
    receivingTeam,
    teamPlayersBySide: input.teamPlayersBySide,
  });

  if (!receiver) {
    return null;
  }

  if (!isReceivingPlayerCloseEnoughForAutoSelection({
    destinationPoint: input.destinationPoint,
    receiver,
  })) {
    return null;
  }

  return {
    playerId: receiver.playerId,
    teamSide: receivingTeam,
    skill: 'receive',
    zone: input.zone,
    evaluation: input.evaluation ?? getDefaultEvaluationForSkill('receive'),
    destinationPoint: input.destinationPoint,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    serveContext: {
      playerId: input.servingPlayerId,
      teamSide: input.servingTeam,
      zone: input.zone,
      destinationPoint: input.destinationPoint,
      ballDirection: input.serveDirection ?? input.serveTrajectory?.direction,
      trajectory: input.serveTrajectory ?? undefined,
      startZone: input.startZone,
    },
  };
}

export function buildReceptionTouchForSelectedPlayer(input: {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  servingTeam: TeamSide;
  servingPlayerId: string;
  playerId: string;
  receivingTeam: TeamSide;
  evaluation?: SkillEvaluation;
  serveDirection?: BallDirection | null;
  serveTrajectory?: BallTrajectory | null;
  /** The server's own physical position — distinct from `zone`, which is where the serve landed. */
  startZone?: ScoutingZone;
}): PendingTouch {
  return {
    playerId: input.playerId,
    teamSide: input.receivingTeam,
    skill: 'receive',
    zone: input.zone,
    evaluation: input.evaluation ?? getDefaultEvaluationForSkill('receive'),
    destinationPoint: input.destinationPoint,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    serveContext: {
      playerId: input.servingPlayerId,
      teamSide: input.servingTeam,
      zone: input.zone,
      destinationPoint: input.destinationPoint,
      ballDirection: input.serveDirection ?? input.serveTrajectory?.direction,
      trajectory: input.serveTrajectory ?? undefined,
      startZone: input.startZone,
    },
  };
}

export function buildManualServeReceiveTouchFromServeError(input: {
  serveErrorTouch: PendingTouch;
  playerId: string;
  teamSide: TeamSide;
}): PendingTouch | null {
  if (input.serveErrorTouch.skill !== 'serve' || input.serveErrorTouch.evaluation !== '=') {
    return null;
  }

  if (input.teamSide === input.serveErrorTouch.teamSide) {
    return null;
  }

  if (!input.serveErrorTouch.playerId) {
    return null;
  }

  return {
    playerId: input.playerId,
    teamSide: input.teamSide,
    skill: 'receive',
    zone: input.serveErrorTouch.zone,
    evaluation: getDefaultEvaluationForSkill('receive'),
    destinationPoint: input.serveErrorTouch.destinationPoint,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    skillTypeCode: input.serveErrorTouch.skillTypeCode,
    serveContext: {
      playerId: input.serveErrorTouch.playerId,
      teamSide: input.serveErrorTouch.teamSide,
      zone: input.serveErrorTouch.zone,
      destinationPoint: input.serveErrorTouch.destinationPoint,
      ballDirection: input.serveErrorTouch.ballDirection ?? input.serveErrorTouch.trajectory?.direction,
      trajectory: input.serveErrorTouch.trajectory,
    },
  };
}

export type EvaluationFlowResult =
  | {
      kind: 'awaiting_ace_target';
      selection: AceVictimSelection;
    }
  | {
      kind: 'rally_ended';
      touch: PendingTouch;
      preview: RallyEndPreview;
    }
  | {
      kind: 'touch_pending';
      touch: PendingTouch;
    };

export function resolveEvaluationFlow(touch: PendingTouch): EvaluationFlowResult {
  if (isAce(touch)) {
    const receivingTeam = getOppositeTeamSide(touch.teamSide);

    return {
      kind: 'awaiting_ace_target',
      selection: {
        serveTouch: touch,
        receivingTeam,
        pointTeam: touch.teamSide,
      },
    };
  }

  const outcome = resolveRallyOutcomeFromTouch(touch);
  if (outcome.kind === 'point') {
    return {
      kind: 'rally_ended',
      touch,
      preview: {
        pointTeam: outcome.pointTeam,
        reason: outcome.reason,
      },
    };
  }

  return {
    kind: 'touch_pending',
    touch,
  };
}

export function createAttackBlockerSelection(
  touch: PendingTouch,
): AttackBlockerSelection | null {
  if (touch.skill !== 'attack' || (touch.evaluation !== '/' && touch.evaluation !== '!')) {
    return null;
  }

  const blockingTeam = getOppositeTeamSide(touch.teamSide);
  const isBlockPoint = touch.evaluation === '/';

  return {
    attackTouch: touch,
    blockingTeam,
    pointTeam: isBlockPoint ? blockingTeam : touch.teamSide,
    blockEvaluation: isBlockPoint ? '#' : '!',
    rallyContinues: !isBlockPoint,
    // A/ and A! already fix the block outcome (B# kill / B! touch) — tapping the
    // blocker resolves immediately, no evaluation chip (tutorial steps 16→17).
    autoResolve: true,
  };
}

export function getValidAttackBlockers(input: {
  selection: AttackBlockerSelection | null | undefined;
  teamPlayersBySide: TeamTacticalPlayers;
}): TacticalCourtPlayer[] {
  if (!input.selection) {
    return [];
  }

  return input.teamPlayersBySide[input.selection.blockingTeam].filter((player) => (
    (player.courtPosition === 2 || player.courtPosition === 3 || player.courtPosition === 4)
    && !player.isLibero
  ));
}

export function canSelectAttackBlocker(input: {
  selection: AttackBlockerSelection | null | undefined;
  playerId: string;
  teamSide: TeamSide;
  teamPlayersBySide: TeamTacticalPlayers;
}): boolean {
  if (!input.selection || input.teamSide !== input.selection.blockingTeam) {
    return false;
  }

  return getValidAttackBlockers({
    selection: input.selection,
    teamPlayersBySide: input.teamPlayersBySide,
  }).some((player) => player.playerId === input.playerId);
}

export function resolveAttackBlockerSelection(input: {
  selection: AttackBlockerSelection;
  playerId: string;
  teamSide: TeamSide;
  teamPlayersBySide: TeamTacticalPlayers;
}): {
  touches: PendingTouch[];
  pointTeam: TeamSide;
  reason: typeof ATTACK_BLOCK_INFERENCE_REASON;
} | null {
  if (!canSelectAttackBlocker(input)) {
    return null;
  }

  const attackTouchId = input.selection.attackTouch.id ?? createPendingTouchId('touch-attack');
  const blockTouchId = createPendingTouchId('touch-block');
  // DataVolley compound table: the attack effect is derived from the block effect
  // (B# ↔ A/, B= ↔ A#, B+ ↔ A-, B- ↔ A+, B! ↔ A!). B/ (invasion) keeps the attack as recorded.
  const attackEvaluation = BLOCK_TO_ATTACK_EVALUATION[input.selection.blockEvaluation]
    ?? input.selection.attackTouch.evaluation;
  const attackTouch: PendingTouch = {
    ...input.selection.attackTouch,
    id: attackTouchId,
    evaluation: attackEvaluation,
    trajectory: input.selection.attackTouch.trajectory && attackEvaluation
      ? updateBallTrajectoryMetadata(input.selection.attackTouch.trajectory, { evaluation: attackEvaluation })
      : input.selection.attackTouch.trajectory,
    source: input.selection.attackTouch.source ?? 'explicit',
    touchOrigin: input.selection.attackTouch.touchOrigin ?? 'live_scouting',
    pendingInference: false,
  };
  const blockTouch: PendingTouch = {
    id: blockTouchId,
    playerId: input.playerId,
    teamSide: input.selection.blockingTeam,
    skill: 'block',
    evaluation: input.selection.blockEvaluation,
    zone: input.selection.blockContactZone ?? input.selection.attackTouch.zone,
    destinationPoint: input.selection.blockDestinationPoint ?? input.selection.attackTouch.destinationPoint,
    ballDirection: input.selection.blockDirection,
    trajectory: input.selection.blockTrajectory
      ? updateBallTrajectoryMetadata(input.selection.blockTrajectory, {
          teamSide: input.selection.blockingTeam,
          skill: 'block',
          evaluation: input.selection.blockEvaluation,
        })
      : undefined,
    // C&S §4.1.1: the block inherits the ball type of the attack it touched.
    skillTypeCode: input.selection.attackTouch.skillTypeCode ?? input.selection.attackTouch.attackType,
    numBlockers: input.selection.attackTouch.numBlockers,
    source: 'inferred',
    touchOrigin: 'implicit_inference',
    requiredExplicitInput: false,
    inferredCandidate: true,
    pendingInference: false,
    inferenceReason: ATTACK_BLOCK_INFERENCE_REASON,
    inferredFromTouchId: attackTouchId,
  };

  return {
    touches: [attackTouch, blockTouch],
    pointTeam: input.selection.pointTeam,
    reason: ATTACK_BLOCK_INFERENCE_REASON,
  };
}

export function buildReceptionDrivenServeTouches(receiveTouch: PendingTouch): PendingTouch[] | null {
  if (!isReceptionDrivenServePendingTouch(receiveTouch) || !receiveTouch.serveContext || !receiveTouch.evaluation) {
    return null;
  }

  const serveEvaluation = RECEIVE_TO_SERVE_EVALUATION[receiveTouch.evaluation];
  const serveTrajectory = receiveTouch.serveContext.trajectory
    ? updateBallTrajectoryMetadata(receiveTouch.serveContext.trajectory, {
        teamSide: receiveTouch.serveContext.teamSide,
        skill: 'serve',
        evaluation: serveEvaluation,
      })
    : undefined;
  const serveTouch: PendingTouch = {
    playerId: receiveTouch.serveContext.playerId,
    teamSide: receiveTouch.serveContext.teamSide,
    skill: 'serve',
    zone: receiveTouch.serveContext.zone,
    evaluation: serveEvaluation,
    destinationPoint: receiveTouch.serveContext.destinationPoint,
    ballDirection: receiveTouch.serveContext.ballDirection ?? serveTrajectory?.direction,
    trajectory: serveTrajectory,
    startZoneCode: receiveTouch.serveContext.startZone
      ? getZoneCodeForZone(receiveTouch.serveContext.startZone)
      : undefined,
    serveType: receiveTouch.skillTypeCode,
    skillTypeCode: receiveTouch.skillTypeCode,
    source: 'inferred',
    touchOrigin: 'implicit_inference',
    requiredExplicitInput: false,
    inferredCandidate: true,
    pendingInference: false,
    inferenceReason: 'serve_from_reception',
  };
  const explicitReceiveTouch: PendingTouch = {
    ...receiveTouch,
    trajectory: undefined,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    requiredExplicitInput: undefined,
    inferredCandidate: false,
    pendingInference: false,
    inferenceReason: undefined,
    inferredFromTouchId: undefined,
    ballDirection: undefined,
    serveContext: undefined,
    skillTypeCode: receiveTouch.skillTypeCode,
  };

  return [serveTouch, explicitReceiveTouch];
}

export function resolveReceptionDrivenServeEvaluationFlow(
  receiveTouch: PendingTouch,
): ReceptionDrivenServeEvaluationFlowResult | null {
  const touches = buildReceptionDrivenServeTouches(receiveTouch);
  if (!touches) {
    return null;
  }

  const [serveTouch] = touches;
  const outcome = serveTouch.evaluation === '#'
    ? resolveRallyOutcomeFromTouch(serveTouch)
    : { kind: 'continue' as const };
  if (outcome.kind === 'point') {
    return {
      kind: 'rally_ended',
      touches,
      preview: {
        pointTeam: outcome.pointTeam,
        reason: outcome.reason,
      },
    };
  }

  return {
    kind: 'touch_committed',
    touches,
  };
}

export function resolveAceVictimFlow(input: {
  selection: AceVictimSelection;
  playerId: string;
  teamSide: TeamSide;
}): {
  touches: PendingTouch[];
  pointTeam: TeamSide;
  reason: 'ace';
} | null {
  if (input.teamSide !== input.selection.receivingTeam) {
    return null;
  }

  const resolvedAce = resolveAceFlow({
    serveTouch: input.selection.serveTouch,
    playerId: input.playerId,
    teamSide: input.teamSide,
  });

  if (!resolvedAce) {
    return null;
  }

  return {
    ...resolvedAce,
    reason: 'ace',
  };
}

export function updatePendingTouchSkill(touch: PendingTouch, skill: SkillType): PendingTouch {
  const evaluation = getDefaultEvaluationForSkill(skill);

  return {
    ...touch,
    skill,
    evaluation,
    attackType: undefined,
    setType: undefined,
    serveType: undefined,
    skillTypeCode: undefined,
    trajectory: touch.trajectory
      ? updateBallTrajectoryMetadata(touch.trajectory, { skill, evaluation })
      : touch.trajectory,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    requiredExplicitInput: undefined,
    inferredCandidate: undefined,
    pendingInference: undefined,
    inferenceReason: undefined,
    inferredFromTouchId: undefined,
    serveContext: undefined,
  };
}

function getBallTypeFieldsForSkill(
  skill: SkillType,
  code: DataVolleyBallTypeCode,
): Pick<PendingTouch, 'attackType' | 'setType' | 'serveType' | 'skillTypeCode'> {
  return {
    attackType: skill === 'attack' ? code : undefined,
    setType: skill === 'set' ? code : undefined,
    serveType: skill === 'serve' ? code : undefined,
    skillTypeCode: code,
  };
}

export function updatePendingTouchBallTypeCode(
  touch: PendingTouch,
  requestedCode: DataVolleyBallTypeCode | null | undefined,
): PendingTouch {
  // Only apply a code when one is explicitly provided; never fall through to a default.
  const code = requestedCode && isBallTypeCodeAllowedForSkill(touch.skill, requestedCode)
    ? requestedCode
    : null;

  if (!code) {
    return {
      ...touch,
      attackType: undefined,
      setType: undefined,
      serveType: undefined,
      skillTypeCode: undefined,
    };
  }

  return {
    ...touch,
    ...getBallTypeFieldsForSkill(touch.skill, code),
  };
}

export function updatePendingTouchEvaluation(touch: PendingTouch, evaluation: SkillEvaluation): PendingTouch {
  return {
    ...touch,
    evaluation,
    trajectory: touch.trajectory
      ? updateBallTrajectoryMetadata(touch.trajectory, { evaluation })
      : touch.trajectory,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    requiredExplicitInput: undefined,
    inferredCandidate: undefined,
    pendingInference: undefined,
    inferenceReason: undefined,
    inferredFromTouchId: undefined,
  };
}

export function updatePendingTouchNumBlockers(
  touch: PendingTouch,
  numBlockers: NumBlockers | null | undefined,
): PendingTouch {
  return {
    ...touch,
    numBlockers: touch.skill === 'attack' ? numBlockers ?? undefined : undefined,
  };
}

export function updatePendingTouchSelection(
  touch: PendingTouch,
  nextPlayerId: string,
  nextTeamSide: TeamSide,
): PendingTouch {
  return {
    ...touch,
    playerId: nextPlayerId,
    teamSide: nextTeamSide,
    trajectory: touch.trajectory
      ? updateBallTrajectoryMetadata(touch.trajectory, { teamSide: nextTeamSide })
      : touch.trajectory,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    requiredExplicitInput: undefined,
    inferredCandidate: undefined,
    pendingInference: undefined,
    inferenceReason: undefined,
    inferredFromTouchId: undefined,
  };
}

export function getPopupAvoidPoints(input: {
  popupAnchor: CourtCoordinate | null;
  pendingTouch: PendingTouch | null;
  teamPlayersBySide: TeamTacticalPlayers;
}): CourtCoordinate[] {
  const points: CourtCoordinate[] = [];
  if (input.popupAnchor) {
    points.push(input.popupAnchor);
  }

  if (input.pendingTouch) {
    const pendingPlayer = input.teamPlayersBySide[input.pendingTouch.teamSide].find((player) => (
      player.playerId === input.pendingTouch?.playerId
    ));
    if (pendingPlayer) {
      points.push({ x: pendingPlayer.x, y: pendingPlayer.y });
    }
  }

  return points;
}

export function getPlayerOptions(players: readonly TacticalCourtPlayer[]): Array<{ playerId: string; label: string }> {
  return players.map((player) => ({
    playerId: player.playerId,
    label: String(player.jerseyNumber),
  }));
}

/** Loosened touch shape accepted where only skill/team/evaluation are needed (BallTouch or PendingTouch). */
export type EffectiveTouch = Pick<BallTouch, 'skill' | 'teamSide' | 'evaluation'> & {
  /** Who performed the touch, when known — used to exclude the previous toucher
   * from the next same-team player selection (double-contact rule). */
  playerId?: string;
};

/** The context a trajectory is classified into, right before the scout picks who performed it. */
export type AwaitingPlayerDefaultsInput = {
  determinedSkill: SkillType;
  destinationPoint: CourtCoordinate;
  possessionTeam: TeamSide;
  /** Evaluation forced by the drawn geometry (e.g. '=' for an attack landing out). */
  autoEvaluation?: SkillEvaluation | null;
};

/**
 * Compute the evaluation/combination-code defaults a freshly drawn trajectory
 * should start with — BEFORE the scout picks who performed the touch — so
 * that whatever is (or isn't) edited on the draft while awaiting player
 * selection can be locked in verbatim once a player is tapped (see
 * `lockPlayerOntoAwaitingTouch`). DataVolley convention: a set/attack combo
 * code is only meaningful after a good reception or a set.
 */
export function resolveAwaitingPlayerDefaults(
  ctx: AwaitingPlayerDefaultsInput,
  previousTouch: EffectiveTouch | undefined,
): { evaluation: SkillEvaluation; combinationCode?: string; setterCallCode?: string } {
  const isGoodReception = previousTouch?.skill === 'receive'
    ? (previousTouch.evaluation === '#' || previousTouch.evaluation === '+')
    : previousTouch?.skill === 'set';

  if (ctx.determinedSkill === 'attack') {
    const isOut = ctx.autoEvaluation === '=';
    const isOnNet = isBallReleaseOnNet(ctx.destinationPoint);
    const evaluation: SkillEvaluation = isOut ? '=' : isOnNet ? '/' : ATTACK_DEFAULT_EVAL;
    return { evaluation, combinationCode: isGoodReception ? 'K1' : undefined };
  }

  if (ctx.determinedSkill === 'set') {
    // A set drawn right after a reception mirrors the reception's evaluation
    // (passed in as autoEvaluation), same as the auto-assigned set it replaces.
    return {
      evaluation: ctx.autoEvaluation ?? getDefaultEvaluationForSkill('set'),
      setterCallCode: isGoodReception ? 'K1' : undefined,
    };
  }

  if (ctx.determinedSkill === 'dig') {
    const compoundEvaluation = previousTouch?.skill === 'attack'
      && previousTouch.teamSide !== ctx.possessionTeam
      && previousTouch.evaluation
      ? ATTACK_TO_DIG_EVALUATION[previousTouch.evaluation]
      : undefined;
    return { evaluation: compoundEvaluation ?? getDefaultEvaluationForSkill('dig') };
  }

  return { evaluation: getDefaultEvaluationForSkill(ctx.determinedSkill) };
}

/**
 * Lock a player selection onto an already-drafted awaiting-player touch,
 * preserving whatever evaluation/combination-code/ball-type/blocker-count the
 * scout edited while the trajectory was awaiting a player (the whole point of
 * letting them freely adjust it beforehand). Only fills in what genuinely
 * cannot be known before a player exists: the player's physical start zone
 * (`startZoneCode` for attack, `zone` for set/dig/freeball/cover).
 */
export function lockPlayerOntoAwaitingTouch(input: {
  pendingTouch: PendingTouch;
  playerId: string;
  teamSide: TeamSide;
  determinedSkill: SkillType;
  awaitingZone: ScoutingZone;
  player: TacticalCourtPlayer | undefined;
  courtZones: ScoutingZone[] | undefined;
  /** Override when locking in an inferred touch (redraw-instead-of-select) rather than an explicit tap. */
  source?: PendingTouch['source'];
  inferenceReason?: PendingTouch['inferenceReason'];
}): PendingTouch {
  const nearestZone = (input.player && input.courtZones)
    ? findNearestZone(input.courtZones, input.teamSide, input.player)
    : null;
  const startZone = nearestZone ?? input.awaitingZone;

  let touch = updatePendingTouchSelection(input.pendingTouch, input.playerId, input.teamSide);

  if (input.determinedSkill === 'attack') {
    const physicalStartSide = startZone.center.x < 50 ? 'away' as const : 'home' as const;
    touch = {
      ...touch,
      startZoneCode: getZoneCode({
        teamSide: physicalStartSide,
        zoneId: startZone.id,
        gridCoordinate: startZone.gridCoordinate,
        point: startZone.center,
      }),
    };
  } else if (
    input.determinedSkill === 'set'
    || input.determinedSkill === 'dig'
    || input.determinedSkill === 'freeball'
    || input.determinedSkill === 'cover'
  ) {
    touch = { ...touch, zone: startZone };
  }

  if (input.source) {
    touch = {
      ...touch,
      source: input.source,
      touchOrigin: input.source === 'inferred' ? 'implicit_inference' : 'live_scouting',
      inferenceReason: input.inferenceReason,
    };
  }

  return touch;
}

/**
 * Flush touches deferred while awaiting a following fundamental to type them
 * correctly (today: an inferred SET, which per DataVolley convention inherits
 * its ball type/tempo from the ATTACK that follows it, not a fixed default).
 * If the incoming commit includes a matching attack, backfill the pending
 * touch's type from it; otherwise (the rally resolved some other way) commit
 * it as-is, untyped.
 */
export function flushPendingInferredTouches(
  pendingInferred: PendingTouch[],
  incomingTouches: PendingTouch[],
): PendingTouch[] {
  if (pendingInferred.length === 0) return [];

  return pendingInferred.map((touch) => {
    const attackTouch = incomingTouches.find((t) => t.skill === 'attack' && t.teamSide === touch.teamSide);
    const inheritedType = attackTouch?.skillTypeCode ?? attackTouch?.attackType;
    if (!inheritedType) return touch;

    return { ...touch, setType: inheritedType, skillTypeCode: inheritedType };
  });
}

/** The reconstructed pre-selection context for an attack (or the block's originating attack). */
export type ReconstructedAwaitingPlayerContext = {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  possessionTeam: TeamSide;
  determinedSkill: SkillType;
  ballDirection?: BallDirection;
  trajectory?: BallTrajectory;
};

/**
 * Rebuild a fresh "awaiting player" context from a declined-point snapshot, so
 * "Cambia valutazione" can revert all the way back to before the attacker (or
 * blocker) was selected, rather than just reopening the post-selection eval
 * chip. Only attack and block go through an explicit awaiting-player step
 * before ending a rally, so every other terminal path (serve error, ace,
 * reception error, ...) returns null and callers should fall back to
 * restoring the snapshot verbatim.
 */
export function reconstructAwaitingPlayerContextFromSnapshot(input: {
  pendingTouch: PendingTouch | null;
  blockerSelection: AttackBlockerSelection | null;
}): ReconstructedAwaitingPlayerContext | null {
  // Block case: the blocker-selection's `attackTouch` still carries the
  // original attack's geometry — NOT `blockerSelection` itself, whose own
  // ball-position/trajectory fields (when present) describe the block
  // deflection segment, not the attack that preceded it.
  if (input.blockerSelection) {
    const { attackTouch } = input.blockerSelection;
    if (!attackTouch.destinationPoint) return null;

    return {
      zone: attackTouch.zone,
      destinationPoint: attackTouch.destinationPoint,
      possessionTeam: attackTouch.teamSide,
      determinedSkill: 'attack',
      ballDirection: attackTouch.ballDirection,
      trajectory: attackTouch.trajectory,
    };
  }

  // Attack case (attack_eval phase): the attack is still sitting in pendingTouch.
  if (input.pendingTouch?.skill === 'attack' && input.pendingTouch.destinationPoint) {
    return {
      zone: input.pendingTouch.zone,
      destinationPoint: input.pendingTouch.destinationPoint,
      possessionTeam: input.pendingTouch.teamSide,
      determinedSkill: 'attack',
      ballDirection: input.pendingTouch.ballDirection,
      trajectory: input.pendingTouch.trajectory,
    };
  }

  return null;
}

export function isForcedOpeningServe(input: {
  currentRallyTouchCount: number;
  pendingTouch: PendingTouch | null;
}): boolean {
  return input.currentRallyTouchCount === 0 && input.pendingTouch?.skill === 'serve';
}
