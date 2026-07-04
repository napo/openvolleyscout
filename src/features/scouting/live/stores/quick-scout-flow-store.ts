import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import { getDefaultServeStartZoneForTeam, type ScoutingZone } from '@src/domain/spatial';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import {
  createBallDirection,
  createBallTrajectory,
  updateBallTrajectoryMetadata,
  type BallDirection,
  type BallTrajectory,
} from '@src/domain/trajectory';
import {
  RECEIVE_TO_SERVE_EVALUATION,
  type PendingTouch,
} from '../../model/datavolley-flow';
import { getDefaultEvaluationForSkill } from '../../model/touch-popup';
import { getOppositeTeamSide } from '../../model/scoring-rules';
import {
  ATTACK_DEFAULT_EVAL,
  buildInferredSetTouch,
  buildReceptionDrivenServeReceiveTouch,
  buildReceptionTouchForSelectedPlayer,
  buildServeErrorConfirmationTouch,
  classifyBlockDeflection,
  createBlockDeflectionSelection,
  findNearestReceivingPlayer,
  flushPendingInferredTouches,
  getTeamDisplayCourtSide,
  isAttackOutRelease,
  isBallReleaseOnNet,
  canSelectReceptionDrivenServeReceiver,
  createAttackBlockerSelection,
  getValidAttackBlockers,
  isReceptionDrivenServePendingTouch,
  isServeReleaseInReceivingCourt,
  lockPlayerOntoAwaitingTouch,
  reconstructAwaitingPlayerContextFromSnapshot,
  resolveAttackBlockerSelection,
  resolveAceVictimFlow,
  resolveAwaitingPlayerDefaults,
  resolveInferredSetterPlayer,
  resolveReceptionDrivenServeEvaluationFlow,
  updatePendingTouchBallTypeCode,
  updatePendingTouchEvaluation,
  updatePendingTouchNumBlockers,
  type AceVictimSelection,
  type AttackBlockerSelection,
  type BlockDeflectionOutcome,
  type CourtCoordinate,
  type EffectiveTouch,
  type RallyEndPreview,
  type TeamTacticalPlayers,
} from '../rally/rally-flow';
import { getTeamScopedPlayerKey } from '../tactical/player-identity';
import type { DataVolleyBallTypeCode } from '../../model/datavolley-ball-types';
import { getReceptionBallTarget } from '@src/config/scouting/reception-ball-placement';
import { createLiveInputState, type AwaitingReceiverContext, type LiveInputState } from './live-touch-flow-store';
import { useAppStore } from '@src/app/store/app-store';

// ─── Phase definition ─────────────────────────────────────────────────────────

/**
 * Phases of the Quick Scout flow.
 *
 * serve_drawing       → server pre-selected, user drags ball to endpoint
 * reception_confirm   → receiver selected, eval chip shown; picking an eval commits
 *                       the reception and auto-assigns the set (tutorial step 5);
 *                       drawing directly commits with the current eval instead
 * play_ready          → general play state: user draws trajectory to determine next skill
 * awaiting_player     → trajectory drawn, user taps player. Carries determinedSkill
 * attack_eval         → attack eval chip; drawing the next trajectory implicitly
 *                       commits the attack with the current (+/-) evaluation
 * awaiting_ace_target → serve with eval # → select ace victim
 * blocker_select      → tap the blocker player (resolves immediately) or draw the
 *                       deflection segment from the net contact
 * rally_ended         → terminal state before reset
 * awaiting_action_reset → point declined ("Annulla"): waiting for the store undo
 *                       to propagate so the correct idle/play_ready phase can be resolved
 */
export type QuickScoutPhase =
  | 'idle'
  | 'serve_drawing'
  | 'reception_confirm'
  | 'play_ready'
  | 'awaiting_player'
  | 'attack_eval'
  | 'awaiting_ace_target'
  | 'blocker_select'
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
  /** Set when the attack's drag paused at the net (dwell) before continuing to its
   * final release point, within a single continuous gesture: `destinationPoint`
   * above is the net-contact point (the attack's own geometry), and the block
   * outcome is already classified from where the gesture actually ended. */
  blockDeflection?: {
    outcome: BlockDeflectionOutcome;
    landingPoint: CourtCoordinate;
  } | null;
};

/**
 * Snapshot of the local flow state taken right before a terminal action is
 * committed, so a declined point confirmation ("No") can either reopen the
 * exact same decision ("Cambia valutazione") or reset to a neutral state
 * ("Annulla") once the corresponding store-level undo has run.
 */
