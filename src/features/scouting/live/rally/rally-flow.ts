import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { ScoutingMode } from '@src/domain/scouting/types';
import {
  SCOUTING_SIDE_WIDTH,
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  type ScoutingZone,
} from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import { updateBallTrajectoryMetadata, type BallDirection, type BallTrajectory } from '@src/domain/trajectory';
import type { ImplicitScoutingRules } from '@src/config/scouting/implicit-rules';
import {
  buildNextPendingTouch,
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
import { normalizeScoutingMode } from '../../model/scouting-mode';
import type { TacticalCourtPlayer } from '../tactical/positioning/tactical-position-resolver';

export type CourtCoordinate = {
  x: number;
  y: number;
};

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
};

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

function isSameTouchIdentity(left: PendingTouch, right: PendingTouch): boolean {
  return (
    left.playerId === right.playerId
    && left.teamSide === right.teamSide
    && left.zone.id === right.zone.id
  );
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

export function isReceptionDrivenServePendingTouch(touch: PendingTouch | null | undefined): boolean {
  return touch?.skill === 'receive' && Boolean(touch.serveContext);
}

export function canSelectReceptionDrivenServeReceiver(
  touch: PendingTouch | null | undefined,
  teamSide: TeamSide,
): boolean {
  return !isReceptionDrivenServePendingTouch(touch) || touch?.teamSide === teamSide;
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

export function buildPendingTouchForZone(input: {
  zone: ScoutingZone;
  pendingTouch?: PendingTouch | null;
  previousTouch?: Pick<BallTouch, 'playerId' | 'teamSide' | 'skill' | 'evaluation'> | null;
  servingTeam?: TeamSide | null;
  servingPlayerId?: string | null;
  selectedPlayerId?: string | null;
  selectedTeamSide?: TeamSide | null;
  scoutingMode?: ScoutingMode;
  implicitRules?: ImplicitScoutingRules;
  teamPlayersBySide?: TeamTacticalPlayers;
}): PendingTouch | null {
  const nextPendingTouch = input.pendingTouch
    ? {
        ...input.pendingTouch,
        zone: input.zone,
      }
    : buildNextPendingTouch({
        zone: input.zone,
        previousTouch: input.previousTouch,
        servingTeam: input.servingTeam,
        servingPlayerId: input.servingPlayerId,
        selectedPlayerId: input.selectedPlayerId,
        selectedTeamSide: input.selectedTeamSide,
        scoutingMode: input.scoutingMode,
        implicitRules: input.implicitRules,
        teamPlayersBySide: input.teamPlayersBySide,
      });

  if (!nextPendingTouch) {
    return null;
  }

  return {
    ...nextPendingTouch,
    evaluation: input.pendingTouch && isSameTouchIdentity(input.pendingTouch, nextPendingTouch)
      ? input.pendingTouch.evaluation ?? nextPendingTouch.evaluation
      : nextPendingTouch.evaluation,
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
  scoutingMode: ScoutingMode,
): AttackBlockerSelection | null {
  const mode = normalizeScoutingMode(scoutingMode);
  if (
    (mode !== 'simple' && mode !== 'quick')
    || touch.skill !== 'attack'
    || (touch.evaluation !== '/' && touch.evaluation !== '!')
  ) {
    return null;
  }

  const blockingTeam = getOppositeTeamSide(touch.teamSide);
  // A! (block touch, rally continues) is only tracked in quick mode — simple/full mode handles each touch explicitly
  const isBlockPoint = touch.evaluation === '/';
  const isBlockTouch = touch.evaluation === '!' && mode === 'quick';
  if (!isBlockPoint && !isBlockTouch) {
    return null;
  }

  return {
    attackTouch: touch,
    blockingTeam,
    pointTeam: isBlockPoint ? blockingTeam : touch.teamSide,
    blockEvaluation: isBlockPoint ? '#' : '!',
    rallyContinues: isBlockTouch,
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
  const attackTouch: PendingTouch = {
    ...input.selection.attackTouch,
    id: attackTouchId,
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
    destinationPoint: input.selection.attackTouch.destinationPoint,
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
  const code = isBallTypeCodeAllowedForSkill(touch.skill, requestedCode)
    ? requestedCode
    : getDefaultBallTypeCodeForSkill(touch.skill);

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
  numBlockers: 0 | 1 | 2 | 3 | null | undefined,
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

export function isForcedOpeningServe(input: {
  currentRallyTouchCount: number;
  pendingTouch: PendingTouch | null;
}): boolean {
  return input.currentRallyTouchCount === 0 && input.pendingTouch?.skill === 'serve';
}
