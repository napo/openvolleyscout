// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import { getDefaultServeStartZoneForTeam, type ScoutingZone } from '@src/domain/spatial';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import {
  createBallDirection,
  createBallTrajectory,
  type BallDirection,
  type BallTrajectory,
} from '@src/domain/trajectory';
import { RECEIVE_TO_SERVE_EVALUATION, type PendingTouch } from '../../model/datavolley-flow';
import { getOppositeTeamSide } from '../../model/scoring-rules';
import type { AwaitingReceiverContext } from './live-touch-flow-store';
import {
  ATTACK_DEFAULT_EVAL,
  buildServeErrorConfirmationTouch,
  isServeReleaseInReceivingCourt,
  resolveAwaitingPlayerDefaults,
  type AceVictimSelection,
  type AttackBlockerSelection,
  type CourtCoordinate,
  type EffectiveTouch,
  type TeamTacticalPlayers,
} from '../rally/rally-flow';
import type { DataVolleyBallTypeCode } from '../../model/datavolley-ball-types';



// ─── Phase definition ─────────────────────────────────────────────────────────

/**
 * Phases of the Quick Scout flow.
 *
 * serve_drawing       → server pre-selected, user drags ball to endpoint
 * reception_confirm   → receiver selected, eval chip shown; picking an eval commits
 *                       the reception and auto-assigns the set (tutorial step 5);
 *                       drawing directly commits with the current eval instead
 * play_ready          → general play state: user draws trajectory to determine next skill
 * attack_player_selected → attacker tapped directly (player-first, C&S §4.4.3): ball
 *                       moves onto them; a tap/drag in their own court redefines the
 *                       start point (repeatable), a tap/drag into the opponent's court
 *                       or onto the net commits the attack using the pinned start
 * awaiting_player     → trajectory drawn, user taps player. Carries determinedSkill
 *                       (dig/set only - attack now enters via attack_player_selected;
 *                       this path stays as a fallback if a trajectory crossing the net
 *                       is drawn before any player is tapped)
 * attack_eval         → attack eval chip; drawing the next trajectory implicitly
 *                       commits the attack with the current (+/-) evaluation
 * awaiting_ace_target → serve with eval # → select ace victim
 * blocker_select      → tap the blocker player (resolves immediately) or draw the
 *                       deflection segment from the net contact
 * block_eval          → deflection kept in play by the blocking team: + / - chip for
 *                       the block (default +); drawing the next trajectory confirms it
 * rally_ended         → terminal state before reset
 * awaiting_action_reset → point declined ("Annulla"): waiting for the store undo
 *                       to propagate so the correct idle/play_ready phase can be resolved
 */
export type QuickScoutPhase =
  | 'idle'
  | 'serve_drawing'
  | 'reception_confirm'
  | 'play_ready'
  | 'attack_player_selected'
  | 'awaiting_player'
  | 'attack_eval'
  | 'awaiting_ace_target'
  | 'blocker_select'
  | 'block_eval'
  | 'rally_ended'
  | 'awaiting_action_reset';

// ─── Awaiting player context ─────────────────────────────────────────────────

export type AwaitingPlayerContext = {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  possessionTeam: TeamSide;
  determinedSkill: SkillType;
  ballDirection?: BallDirection | null;
  trajectory?: BallTrajectory | null;
  /** Evaluation forced by the context (e.g. '=' for an attack landing out, or the
   * reception's evaluation mirrored onto the set that follows it). */
  autoEvaluation?: SkillEvaluation | null;
  /** Players who cannot perform this touch (double-contact rule: the receiver
   * cannot also be the setter). Excluded from the selection rings and taps. */
  excludedPlayerIds?: string[];
};

/**
 * Snapshot of the local flow state taken right before a terminal action is
 * committed, so a declined point confirmation ("No") can either reopen the
 * exact same decision ("Cambia valutazione") or reset to a neutral state
 * ("Annulla") once the corresponding store-level undo has run.
 */
export type QuickScoutStateSnapshot = {
  phase: QuickScoutPhase;
  pendingTouch: PendingTouch | null;
  evalChip: QuickEvalChip | null;
  blockerSelection: AttackBlockerSelection | null;
  aceVictimSelection: AceVictimSelection | null;
  awaitingPlayerContext: AwaitingPlayerContext | null;
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  possessionTeam: TeamSide | null;
  teamTouchCount: number;
  pendingBallPosition: CourtCoordinate | null;
  pendingTrajectory: BallTrajectory | null;
};