type QuickScoutStateSnapshot = {
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

const RECEPTION_EVAL_OPTIONS: SkillEvaluation[] = ['#', '+', '!', '-', '='];
const ATTACK_EVAL_OPTIONS: SkillEvaluation[] = ['#', '+', '-', '/', '!'];
const RECEPTION_DEFAULT_EVAL: SkillEvaluation = '+';

/** The set auto-assigned right after a reception (tutorial step 5): kept as the
 * visible pending touch so the toolbar shows it and the scout can adjust or
 * redefine it, but not committed yet — its ball type is backfilled from the
 * attack that follows (see flushPendingInferredTouches). */
function isDeferredInferredSet(touch: PendingTouch | null | undefined): boolean {
  return touch?.skill === 'set' && touch.source === 'inferred' && Boolean(touch.playerId);
}

// ─── Controller input ─────────────────────────────────────────────────────────

export type QuickScoutControllerInput = {
  currentRallyTouches: readonly BallTouch[];
  teamPlayersBySide: TeamTacticalPlayers;
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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferAttackEvalFromZone(
  zone: ScoutingZone,
  attackingTeam: TeamSide,
): { evaluation: SkillEvaluation; isAmbiguous: boolean } {
  if (zone.kind !== 'in_court') {
    return { evaluation: '=', isAmbiguous: false };
  }
  if (zone.teamSide !== attackingTeam) {
    return { evaluation: ATTACK_DEFAULT_EVAL, isAmbiguous: true };
  }
  // Ball in same-side court after block recovery
  return { evaluation: '!', isAmbiguous: true };
}

function createTouchDirection(
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
function buildPreviewTouch(ctx: AwaitingPlayerContext, previousTouch: EffectiveTouch | undefined): PendingTouch {
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

// ─── Controller ───────────────────────────────────────────────────────────────

export function useQuickScoutFlowController({
  currentRallyTouches,
  teamPlayersBySide,
  servingTeam,
  servingPlayerId,
  isRallyActive,
  courtZones,
  activeServeStartZone,
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  onAceVictimSelectionChange,
  onUndoLastAction,
  selectedBallTypeCode = null,
  selectedNumBlockers = null,
}: QuickScoutControllerInput) {
  const [phase, setPhase] = useState<QuickScoutPhase>('idle');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamSide, setSelectedTeamSide] = useState<TeamSide | null>(null);
  const [pendingTouch, setPendingTouch] = useState<PendingTouch | null>(null);
  const [pendingBallPosition, setPendingBallPosition] = useState<CourtCoordinate | null>(null);
  const [pendingTrajectory, setPendingTrajectory] = useState<BallTrajectory | null>(null);
  const [evalChip, setEvalChip] = useState<QuickEvalChip | null>(null);
  const [aceVictimSelection, setAceVictimSelection] = useState<AceVictimSelection | null>(null);
  const [blockerSelection, setBlockerSelection] = useState<AttackBlockerSelection | null>(null);
  const [rallyEndPreview, setRallyEndPreview] = useState<RallyEndPreview | null>(null);
  const [pendingDecisionSnapshot, setPendingDecisionSnapshot] = useState<QuickScoutStateSnapshot | null>(null);
  const [awaitingReceiverSelection, setAwaitingReceiverSelection] = useState(false);
  const [awaitingReceiverContext, setAwaitingReceiverContext] = useState<AwaitingReceiverContext | null>(null);
  const [awaitingPlayerContext, setAwaitingPlayerContext] = useState<AwaitingPlayerContext | null>(null);
  const [teamTouchCount, setTeamTouchCount] = useState(0);
  const [possessionTeam, setPossessionTeam] = useState<TeamSide | null>(null);

  const previousTouch = currentRallyTouches.at(-1);

  // ── Deferred inferred touches (e.g. a redrawn/post-reception SET) whose ball
  // type/tempo depends on the following attack, not yet known. Flushed (and
  // backfilled when possible) by the next `commitTouches` call — see
  // `flushPendingInferredTouches`.
  const pendingInferredTouchesRef = useRef<PendingTouch[]>([]);

  // ── Pre-terminal state snapshot (for declined point confirmations) ─────────
  // Mirrors the local state after every completed render so `endRally` can
  // capture "the state right before this terminal action" synchronously,
  // regardless of which branch is calling it.
  const stateSnapshotRef = useRef<QuickScoutStateSnapshot>({
    phase, pendingTouch, evalChip, blockerSelection, aceVictimSelection, awaitingPlayerContext,
    selectedPlayerId, selectedTeamSide, possessionTeam, teamTouchCount, pendingBallPosition, pendingTrajectory,
  });
  useEffect(() => {
    stateSnapshotRef.current = {
      phase, pendingTouch, evalChip, blockerSelection, aceVictimSelection, awaitingPlayerContext,
      selectedPlayerId, selectedTeamSide, possessionTeam, teamTouchCount, pendingBallPosition, pendingTrajectory,
    };
  });

  // ── Resolve the neutral phase once the declined action's undo has propagated ─
  useEffect(() => {
    if (phase !== 'awaiting_action_reset') return;
    const lastTouch = currentRallyTouches.at(-1);
    setPhase(lastTouch ? 'play_ready' : 'idle');
    setPossessionTeam(lastTouch?.teamSide ?? null);
  }, [phase, currentRallyTouches]);

  // ── Reset on rally deactivation ────────────────────────────────────────────
  // `isRallyActive` legitimately starts false and only flips true once the
  // opening serve is committed (see ScoutingPage's lazy `startRally()`) — so
  // this effect must fire exactly on that boolean's transitions, never on
  // incidental re-renders. `onTouchesCommitted`/`pendingTouch` are read via a
  // ref (kept fresh every render below) rather than listed as dependencies:
  // `onTouchesCommitted` is a plain, unmemoized callback recreated on every
  // parent render, and including it here previously caused this effect to
  // re-run on every render while the rally hadn't started yet — wiping out
  // `awaiting_receiver`/`reception_confirm` state the instant it was set,
  // before the scout could ever see or act on it.
  const deactivationEffectInputsRef = useRef({ pendingTouch, onTouchesCommitted });
  deactivationEffectInputsRef.current = { pendingTouch, onTouchesCommitted };
  useEffect(() => {
    if (!isRallyActive) {
      const { pendingTouch, onTouchesCommitted } = deactivationEffectInputsRef.current;
      // An auto-assigned set still sitting in pendingTouch (never redefined nor
      // followed by a drawn attack) is flushed together with the deferred queue.
      const danglingSet = pendingTouch && isDeferredInferredSet(pendingTouch) ? [pendingTouch] : [];
      if (pendingInferredTouchesRef.current.length > 0 || danglingSet.length > 0) {
        // Rally ended without a following attack to type-backfill from (e.g. the
        // dig itself errored) — commit whatever is pending as-is, untyped.
        const flushed = flushPendingInferredTouches([...pendingInferredTouchesRef.current, ...danglingSet], []);
        pendingInferredTouchesRef.current = [];
        onTouchesCommitted(flushed);
      }
      setPhase('idle');
      setSelectedPlayerId(servingPlayerId ?? null);
      setSelectedTeamSide(servingTeam ?? null);
      setPendingTouch(null);
      setPendingBallPosition(null);
      setPendingTrajectory(null);
      setEvalChip(null);
      setAceVictimSelection(null);
      setBlockerSelection(null);
      setRallyEndPreview(null);
      setPendingDecisionSnapshot(null);
      setAwaitingReceiverSelection(false);
      setAwaitingReceiverContext(null);
      setAwaitingPlayerContext(null);
      setTeamTouchCount(0);
      setPossessionTeam(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingTouch/onTouchesCommitted read via ref, see comment above
  }, [isRallyActive, servingPlayerId, servingTeam]);

  // ── Set preview touch when entering awaiting_player ─────────────────────────
  useEffect(() => {
    if (phase === 'awaiting_player' && awaitingPlayerContext && !pendingTouch?.playerId) {
      setPendingTouch(buildPreviewTouch(awaitingPlayerContext, previousTouch));
    }
  }, [phase, awaitingPlayerContext, pendingTouch?.playerId, previousTouch]);

  // ── Auto-select server at start of rally ───────────────────────────────────
  useEffect(() => {
    if (!servingPlayerId || !servingTeam || selectedPlayerId || pendingTouch || blockerSelection || awaitingReceiverSelection) {
      return;
    }
    if (currentRallyTouches.length > 0) return;

    setSelectedPlayerId(servingPlayerId);
    setSelectedTeamSide(servingTeam);
    if (phase === 'idle') setPhase('serve_drawing');
  }, [awaitingReceiverSelection, blockerSelection, currentRallyTouches.length, pendingTouch, phase, selectedPlayerId, servingPlayerId, servingTeam]);

  // ── Notify ace selection ────────────────────────────────────────────────────
  useEffect(() => {
    onAceVictimSelectionChange?.(Boolean(aceVictimSelection));
  }, [aceVictimSelection, onAceVictimSelectionChange]);

  // ── Apply modifiers to pending touch ──────────────────────────────────────
  const applyModifiers = useCallback((touch: PendingTouch): PendingTouch => {
    let t = updatePendingTouchBallTypeCode(touch, selectedBallTypeCode);
    t = updatePendingTouchNumBlockers(t, selectedNumBlockers);
    return t;
  }, [selectedBallTypeCode, selectedNumBlockers]);

  // ── Commit helper ──────────────────────────────────────────────────────────
  const commitTouches = useCallback((touches: PendingTouch[]) => {
    if (touches.length === 0 && pendingInferredTouchesRef.current.length === 0) return;
    // Flush anything deferred earlier in the rally first, backfilling its type
    // from an attack in this same commit when present (see flushPendingInferredTouches).
    const flushed = flushPendingInferredTouches(pendingInferredTouchesRef.current, touches);
    pendingInferredTouchesRef.current = [];
    onTouchesCommitted([...flushed, ...touches]);
    setPendingTouch(null);
    setPendingBallPosition(null);
    setPendingTrajectory(null);
    setEvalChip(null);
    setBlockerSelection(null);
  }, [onTouchesCommitted]);

  const confirmPointAssignment = useAppStore((state) => state.confirmPointAssignment);

  const endRally = useCallback((pointTeam: TeamSide, reason: string) => {
    if (confirmPointAssignment) {
      setRallyEndPreview({ pointTeam, reason });
      // Snapshot the state as it was right before this terminal action (the
      // setters below in the calling branch haven't applied yet in this tick).
      setPendingDecisionSnapshot({ ...stateSnapshotRef.current });
    } else {
      onRallyEnd(pointTeam, reason);
    }
  }, [confirmPointAssignment, onRallyEnd]);

  // ── Helper: commit reception and resolve ──────────────────────────────────
  const commitReceptionAndResolve = useCallback((
    receptionTouch: PendingTouch,
    currentEval: SkillEvaluation,
    thePossessionTeam: TeamSide,
    skipInferredSet?: boolean,
  ): { touches: PendingTouch[]; isGoodReception: boolean; rallyEnded: boolean } | null => {
    const touchWithEval = updatePendingTouchEvaluation(receptionTouch, currentEval);
    const result = resolveReceptionDrivenServeEvaluationFlow(touchWithEval);
    if (!result) return null;

    if (result.kind === 'rally_ended') {
      commitTouches(result.touches);
      endRally(result.preview.pointTeam, result.preview.reason);
      setPhase('rally_ended');
      setSelectedPlayerId(null);
      setSelectedTeamSide(null);
      setEvalChip(null);
      setTeamTouchCount(0);
      setPossessionTeam(null);
      return { touches: result.touches, isGoodReception: false, rallyEnded: true };
    }

    const isGoodReception = currentEval === '#' || currentEval === '+';
    // Commit the reception first (this also flushes/backfills anything deferred
    // earlier in the rally); only AFTER that do we queue this new inferred set,
    // so it isn't immediately flushed untyped by this same commit.
    commitTouches(result.touches);

    let inferredSetTouch: PendingTouch | null = null;
    if (!skipInferredSet && courtZones?.length && touchWithEval.destinationPoint) {
      inferredSetTouch = buildInferredSetTouch({
        teamPlayersBySide,
        possessionTeam: thePossessionTeam,
        courtZones,
        isGoodReception,
        destinationPoint: touchWithEval.destinationPoint,
        inferenceReason: 'setter_after_receive',
      });
      if (inferredSetTouch) {
        pendingInferredTouchesRef.current.push(inferredSetTouch);
      }
    }

    setEvalChip(null);
    return {
      touches: inferredSetTouch ? [...result.touches, inferredSetTouch] : result.touches,
      isGoodReception,
      rallyEnded: false,
    };
  }, [commitTouches, courtZones, endRally, teamPlayersBySide]);

  // ── Trajectory-based skill detection ───────────────────────────────────────
  const determineSkillFromTrajectory = useCallback((
    zone: ScoutingZone,
    releasePoint: CourtCoordinate,
    currentPossessionTeam: TeamSide,
    currentTouchCount: number,
    previousCommittedTouch?: EffectiveTouch,
  ): { determinedSkill: SkillType; crossesNet: boolean; isOnNet: boolean; isOut: boolean } => {
    const isOnNet = isBallReleaseOnNet(releasePoint);
    const possessionCourtSide = getTeamDisplayCourtSide(currentPossessionTeam, courtZones ?? []);
    // Released out of bounds past the net → attack out (C&S: fuori dal campo → attacco =).
    const isOut = Boolean(possessionCourtSide) && isAttackOutRelease({
      releasePoint,
      attackerCourtSide: possessionCourtSide as 'left' | 'right',
    });
    const isOpponentCourt = zone.kind === 'in_court' && zone.teamSide !== currentPossessionTeam;
    const crossesNet = isOpponentCourt || isOnNet || isOut;

    if (crossesNet) {
      return { determinedSkill: 'attack', crossesNet: true, isOnNet, isOut };
    }

    // Ball stays in own court: the first team touch depends on what sent the ball over.
    if (currentTouchCount === 0) {
      // Ball off the opponent block back into the attacker's court → cover.
      if (
        previousCommittedTouch?.skill === 'block'
        && previousCommittedTouch.teamSide !== currentPossessionTeam
      ) {
        return { determinedSkill: 'cover', crossesNet: false, isOnNet: false, isOut: false };
      }
      if (previousCommittedTouch?.skill === 'attack') {
        // A! without a recorded blocker: attacker's side recovers its own blocked ball.
        if (previousCommittedTouch.evaluation === '!' && previousCommittedTouch.teamSide === currentPossessionTeam) {
          return { determinedSkill: 'cover', crossesNet: false, isOnNet: false, isOut: false };
        }
        // A- → the opponent plays an easy ball (freeball).
        if (previousCommittedTouch.evaluation === '-' && previousCommittedTouch.teamSide !== currentPossessionTeam) {
          return { determinedSkill: 'freeball', crossesNet: false, isOnNet: false, isOut: false };
        }
      }
      return { determinedSkill: 'dig', crossesNet: false, isOnNet: false, isOut: false };
    }
    return { determinedSkill: 'set', crossesNet: false, isOnNet: false, isOut: false };
  }, [courtZones]);

  // ── Classify and stage the next trajectory into awaiting_player ────────────
  // Shared by the normal play_ready entry point and by a redraw that arrives
  // while a dig/set is already awaiting a player (see handleZoneSnap): in the
  // latter case `currentTeamTouchCount`/`lastEffectiveTouch` reflect the touch
  // that was just silently inferred, which hasn't reached `currentRallyTouches`
  // yet (committed asynchronously, or — for a set — deliberately deferred).
  const processNextTrajectory = useCallback((
    zone: ScoutingZone,
    releasePoint: CourtCoordinate,
    ballDirection: BallDirection | undefined,
    currentPossessionTeam: TeamSide,
    currentTeamTouchCount: number,
    lastEffectiveTouch: EffectiveTouch | undefined,
  ) => {
    const touchDirection = createTouchDirection(ballDirection, zone);
    const { determinedSkill, isOnNet, isOut } = determineSkillFromTrajectory(
      zone, releasePoint, currentPossessionTeam, currentTeamTouchCount, lastEffectiveTouch,
    );

    if (determinedSkill === 'dig' || determinedSkill === 'cover' || determinedSkill === 'freeball') {
      const digTrajectory = touchDirection
        ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: determinedSkill, evaluation: '+', direction: touchDirection })
        : null;
      setAwaitingPlayerContext({
        zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
        determinedSkill, ballDirection: touchDirection, trajectory: digTrajectory,
      });
      setPendingTouch(null);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(digTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(currentPossessionTeam);
      setPhase('awaiting_player');
      return;
    }

    if (determinedSkill === 'set') {
      const setTrajectory = touchDirection
        ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'set', evaluation: '+', direction: touchDirection })
        : null;
      // Double-contact rule: whoever made the previous same-team touch (receiver,
      // digger) cannot also be the setter.
      const previousToucherId = lastEffectiveTouch?.teamSide === currentPossessionTeam
        ? lastEffectiveTouch.playerId
        : undefined;
      setAwaitingPlayerContext({
        zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
        determinedSkill: 'set', ballDirection: touchDirection, trajectory: setTrajectory,
        excludedPlayerIds: previousToucherId ? [previousToucherId] : undefined,
      });
      setPendingTouch(null);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(setTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(currentPossessionTeam);
      setPhase('awaiting_player');
      return;
    }

    // determinedSkill === 'attack'
    // A single continuous gesture that paused at the net (dwell) before
    // continuing to its final release point carries the net-contact point in
    // `ballDirection.via`. Classify it exactly like the two-drag deflection
    // flow, but resolved as soon as the attacker is picked — no separate
    // second drag needed. If the pause point still reads as "on the net"
    // itself (the gesture barely moved past it), fall through to the normal
    // isOnNet handling below and let the scout draw the deflection segment
    // as a second gesture, same as today.
    const netContactPoint = ballDirection?.via?.[0];
    const attackerCourtSide = netContactPoint
      ? getTeamDisplayCourtSide(currentPossessionTeam, courtZones ?? [])
      : null;
    const dwellOutcome = netContactPoint && attackerCourtSide
      ? classifyBlockDeflection({ releasePoint, attackerCourtSide })
      : null;

    if (netContactPoint && dwellOutcome) {
      const attackSegment: BallDirection = { ...ballDirection, end: netContactPoint, via: undefined };
      const attackTouchDirection = createTouchDirection(attackSegment, zone);
      const attackTrajectory = attackTouchDirection
        ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'attack', evaluation: '/', direction: attackTouchDirection })
        : null;

      setAwaitingPlayerContext({
        zone, destinationPoint: netContactPoint, possessionTeam: currentPossessionTeam,
        determinedSkill: 'attack', ballDirection: attackTouchDirection, trajectory: attackTrajectory,
        blockDeflection: { outcome: dwellOutcome, landingPoint: releasePoint },
      });
      setPendingTouch(null);
      setPendingBallPosition(netContactPoint);
      setPendingTrajectory(attackTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(currentPossessionTeam);
      setPhase('awaiting_player');
      return;
    }

    const attackEval = isOut ? '=' as SkillEvaluation : isOnNet ? '/' as SkillEvaluation : ATTACK_DEFAULT_EVAL;
    const attackTrajectory = touchDirection
      ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'attack', evaluation: attackEval, direction: touchDirection })
      : null;

    setAwaitingPlayerContext({
      zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
      determinedSkill: 'attack', ballDirection: touchDirection, trajectory: attackTrajectory,
      autoEvaluation: isOut ? '=' : null,
    });
    setPendingTouch(null);
    setPendingBallPosition(releasePoint);
    setPendingTrajectory(attackTrajectory);
    setSelectedPlayerId(null);
    setSelectedTeamSide(currentPossessionTeam);
    setPhase('awaiting_player');
  }, [courtZones, determineSkillFromTrajectory]);

  // ── Zone snap (ball drag endpoint) ────────────────────────────────────────
  const handleZoneSnap = useCallback((
    zone: ScoutingZone,
    destinationPoint?: CourtCoordinate,
    ballDirection?: BallDirection,
  ) => {
    if (aceVictimSelection || (blockerSelection && phase !== 'blocker_select') || awaitingReceiverSelection) return;

    onSelectedZoneChange(zone);

    // A genuine tap on a serve-start marker (picking the serve position, no
    // drag gesture) is a no-op here — handled visually via onSelectedZoneChange
    // above. But a ball DRAG that snapped to the nearest zone can also land on
    // a serve-start marker when released far outside the court altogether
    // (those markers sit just past the court's outer edge, in the same dark
    // margin as genuine out-of-bounds releases) — that must NOT be swallowed
    // silently, it has to fall through to the serve/attack-out handling below.
    if (zone.kind === 'serve_start' && !ballDirection) {
      return;
    }

    const releasePoint = ballDirection?.end ?? destinationPoint ?? zone.center;

    // ── BLOCK DEFLECTION (attack stopped on the net, second segment drawn) ────
    // C&S §4.4.4: once the attack is sitting on the net the net acts as a block
    // area; dragging the ball from the net contact to its landing point derives
    // the block/attack evaluations geometrically. The attack lives in
    // pendingTouch while its eval chip is open, or already inside the blocker
    // selection once the attacker was tapped (blocker_select phase).
    const deflectionAttackTouch = (
      phase === 'attack_eval'
      && pendingTouch?.skill === 'attack'
      && pendingTouch.destinationPoint
      && isBallReleaseOnNet(pendingTouch.destinationPoint)
    )
      ? pendingTouch
      : (
        phase === 'blocker_select'
        && blockerSelection
        && !blockerSelection.blockDirection
        && blockerSelection.attackTouch.destinationPoint
        && isBallReleaseOnNet(blockerSelection.attackTouch.destinationPoint)
      )
        ? blockerSelection.attackTouch
        : null;

    if (deflectionAttackTouch) {
      if (!ballDirection) return;

      const attackerCourtSide = getTeamDisplayCourtSide(deflectionAttackTouch.teamSide, courtZones ?? []);
      if (!attackerCourtSide) return;

      const outcome = classifyBlockDeflection({ releasePoint, attackerCourtSide });
      if (!outcome) return; // still on the net

      const blockingTeam = getOppositeTeamSide(deflectionAttackTouch.teamSide);
      const touchDirection = createTouchDirection(ballDirection, zone);
      const blockTrajectory = touchDirection
        ? createBallTrajectory({
            teamSide: blockingTeam,
            skill: 'block',
            evaluation: outcome.blockEvaluation,
            direction: touchDirection,
          })
        : null;

      setBlockerSelection(createBlockDeflectionSelection({
        attackTouch: applyModifiers(deflectionAttackTouch),
        outcome,
        blockDirection: touchDirection,
        blockTrajectory,
        destinationPoint: releasePoint,
      }));
      setPendingTouch(null);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(blockTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(blockingTeam);
      setEvalChip(null);
      setPhase('blocker_select');
      return;
    }

    // ── REDRAW DURING ATTACK EVAL: implicit confirmation ─────────────────────
    // Drawing the next trajectory instead of tapping an evaluation confirms the
    // attack with its current (rally-continuing) evaluation and hands the ball
    // to the opponent — this is what lets the scout skip recording the dig/set
    // entirely by drawing the counter-attack right away (tutorial steps 10-12).
    if (phase === 'attack_eval' && pendingTouch?.skill === 'attack' && ballDirection) {
      const currentEval = evalChip?.current ?? pendingTouch.evaluation ?? ATTACK_DEFAULT_EVAL;
      if (currentEval !== '+' && currentEval !== '-') return; // needs an explicit chip decision

      const attackTouch = applyModifiers(updatePendingTouchEvaluation(pendingTouch, currentEval));
      commitTouches([attackTouch]);
      const opponentTeam = getOppositeTeamSide(attackTouch.teamSide);
      setEvalChip(null);
      setSelectedPlayerId(null);
      setSelectedTeamSide(opponentTeam);
      setTeamTouchCount(0);
      setPossessionTeam(opponentTeam);
      processNextTrajectory(zone, releasePoint, ballDirection, opponentTeam, 0, attackTouch);
      return;
    }

    // ── REDRAW WHILE AWAITING A PLAYER (dig/set only) ─────────────────────────
    // A scout who draws another trajectory instead of tapping who dug/set the
    // ball is implicitly confirming it happened without wanting to name the
    // player — DataVolley scouts routinely infer dig/set this way, only the
    // attack is always recorded explicitly. Freeball/cover/attack are left
    // untouched: the redraw is simply dropped, same as today.
    if (phase === 'awaiting_player' && awaitingPlayerContext && ballDirection && pendingTouch) {
      const { determinedSkill, possessionTeam: actingTeam, zone: awaitingZone, destinationPoint: awaitingDestination } = awaitingPlayerContext;

      if (determinedSkill === 'dig') {
        const nearestPlayer = findNearestReceivingPlayer({
          destinationPoint: awaitingDestination,
          receivingTeam: actingTeam,
          teamPlayersBySide,
        });

        if (nearestPlayer) {
          const inferredDig = applyModifiers(lockPlayerOntoAwaitingTouch({
            pendingTouch,
            playerId: nearestPlayer.playerId,
            teamSide: actingTeam,
            determinedSkill: 'dig',
            awaitingZone,
            player: nearestPlayer,
            courtZones,
            source: 'inferred',
            inferenceReason: 'dig_from_redraw',
          }));

          commitTouches([inferredDig]);
          setAwaitingPlayerContext(null);
          const nextTouchCount = teamTouchCount + 1;
          setTeamTouchCount(nextTouchCount);
          setPossessionTeam(actingTeam);
          setSelectedPlayerId(null);
          setSelectedTeamSide(actingTeam);
          processNextTrajectory(zone, releasePoint, ballDirection, actingTeam, nextTouchCount, inferredDig);
          return;
        }
      }

      if (determinedSkill === 'set') {
        const setterPlayer = resolveInferredSetterPlayer({
          teamPlayersBySide,
          possessionTeam: actingTeam,
          destinationPoint: awaitingDestination,
        });

        if (setterPlayer) {
          // Ball type/tempo depends on the attack that follows — deferred, not
          // committed yet (see flushPendingInferredTouches / commitTouches).
          const inferredSet = applyModifiers(lockPlayerOntoAwaitingTouch({
            pendingTouch,
            playerId: setterPlayer.playerId,
            teamSide: actingTeam,
            determinedSkill: 'set',
            awaitingZone,
            player: setterPlayer,
            courtZones,
            source: 'inferred',
            inferenceReason: 'set_from_redraw',
          }));

          pendingInferredTouchesRef.current.push(inferredSet);
          setAwaitingPlayerContext(null);
          const nextTouchCount = teamTouchCount + 1;
          setTeamTouchCount(nextTouchCount);
          setPossessionTeam(actingTeam);
          setSelectedPlayerId(null);
          setSelectedTeamSide(actingTeam);
          processNextTrajectory(zone, releasePoint, ballDirection, actingTeam, nextTouchCount, inferredSet);
          return;
        }
      }
      // attack / freeball / cover: fall through — redraw dropped, unchanged.
    }

    // ── SERVE PHASE ───────────────────────────────────────────────────────────
    const isServeDraw = phase === 'serve_drawing'
      || (phase === 'idle' && currentRallyTouches.length === 0 && servingTeam && servingPlayerId);

    if (isServeDraw && servingTeam && servingPlayerId) {
      // The server's own physical position — never derived from touchOriginZoneRef-style
      // "previous selected zone" tracking (that mechanism is for attacks crossing the net;
      // for a serve it's either empty or stale leftover state from the prior rally).
      const resolvedServeStartZone: ScoutingZone | undefined = (
        activeServeStartZone && activeServeStartZone.teamSide === servingTeam
          ? activeServeStartZone
          : (courtZones ? getDefaultServeStartZoneForTeam(servingTeam, courtZones) : undefined)
      ) ?? undefined;
      const touchDirection = createTouchDirection(ballDirection, zone);
      const serveTrajectory = touchDirection
        ? createBallTrajectory({
            teamSide: servingTeam,
            skill: 'serve',
            evaluation: RECEIVE_TO_SERVE_EVALUATION[RECEPTION_DEFAULT_EVAL],
            direction: touchDirection,
          })
        : null;

      const isInReceivingCourt = isServeReleaseInReceivingCourt({
        destinationPoint: releasePoint,
        servingTeam,
        receivingZone: zone.kind === 'in_court' ? zone : undefined,
      });

      if (!isInReceivingCourt) {
        // Serve error (out / net)
        const errorTrajectory = touchDirection
          ? createBallTrajectory({
              teamSide: servingTeam,
              skill: 'serve',
              evaluation: '=',
              direction: touchDirection,
            })
          : null;
        const errorTouch = buildServeErrorConfirmationTouch({
          zone,
          destinationPoint: releasePoint,
          servingTeam,
          servingPlayerId,
          serveDirection: touchDirection,
          serveTrajectory: errorTrajectory,
          startZone: resolvedServeStartZone,
        });
        // Serve error = auto point for receiving team; no chip needed
        commitTouches([errorTouch]);
        endRally(getOppositeTeamSide(servingTeam), 'serve_error');
        setPhase('rally_ended');
        setSelectedPlayerId(servingPlayerId);
        setSelectedTeamSide(servingTeam);
        setTeamTouchCount(0);
        setPossessionTeam(null);
        return;
      }

      const receivingTeam = getOppositeTeamSide(servingTeam);
      setAwaitingReceiverSelection(true);
      setAwaitingReceiverContext({
        zone,
        destinationPoint: releasePoint,
        servingTeam,
        servingPlayerId,
        serveDirection: touchDirection,
        serveTrajectory,
        receivingTeam,
        startZone: resolvedServeStartZone,
      });
      setPendingTouch(null);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(serveTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(receivingTeam);
      setEvalChip(null);
      setPhase('reception_confirm');
      // Reception is 1st touch for receiving team
      setTeamTouchCount(0);
      setPossessionTeam(receivingTeam);
      return;
    }

    // ── POST-RECEPTION TRAJECTORY ─────────────────────────────────────────────
    if (phase === 'reception_confirm') {
      const currentPossessionTeam = pendingTouch?.teamSide
        ?? possessionTeam
        ?? (servingTeam ? getOppositeTeamSide(servingTeam) : null);
      if (!currentPossessionTeam) return;

      // Tap or drag within own court without direction → just move ball position
      if (zone.kind === 'in_court' && zone.teamSide === currentPossessionTeam && !ballDirection && !isBallReleaseOnNet(releasePoint)) {
        setPendingBallPosition(releasePoint);
        return;
      }

      if (!ballDirection) return;

      const touchDirection = createTouchDirection(ballDirection, zone);
      // teamTouchCount is 0 here because reception hasn't been committed yet as a counted touch
      const { determinedSkill, crossesNet, isOnNet, isOut } = determineSkillFromTrajectory(
        zone, releasePoint, currentPossessionTeam, 1, // After reception, this is the 2nd touch (set)
      );

      const receptionEval = evalChip?.current ?? RECEPTION_DEFAULT_EVAL;
      const receiverPlayerId = pendingTouch && isReceptionDrivenServePendingTouch(pendingTouch)
        ? pendingTouch.playerId
        : null;

      // First commit the reception (skip inferred set if user is explicitly drawing a set)
      if (pendingTouch && isReceptionDrivenServePendingTouch(pendingTouch)) {
        const resolved = commitReceptionAndResolve(pendingTouch, receptionEval, currentPossessionTeam, determinedSkill === 'set');
        if (!resolved || resolved.rallyEnded) return;
      }

      if (determinedSkill === 'set') {
        // Trajectory stays in own court → the scout is defining the set
        // explicitly: always ask who set (tutorial step 7), the receiver
        // excluded (double-contact rule). The set mirrors the reception's eval.
        const setTrajectory = touchDirection
          ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'set', evaluation: receptionEval, direction: touchDirection })
          : null;
        setAwaitingPlayerContext({
          zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
          determinedSkill: 'set', ballDirection: touchDirection, trajectory: setTrajectory,
          autoEvaluation: receptionEval,
          excludedPlayerIds: receiverPlayerId ? [receiverPlayerId] : undefined,
        });
        setPendingTouch(null);
        setPendingBallPosition(releasePoint);
        setPendingTrajectory(setTrajectory);
        setSelectedPlayerId(null);
        setSelectedTeamSide(currentPossessionTeam);
        setPhase('awaiting_player');
        return;
      }

      // determinedSkill === 'attack' (crosses net, on net or out past the net)
      const attackEval = isOut ? '=' as SkillEvaluation : isOnNet ? '/' as SkillEvaluation : ATTACK_DEFAULT_EVAL;
      const attackTrajectory = touchDirection
        ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'attack', evaluation: attackEval, direction: touchDirection })
        : null;

      setAwaitingPlayerContext({
        zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
        determinedSkill: 'attack', ballDirection: touchDirection, trajectory: attackTrajectory,
        autoEvaluation: isOut ? '=' : null,
      });
      setPendingTouch(null);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(attackTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(currentPossessionTeam);
      setPhase('awaiting_player');
      return;
    }

    // ── GENERAL PLAY (play_ready) ─────────────────────────────────────────────
    if (phase === 'play_ready') {
      const currentPossessionTeam = possessionTeam
        ?? currentRallyTouches.at(-1)?.teamSide
        ?? (servingTeam ? getOppositeTeamSide(servingTeam) : null);
      if (!currentPossessionTeam) return;

      // Tap or drag within own court without direction → just move ball position
      if (zone.kind === 'in_court' && zone.teamSide === currentPossessionTeam && !ballDirection && !isBallReleaseOnNet(releasePoint)) {
        setPendingBallPosition(releasePoint);
        return;
      }

      if (!ballDirection) return;

      // The set auto-assigned after the reception is still sitting in pendingTouch:
      // an in-court redraw means the scout is redefining it explicitly (tutorial
      // step 6), anything else keeps it, deferred so the following attack can
      // backfill its ball type.
      if (pendingTouch && isDeferredInferredSet(pendingTouch)) {
        const { determinedSkill } = determineSkillFromTrajectory(
          zone, releasePoint, currentPossessionTeam, teamTouchCount, currentRallyTouches.at(-1),
        );

        if (determinedSkill === 'set') {
          const lastTouch = currentRallyTouches.at(-1);
          const previousToucherId = lastTouch?.teamSide === currentPossessionTeam ? lastTouch.playerId : undefined;
          const setEval = pendingTouch.evaluation ?? '+';
          const touchDirection = createTouchDirection(ballDirection, zone);
          const setTrajectory = touchDirection
            ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'set', evaluation: setEval, direction: touchDirection })
            : null;
          setAwaitingPlayerContext({
            zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
            determinedSkill: 'set', ballDirection: touchDirection, trajectory: setTrajectory,
            autoEvaluation: setEval,
            excludedPlayerIds: previousToucherId ? [previousToucherId] : undefined,
          });
          setPendingTouch(null);
          setPendingBallPosition(releasePoint);
          setPendingTrajectory(setTrajectory);
          setSelectedPlayerId(null);
          setSelectedTeamSide(currentPossessionTeam);
          // The dropped auto-set no longer counts until the explicit one is assigned.
          setTeamTouchCount((prev) => Math.max(prev - 1, 0));
          setPhase('awaiting_player');
          return;
        }

        pendingInferredTouchesRef.current.push(pendingTouch);
        setPendingTouch(null);
        processNextTrajectory(zone, releasePoint, ballDirection, currentPossessionTeam, teamTouchCount, pendingTouch);
        return;
      }

      // Commit any pending touch before processing new trajectory
      if (pendingTouch && pendingTouch.playerId) {
        commitTouches([pendingTouch]);
        setPendingTouch(null);
      }

      processNextTrajectory(zone, releasePoint, ballDirection, currentPossessionTeam, teamTouchCount, currentRallyTouches.at(-1));
      return;
    }
  }, [
    aceVictimSelection,
    activeServeStartZone,
    applyModifiers,
    awaitingPlayerContext,
    blockerSelection,
    commitReceptionAndResolve,
    commitTouches,
    courtZones,
    currentRallyTouches,
    determineSkillFromTrajectory,
    endRally,
    evalChip,
    onSelectedZoneChange,
    pendingTouch,
    processNextTrajectory,
    phase,
    possessionTeam,
    servingPlayerId,
    servingTeam,
    teamPlayersBySide,
    teamTouchCount,
  ]);

  // ── Player selection ────────────────────────────────────────────────────────
  const handlePlayerSelection = useCallback((playerId: string, teamSide: TeamSide) => {
    // Blocker selection (in blocker_select phase): tapping the blocker resolves
    // immediately with the outcome already fixed by the attack evaluation or the
    // deflection geometry — no evaluation chip (tutorial steps 16→17).
    if (blockerSelection && phase === 'blocker_select') {
      const resolved = resolveAttackBlockerSelection({
        selection: blockerSelection,
        playerId,
        teamSide,
        teamPlayersBySide,
      });
      if (!resolved) return;

      commitTouches(resolved.touches);
      setBlockerSelection(null);

      if (!blockerSelection.rallyContinues) {
        // A/ → B# point to the blockers; deflection landing out → A# + B=,
        // point to the attacking team.
        const reason = blockerSelection.pointTeam === blockerSelection.blockingTeam ? 'block_kill' : 'block_out';
        endRally(blockerSelection.pointTeam, reason);
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        setTeamTouchCount(0);
        setPossessionTeam(null);
        return;
      }

      // Rally continues: B! → ball back on the attacker's side (cover);
      // B+ (deflection kept in play) → the blocking team plays on.
      const nextTeam = blockerSelection.blockEvaluation === '+'
        ? blockerSelection.blockingTeam
        : blockerSelection.attackTouch.teamSide;
      setPhase('play_ready');
      setSelectedPlayerId(null);
      setSelectedTeamSide(nextTeam);
      setTeamTouchCount(0);
      setPossessionTeam(nextTeam);
      return;
    }

    // Ace victim selection
    if (aceVictimSelection) {
      const resolved = resolveAceVictimFlow({ selection: aceVictimSelection, playerId, teamSide });
      if (!resolved) return;

      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAceVictimSelection(null);
      setPendingBallPosition(null);
      setEvalChip(null);
      commitTouches(resolved.touches);
      endRally(resolved.pointTeam, resolved.reason);
      setPhase('rally_ended');
      setTeamTouchCount(0);
      setPossessionTeam(null);
      return;
    }

    // Awaiting player: user taps who performed the skill after drawing trajectory.
    // The pending draft (evaluation/combination code/ball type/blockers) may already
    // have been freely edited by the scout while awaiting selection — lock it in
    // verbatim rather than recomputing it from geometry (see lockPlayerOntoAwaitingTouch).
    if (phase === 'awaiting_player' && awaitingPlayerContext && pendingTouch) {
      if (teamSide !== awaitingPlayerContext.possessionTeam) return;
      // Double-contact rule: e.g. the receiver cannot also be tapped as the setter.
      if (awaitingPlayerContext.excludedPlayerIds?.includes(playerId)) return;

      const player = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (!player) return;

      const { determinedSkill } = awaitingPlayerContext;

      const lockedTouch = applyModifiers(lockPlayerOntoAwaitingTouch({
        pendingTouch,
        playerId,
        teamSide,
        determinedSkill,
        awaitingZone: awaitingPlayerContext.zone,
        player,
        courtZones,
      }));

      if (determinedSkill === 'attack') {
        if (awaitingPlayerContext.blockDeflection) {
          // Single-gesture dwell case (net-contact point + final landing already
          // classified in processNextTrajectory): resolve straight into
          // blocker_select with the deflection geometry already attached, same
          // destination as the two-drag flow's `deflectionAttackTouch` branch.
          const { outcome, landingPoint } = awaitingPlayerContext.blockDeflection;
          const blockingTeam = getOppositeTeamSide(teamSide);
          const blockDirection = lockedTouch.destinationPoint
            ? createTouchDirection({ start: lockedTouch.destinationPoint, end: landingPoint }, awaitingPlayerContext.zone)
            : undefined;
          const blockTrajectory = blockDirection
            ? createBallTrajectory({ teamSide: blockingTeam, skill: 'block', evaluation: outcome.blockEvaluation, direction: blockDirection })
            : null;

          setAwaitingPlayerContext(null);
          setPendingTouch(null);
          setSelectedPlayerId(null);
          setSelectedTeamSide(blockingTeam);
          setBlockerSelection(createBlockDeflectionSelection({
            attackTouch: lockedTouch,
            outcome,
            blockDirection,
            blockTrajectory,
            destinationPoint: landingPoint,
          }));
          setEvalChip(null);
          setPhase('blocker_select');
          return;
        }

        if (lockedTouch.evaluation === '=' || lockedTouch.evaluation === '#') {
          // Terminal evaluation locked in before/at the tap: '=' attack error
          // (geometric out release or dialed in) → point to the opponent
          // (C&S §4.4.3); '#' kill → point to the attacker.
          commitTouches([lockedTouch]);
          setAwaitingPlayerContext(null);
          endRally(
            lockedTouch.evaluation === '#' ? teamSide : getOppositeTeamSide(teamSide),
            lockedTouch.evaluation === '#' ? 'attack_kill' : 'attack_error',
          );
          setPhase('rally_ended');
          setSelectedPlayerId(null);
          setSelectedTeamSide(null);
          setTeamTouchCount(0);
          setPossessionTeam(null);
          return;
        }

        if (lockedTouch.evaluation === '/' || lockedTouch.evaluation === '!') {
          // Attack stopped by the block: go straight to picking the blocker
          // (tutorial steps 15→16). The ball stays on the net contact so the
          // deflection segment can still be drawn instead.
          const blockerSel = createAttackBlockerSelection(lockedTouch);
          if (blockerSel) {
            setAwaitingPlayerContext(null);
            setPendingTouch(null);
            setSelectedPlayerId(null);
            setSelectedTeamSide(blockerSel.blockingTeam);
            setBlockerSelection(blockerSel);
            setEvalChip(null);
            setPhase('blocker_select');
            return;
          }
        }

        setPendingTouch(lockedTouch);
        setSelectedPlayerId(playerId);
        setSelectedTeamSide(teamSide);
        setAwaitingPlayerContext(null);
        setEvalChip({ options: ATTACK_EVAL_OPTIONS, current: lockedTouch.evaluation ?? ATTACK_DEFAULT_EVAL });
        setPhase('attack_eval');
        return;
      }

      if (determinedSkill === 'set') {
        // Non-terminal, but not committed yet either: deferred so the following
        // attack can backfill its ball type (see flushPendingInferredTouches).
        pendingInferredTouchesRef.current.push(lockedTouch);
        setPendingTouch(null);
        setPendingTrajectory(null);
        setAwaitingPlayerContext(null);
        setTeamTouchCount((prev) => prev + 1);
        setPossessionTeam(teamSide);
        setPendingBallPosition(awaitingPlayerContext.destinationPoint);
        setSelectedPlayerId(null);
        setSelectedTeamSide(teamSide);
        setPhase('play_ready');
        return;
      }

      // dig / freeball / cover — create touch, auto-commit, continue.
      commitTouches([lockedTouch]);
      setAwaitingPlayerContext(null);
      setTeamTouchCount((prev) => prev + 1);
      setPossessionTeam(teamSide);
      setPendingBallPosition(awaitingPlayerContext.destinationPoint);
      setPendingTrajectory(null);
      setSelectedPlayerId(null);
      setSelectedTeamSide(teamSide);
      setPhase('play_ready');
      return;
    }

    // Awaiting receiver selection: user taps a receiving player after serve release
    if (awaitingReceiverSelection && awaitingReceiverContext) {
      if (teamSide !== awaitingReceiverContext.receivingTeam) {
        return;
      }

      const receptionTouch = applyModifiers(buildReceptionTouchForSelectedPlayer({
        zone: awaitingReceiverContext.zone,
        destinationPoint: awaitingReceiverContext.destinationPoint,
        servingTeam: awaitingReceiverContext.servingTeam,
        servingPlayerId: awaitingReceiverContext.servingPlayerId,
        playerId,
        receivingTeam: awaitingReceiverContext.receivingTeam,
        serveDirection: awaitingReceiverContext.serveDirection,
        serveTrajectory: awaitingReceiverContext.serveTrajectory,
        startZone: awaitingReceiverContext.startZone,
      }));

      setPendingTouch(receptionTouch);
      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAwaitingReceiverSelection(false);
      setAwaitingReceiverContext(null);
      setEvalChip({ options: RECEPTION_EVAL_OPTIONS, current: RECEPTION_DEFAULT_EVAL });
      const ballTarget = courtZones
        ? getReceptionBallTarget(RECEPTION_DEFAULT_EVAL, awaitingReceiverContext.receivingTeam, courtZones)
        : null;
      if (ballTarget) {
        setPendingBallPosition(ballTarget);
      }
      setTeamTouchCount(1); // Reception is 1st touch
      setPossessionTeam(teamSide);
      setPhase('reception_confirm');
      return;
    }

    // In reception_confirm phase, tapping a player without drawing first is now ignored.
    // The user must draw a trajectory first to determine the next skill.
  }, [
    aceVictimSelection,
    applyModifiers,
    awaitingPlayerContext,
    awaitingReceiverContext,
    awaitingReceiverSelection,
    blockerSelection,
    commitTouches,
    courtZones,
    endRally,
    pendingTouch,
    phase,
    teamPlayersBySide,
  ]);

  // ── Eval chip selection ────────────────────────────────────────────────────
  const handleEvalChipSelect = useCallback((evaluation: SkillEvaluation) => {
    if (!evalChip) return;

    // Reception chip (in reception_confirm phase)
    if (phase === 'reception_confirm' && pendingTouch && isReceptionDrivenServePendingTouch(pendingTouch)) {
      const updated = updatePendingTouchEvaluation(pendingTouch, evaluation);
      const receivingTeam = pendingTouch.teamSide;
      const ballTarget = courtZones
        ? getReceptionBallTarget(evaluation, receivingTeam, courtZones)
        : null;

      // = means reception error → auto-commit and end rally
      if (evaluation === '=') {
        setPendingTouch(applyModifiers(updated));
        setEvalChip({ ...evalChip, current: evaluation });
        if (ballTarget) {
          setPendingBallPosition(ballTarget);
        }
        const result = resolveReceptionDrivenServeEvaluationFlow(updated);
        if (!result) return;
        commitTouches(result.touches);
        if (result.kind === 'rally_ended') {
          endRally(result.preview.pointTeam, result.preview.reason);
          setPhase('rally_ended');
          setSelectedPlayerId(null);
          setSelectedTeamSide(null);
          setEvalChip(null);
          setTeamTouchCount(0);
          setPossessionTeam(null);
        }
        return;
      }

      // Picking the evaluation settles the reception: commit it and auto-assign
      // the set to the setter, mirroring this evaluation (tutorial steps 4→5).
      // The assigned set stays editable/redefinable as the visible pending touch
      // and is only flushed with the following attack (type backfill).
      const resolved = commitReceptionAndResolve(pendingTouch, evaluation, receivingTeam, true);
      if (!resolved || resolved.rallyEnded) return;

      const isGoodReception = evaluation === '#' || evaluation === '+';
      const setDestination = ballTarget ?? updated.destinationPoint;
      const inferredSet = courtZones?.length && setDestination
        ? buildInferredSetTouch({
            teamPlayersBySide,
            possessionTeam: receivingTeam,
            courtZones,
            isGoodReception,
            destinationPoint: setDestination,
            inferenceReason: 'setter_after_receive',
            evaluation,
          })
        : null;

      if (inferredSet) {
        setPendingTouch(applyModifiers(inferredSet));
        setSelectedPlayerId(inferredSet.playerId ?? null);
        setSelectedTeamSide(receivingTeam);
        setTeamTouchCount(2);
      } else {
        setPendingTouch(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(receivingTeam);
        setTeamTouchCount(1);
      }
      setEvalChip(null);
      setPossessionTeam(receivingTeam);
      if (ballTarget) {
        setPendingBallPosition(ballTarget);
      }
      setPhase('play_ready');
      return;
    }

    // Attack chip (in attack_eval phase)
    if (phase === 'attack_eval' && pendingTouch) {
      const updatedTrajectory = pendingTrajectory
        ? updateBallTrajectoryMetadata(pendingTrajectory, { evaluation })
        : null;
      const updatedTouch = applyModifiers({
        ...updatePendingTouchEvaluation(pendingTouch, evaluation),
        trajectory: updatedTrajectory ?? pendingTouch.trajectory,
      });

      if (evaluation === '#') {
        // Kill — rally ends, attacker wins point
        commitTouches([updatedTouch]);
        endRally(updatedTouch.teamSide, 'attack_kill');
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        setEvalChip(null);
        setTeamTouchCount(0);
        setPossessionTeam(null);
        return;
      }

      if (evaluation === '=') {
        // Attack error — rally ends, opponent wins point
        commitTouches([updatedTouch]);
        endRally(getOppositeTeamSide(updatedTouch.teamSide), 'attack_error');
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        setEvalChip(null);
        setTeamTouchCount(0);
        setPossessionTeam(null);
        return;
      }

      if (evaluation === '/') {
        // Blocked for point — go to blocker player selection
        const blockerSel = createAttackBlockerSelection(updatedTouch);
        if (blockerSel) {
          setPendingTouch(null);
          setPendingBallPosition(null);
          setSelectedPlayerId(null);
          setSelectedTeamSide(blockerSel.blockingTeam);
          setBlockerSelection(blockerSel);
          setEvalChip(null);
          setPhase('blocker_select');
          return;
        }
        // Fallback: commit as blocked point
        commitTouches([updatedTouch]);
        endRally(getOppositeTeamSide(updatedTouch.teamSide), 'attack_blocked');
        setPhase('rally_ended');
        setEvalChip(null);
        setTeamTouchCount(0);
        setPossessionTeam(null);
        return;
      }

      if (evaluation === '+' || evaluation === '-') {
        // Defended — rally continues with opponent possession
        const opponentTeam = getOppositeTeamSide(updatedTouch.teamSide);
        commitTouches([updatedTouch]);
        setPhase('play_ready');
        setEvalChip(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(opponentTeam);
        setTeamTouchCount(0); // New possession
        setPossessionTeam(opponentTeam);
        return;
      }

      if (evaluation === '!') {
        // Block touch but attacker recovered — record the blocker (B!), then rally continues with same team
        const blockerSel = createAttackBlockerSelection(updatedTouch);
        if (blockerSel) {
          setPendingTouch(null);
          setPendingBallPosition(null);
          setSelectedPlayerId(null);
          setSelectedTeamSide(blockerSel.blockingTeam);
          setBlockerSelection(blockerSel);
          setEvalChip(null);
          setPhase('blocker_select');
          return;
        }
        // Fallback: commit with no block touch
        commitTouches([updatedTouch]);
        setPhase('play_ready');
        setEvalChip(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(updatedTouch.teamSide);
        // Touch count resets for the same team as they recovered
        setTeamTouchCount(0);
        setPossessionTeam(updatedTouch.teamSide);
      }
    }

  }, [
    applyModifiers,
    commitReceptionAndResolve,
    commitTouches,
    courtZones,
    endRally,
    evalChip,
    pendingTouch,
    pendingTrajectory,
    phase,
    teamPlayersBySide,
  ]);

  // ── Ball type and blocker count ─────────────────────────────────────────────
  const handleBallTypeCodeChange = useCallback((code: DataVolleyBallTypeCode) => {
    setPendingTouch((t) => t ? updatePendingTouchBallTypeCode(t, code) : t);
  }, []);

  const handleNumBlockersChange = useCallback((numBlockers: NumBlockers) => {
    setPendingTouch((t) => t ? updatePendingTouchNumBlockers(t, numBlockers) : t);
  }, []);

  const handleBallPositionChange = useCallback((position: CourtCoordinate) => {
    setPendingBallPosition(position);
  }, []);

  // ── Rally end confirm ───────────────────────────────────────────────────────
  const handleRallyEndConfirm = useCallback(() => {
    if (!rallyEndPreview) return;
    onRallyEnd(rallyEndPreview.pointTeam, rallyEndPreview.reason);
    setRallyEndPreview(null);
    setPendingDecisionSnapshot(null);
  }, [onRallyEnd, rallyEndPreview]);

  // ── Rally end declined: go back to before the attacker/blocker was picked ──
  // For attack and block (the two skills with an explicit player-selection
  // step before ending a rally) this reverts all the way to `awaiting_player`
  // — trajectory redrawable, evaluation freely editable again — rather than
  // just reopening the post-selection eval chip. Every other terminal path
  // (serve error, ace, reception error, ...) has no such step to revert to and
  // falls back to restoring the snapshot verbatim, as before.
  const handleRallyEndChangeEvaluation = useCallback(() => {
    if (!rallyEndPreview) return;
    onUndoLastAction?.();
    const snapshot = pendingDecisionSnapshot;
    const reconstructed = snapshot
      ? reconstructAwaitingPlayerContextFromSnapshot({
          pendingTouch: snapshot.pendingTouch,
          blockerSelection: snapshot.blockerSelection,
        })
      : null;

    if (reconstructed) {
      setPhase('awaiting_player');
      setAwaitingPlayerContext(reconstructed);
      setPendingTouch(null);
      setEvalChip(null);
      setBlockerSelection(null);
      setAceVictimSelection(null);
      setSelectedPlayerId(null);
      setSelectedTeamSide(null);
      setPossessionTeam(snapshot?.possessionTeam ?? null);
      setTeamTouchCount(snapshot?.teamTouchCount ?? 0);
      setPendingBallPosition(reconstructed.destinationPoint);
      setPendingTrajectory(reconstructed.trajectory ?? null);
    } else if (snapshot) {
      setPhase(snapshot.phase);
      setPendingTouch(snapshot.pendingTouch);
      setEvalChip(snapshot.evalChip);
      setBlockerSelection(snapshot.blockerSelection);
      setAceVictimSelection(snapshot.aceVictimSelection);
      setAwaitingPlayerContext(snapshot.awaitingPlayerContext);
      setSelectedPlayerId(snapshot.selectedPlayerId);
      setSelectedTeamSide(snapshot.selectedTeamSide);
      setPossessionTeam(snapshot.possessionTeam);
      setTeamTouchCount(snapshot.teamTouchCount);
      setPendingBallPosition(snapshot.pendingBallPosition);
      setPendingTrajectory(snapshot.pendingTrajectory);
    }
    setRallyEndPreview(null);
    setPendingDecisionSnapshot(null);
  }, [onUndoLastAction, pendingDecisionSnapshot, rallyEndPreview]);

  // ── Rally end declined: cancel the action entirely ──────────────────────────
  const handleRallyEndCancel = useCallback(() => {
    if (!rallyEndPreview) return;
    onUndoLastAction?.();
    setPendingTouch(null);
    setEvalChip(null);
    setBlockerSelection(null);
    setAceVictimSelection(null);
    setAwaitingPlayerContext(null);
    setSelectedPlayerId(null);
    setSelectedTeamSide(null);
    setPendingBallPosition(null);
    setPendingTrajectory(null);
    // The undo above hasn't propagated to currentRallyTouches yet — resolve
    // the real idle/play_ready phase once it does (see the effect above).
    setPhase('awaiting_action_reset');
    setRallyEndPreview(null);
    setPendingDecisionSnapshot(null);
  }, [onUndoLastAction, rallyEndPreview]);

  // ── Evaluation change (from toolbar) ──
  const handleEvaluationChange = useCallback((evaluation: SkillEvaluation) => {
    if (evalChip) {
      handleEvalChipSelect(evaluation);
      return;
    }
    if (pendingTouch) {
      setPendingTouch(applyModifiers(updatePendingTouchEvaluation(pendingTouch, evaluation)));
    }
  }, [applyModifiers, evalChip, handleEvalChipSelect, pendingTouch]);

  // ── Derived: selectable blocker player keys ─────────────────────────────────
  const selectableBlockerPlayerKeys = (blockerSelection && phase === 'blocker_select')
    ? getValidAttackBlockers({ selection: blockerSelection, teamPlayersBySide }).map((p) => (
        getTeamScopedPlayerKey(blockerSelection.blockingTeam, p.playerId)
      ))
    : null;

  // ── Derived: selectable player keys (with ring color) ──────────────────────
  const { selectablePlayerKeys, selectionRingColor } = useMemo((): {
    selectablePlayerKeys: string[] | null;
    selectionRingColor: SelectionRingColor;
  } => {
    if (phase === 'awaiting_player' && awaitingPlayerContext) {
      const team = awaitingPlayerContext.possessionTeam;
      const players = teamPlayersBySide[team] ?? [];
      const excluded = awaitingPlayerContext.excludedPlayerIds ?? [];
      const keys = players
        .filter((p) => !excluded.includes(p.playerId))
        .map((p) => getTeamScopedPlayerKey(team, p.playerId));

      switch (awaitingPlayerContext.determinedSkill) {
        case 'attack':
          return { selectablePlayerKeys: keys, selectionRingColor: 'red' };
        case 'set':
          return { selectablePlayerKeys: keys, selectionRingColor: 'orange' };
        case 'dig':
        case 'freeball':
        case 'cover':
          return { selectablePlayerKeys: keys, selectionRingColor: 'green' };
        default:
          return { selectablePlayerKeys: keys, selectionRingColor: null };
      }
    }

    if (phase === 'blocker_select' && blockerSelection) {
      const blockKeys = getValidAttackBlockers({ selection: blockerSelection, teamPlayersBySide }).map((p) => (
        getTeamScopedPlayerKey(blockerSelection.blockingTeam, p.playerId)
      ));
      return { selectablePlayerKeys: blockKeys, selectionRingColor: 'pink' };
    }

    return { selectablePlayerKeys: null, selectionRingColor: null };
  }, [awaitingPlayerContext, blockerSelection, phase, teamPlayersBySide]);

  // ── LiveInputState for toolbar compatibility ─────────────────────────────────
  const liveInputState: LiveInputState = createLiveInputState({
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    pendingTouch,
    aceVictimSelection,
    blockerSelection,
    skillWasSelected: phase === 'attack_eval' || phase === 'reception_confirm' || phase === 'awaiting_player',
    evaluationWasSelected: phase === 'attack_eval',
    forceSkill: currentRallyTouches.length === 0 && pendingTouch?.skill === 'serve',
  });

  // ── Backward compatibility: awaitingAttackerContext alias ──────────────────
  const awaitingAttackerContext = awaitingPlayerContext && awaitingPlayerContext.determinedSkill === 'attack'
    ? {
        zone: awaitingPlayerContext.zone,
        destinationPoint: awaitingPlayerContext.destinationPoint,
        attackingTeam: awaitingPlayerContext.possessionTeam,
        ballDirection: awaitingPlayerContext.ballDirection,
        trajectory: awaitingPlayerContext.trajectory,
      }
    : null;

  return {
    phase,
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    pendingTrajectory,
    pendingTouch,
    popupAnchor: null as CourtCoordinate | null,
    rallyEndPreview,
    aceVictimSelection,
    blockerSelection,
    awaitingReceiverSelection,
    awaitingReceiverContext,
    awaitingPlayerContext,
    awaitingAttackerContext, // backward compat alias
    evalChip,
    forceSkill: false,
    liveInputState,
    selectableBlockerPlayerKeys,
    selectablePlayerKeys,
    selectionRingColor,
    teamTouchCount,
    possessionTeam,
    handleZoneSnap,
    handlePlayerSelection,
    handleBallPositionChange,
    handleBallTypeCodeChange,
    handleNumBlockersChange,
    handleEvaluationChange,
    handleEvalChipSelect,
    handleCombinationCodeChange: (code: string) => {
      if (!pendingTouch) return;
      setPendingTouch(applyModifiers({
        ...pendingTouch,
        setterCallCode: pendingTouch.skill === 'set' ? code : undefined,
        combinationCode: pendingTouch.skill === 'attack' ? code : undefined,
      }));
    },
    handleSkillChange: (skill: SkillType) => {
      if (!pendingTouch) return;
      const updated = {
        ...pendingTouch,
        skill,
        evaluation: getDefaultEvaluationForSkill(skill),
        setterCallCode: skill === 'set' ? (pendingTouch.setterCallCode ?? 'K1') : undefined,
        combinationCode: skill === 'attack' ? (pendingTouch.combinationCode ?? 'K1') : undefined,
      };
      setPendingTouch(applyModifiers(updated));
      setEvalChip(null);
    },
    handlePopupTeamChange: () => undefined,
    handlePopupPlayerChange: () => undefined,
    handleRallyEndConfirm,
    handleRallyEndChangeEvaluation,
    handleRallyEndCancel,
  };
}
