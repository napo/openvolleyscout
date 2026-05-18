import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import type { ImplicitScoutingRules } from '@src/config/scouting/implicit-rules';
import {
  buildNextPendingTouch,
  isAce,
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
  return {
    ...touch,
    skill,
    evaluation: getDefaultEvaluationForSkill(skill),
    source: 'explicit',
    touchOrigin: 'live_scouting',
    requiredExplicitInput: undefined,
    inferredCandidate: undefined,
    pendingInference: undefined,
    inferenceReason: undefined,
    inferredFromTouchId: undefined,
  };
}

export function updatePendingTouchEvaluation(touch: PendingTouch, evaluation: SkillEvaluation): PendingTouch {
  return {
    ...touch,
    evaluation,
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