// ─── Selection ring colors ───────────────────────────────────────────────────

export type SelectionRingColor = 'viola' | 'green' | 'orange' | 'red' | 'pink' | null;

// ─── Eval chip ────────────────────────────────────────────────────────────────

export type QuickEvalChip = {
  options: SkillEvaluation[];
  current: SkillEvaluation;
};

export const RECEPTION_EVAL_OPTIONS: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];
export const ATTACK_EVAL_OPTIONS: SkillEvaluation[] = ['#', '+', '-', '/', '!'];
/** Deflection landing in the blocker's court: the blocking team plays on, well (B+) or badly (B-). */
/** Non-scoring skills whose '=' error still ends the rally (point to the opponent). */
export const RALLY_ENDING_ERROR_SKILLS = new Set<SkillType>(['set', 'dig', 'freeball', 'cover']);
export const BLOCK_DEFLECTION_EVAL_OPTIONS: SkillEvaluation[] = ['+', '-', '/', '='];
export const BLOCK_POINT_EVAL_OPTIONS: SkillEvaluation[] = ['#', '=', '/'];

/** Blocker already tapped, block evaluation still open on the + / - chip. */
export type PendingBlockEvaluation = {
  selection: AttackBlockerSelection;
  playerId: string;
};
export const RECEPTION_DEFAULT_EVAL: SkillEvaluation = '+';

/** The set auto-assigned right after a reception (tutorial step 5): kept as the
 * visible pending touch so the toolbar shows it and the scout can adjust or
 * redefine it, but not committed yet - its ball type is backfilled from the
 * attack that follows (see flushPendingInferredTouches). */
export function isDeferredInferredSet(touch: PendingTouch | null | undefined): boolean {
  return touch?.skill === 'set' && touch.source === 'inferred' && Boolean(touch.playerId);
}

// ─── Controller input ─────────────────────────────────────────────────────────

