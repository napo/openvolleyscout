import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import { updateBallTrajectoryMetadata, type BallTrajectory } from '@src/domain/trajectory';
import type { ImplicitScoutingRules } from '@src/config/scouting/implicit-rules';
import {
  buildNextPendingTouch,
  isAce,
  RECEIVE_TO_SERVE_EVALUATION,
  resolveAceFlow,
  type PendingTouch,
} from '../../model/datavolley-flow';
import { getDefaultEvaluationForSkill } from '../../model/touch-popup';
import {
  getOppositeTeamSide,
  resolveRallyOutcomeFromTouch,
} from '../../model/scoring-rules';
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

export function getPreviousRallyTouch(touches: readonly BallTouch[]): BallTouch | undefined {
  return touches.length > 0 ? touches[touches.length - 1] : undefined;
}

export function getServingPlayerId(players: readonly TacticalCourtPlayer[], servingTeam: TeamSide | null): string | null {
  if (!servingTeam) {
    return null;
  }

  return players.find((player) => player.courtPosition === 1)?.playerId ?? null;
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

export function isReceptionDrivenServePendingTouch(touch: PendingTouch | null | undefined): boolean {
  return touch?.skill === 'receive' && Boolean(touch.serveContext);
}

export function canSelectReceptionDrivenServeReceiver(
  touch: PendingTouch | null | undefined,
  teamSide: TeamSide,
): boolean {
  return !isReceptionDrivenServePendingTouch(touch) || touch?.teamSide === teamSide;
}

export function buildReceptionDrivenServeReceiveTouch(input: {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  servingTeam: TeamSide;
  servingPlayerId: string;
  teamPlayersBySide: TeamTacticalPlayers;
  evaluation?: SkillEvaluation;
  serveTrajectory?: BallTrajectory | null;
}): PendingTouch | null {
  if (input.zone.kind !== 'in_court') {
    return null;
  }

  const receivingTeam = getOppositeTeamSide(input.servingTeam);
  const receiver = findNearestReceivingPlayer({
    destinationPoint: input.destinationPoint,
    receivingTeam,
    teamPlayersBySide: input.teamPlayersBySide,
  });

  if (!receiver) {
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
      trajectory: input.serveTrajectory ?? undefined,
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
    trajectory: serveTrajectory,
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
    serveContext: undefined,
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
  const outcome = resolveRallyOutcomeFromTouch(serveTouch);
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