export type QuickScoutControllerInput = {
  currentRallyTouches: readonly BallTouch[];
  teamPlayersBySide: TeamTacticalPlayers;
  sidelinePlayersBySide?: TeamTacticalPlayers;
  servingTeam: TeamSide | null;
  servingPlayerId: string | null;
  isRallyActive: boolean;
  courtZones?: ScoutingZone[];
  /** The serve-start zone the server is currently positioned on (explicit lane tap, or rotation default). */
  activeServeStartZone?: ScoutingZone | null;
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  onAceVictimSelectionChange?: (isSelecting: boolean) => void;
  /** Grouped undo of the last committed action, used when a point confirmation is declined. */
  onUndoLastAction?: () => void;
  selectedBallTypeCode?: DataVolleyBallTypeCode | null;
  selectedNumBlockers?: NumBlockers | null;
  /** Experimental: an evaluation entered while the attacker is awaited
   *  confirms the attack for the predicted attacker (see predict-attacker.ts). */
  predictAttacker?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


export function createTouchDirection(
  direction: BallDirection | null | undefined,
  zone: ScoutingZone,
): BallDirection | undefined {
  return direction
    ? createBallDirection({ ...direction, courtZoneEnd: zone.id })
    : undefined;
}

/** Build a preview pending touch so the toolbar shows the expected skill, already seeded
 * with the geometry/compound-derived defaults so it's correct even if the scout never
 * touches the toolbar before tapping a player. */
export function buildPreviewTouch(ctx: AwaitingPlayerContext, previousTouch: EffectiveTouch | undefined): PendingTouch {
  const defaults = resolveAwaitingPlayerDefaults(ctx, previousTouch);
  return {
    playerId: '',
    teamSide: ctx.possessionTeam,
    skill: ctx.determinedSkill,
    zone: ctx.zone,
    evaluation: defaults.evaluation,
    combinationCode: defaults.combinationCode,
    setterCallCode: defaults.setterCallCode,
    destinationPoint: ctx.destinationPoint,
    ballDirection: ctx.ballDirection ?? undefined,
    trajectory: ctx.trajectory ?? undefined,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
}

export type ServeDrawResolution =
  | { kind: 'serve_error'; errorTouch: PendingTouch; receivingTeam: TeamSide }
  | { kind: 'awaiting_receiver'; context: AwaitingReceiverContext; serveTrajectory: BallTrajectory | null; receivingTeam: TeamSide };

/**
 * Decides what a drawn serve means: an out / net serve (error, point to the receivers)
 * or a serve landing in the receiving court (the receiver is awaited).
 *
 * The start zone is the server's own physical position (explicit lane tap, or the
 * rotation default) - never derived from "previous selected zone" tracking, which
 * is for attacks crossing the net and would be stale for a serve.
 */
export function resolveServeDraw(input: {
  zone: ScoutingZone;
  releasePoint: CourtCoordinate;
  ballDirection: BallDirection | null | undefined;
  servingTeam: TeamSide;
  servingPlayerId: string;
  activeServeStartZone?: ScoutingZone | null;
  courtZones?: ScoutingZone[];
}): ServeDrawResolution {
  const { zone, releasePoint, ballDirection, servingTeam, servingPlayerId, activeServeStartZone, courtZones } = input;
  const startZone: ScoutingZone | undefined = (
    activeServeStartZone && activeServeStartZone.teamSide === servingTeam
      ? activeServeStartZone
      : (courtZones ? getDefaultServeStartZoneForTeam(servingTeam, courtZones) : undefined)
  ) ?? undefined;
  const touchDirection = createTouchDirection(ballDirection, zone);
  const receivingTeam = getOppositeTeamSide(servingTeam);

  const isInReceivingCourt = isServeReleaseInReceivingCourt({
    destinationPoint: releasePoint,
    servingTeam,
    receivingZone: zone.kind === 'in_court' ? zone : undefined,
  });

  if (!isInReceivingCourt) {
    const errorTrajectory = touchDirection
      ? createBallTrajectory({ teamSide: servingTeam, skill: 'serve', evaluation: '=', direction: touchDirection })
      : null;
    return {
      kind: 'serve_error',
      receivingTeam,
      errorTouch: buildServeErrorConfirmationTouch({
        zone,
        destinationPoint: releasePoint,
        servingTeam,
        servingPlayerId,
        serveDirection: touchDirection,
        serveTrajectory: errorTrajectory,
        startZone,
      }),
    };
  }

  const serveTrajectory = touchDirection
    ? createBallTrajectory({
        teamSide: servingTeam,
        skill: 'serve',
        evaluation: RECEIVE_TO_SERVE_EVALUATION[RECEPTION_DEFAULT_EVAL],
        direction: touchDirection,
      })
    : null;
  return {
    kind: 'awaiting_receiver',
    receivingTeam,
    serveTrajectory,
    context: {
      zone,
      destinationPoint: releasePoint,
      servingTeam,
      servingPlayerId,
      serveDirection: touchDirection,
      serveTrajectory,
      receivingTeam,
      startZone,
    },
  };
}

/**
 * What a trajectory drawn right after the reception asks for next: a trajectory
 * that stays in the own court is the set (always asks who set, the receiver
 * excluded by the double-contact rule, and the set mirrors the reception's
 * evaluation); one that crosses, lands on or leaves past the net is an attack.
 */
export function buildPostReceptionPlayerContext(input: {
  determinedSkill: SkillType;
  isOnNet: boolean;
  isOut: boolean;
  zone: ScoutingZone;
  releasePoint: CourtCoordinate;
  possessionTeam: TeamSide;
  touchDirection: BallDirection | undefined;
  receptionEval: SkillEvaluation;
  receiverPlayerId: string | null | undefined;
}): { context: AwaitingPlayerContext; trajectory: BallTrajectory | null } {
  const { determinedSkill, isOnNet, isOut, zone, releasePoint, possessionTeam, touchDirection, receptionEval, receiverPlayerId } = input;
  if (determinedSkill === 'set') {
    const trajectory = touchDirection
      ? createBallTrajectory({ teamSide: possessionTeam, skill: 'set', evaluation: receptionEval, direction: touchDirection })
      : null;
    return {
      trajectory,
      context: {
        zone, destinationPoint: releasePoint, possessionTeam,
        determinedSkill: 'set', ballDirection: touchDirection, trajectory,
        autoEvaluation: receptionEval,
        excludedPlayerIds: receiverPlayerId ? [receiverPlayerId] : undefined,
      },
    };
  }
  const attackEval: SkillEvaluation = isOut ? '=' : isOnNet ? '/' : ATTACK_DEFAULT_EVAL;
  const trajectory = touchDirection
    ? createBallTrajectory({ teamSide: possessionTeam, skill: 'attack', evaluation: attackEval, direction: touchDirection })
    : null;
  return {
    trajectory,
    context: {
      zone, destinationPoint: releasePoint, possessionTeam,
      determinedSkill: 'attack', ballDirection: touchDirection, trajectory,
      autoEvaluation: isOut ? '=' : null,
    },
  };
}
