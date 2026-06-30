import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
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
  buildReceptionDrivenServeReceiveTouch,
  buildReceptionTouchForSelectedPlayer,
  buildServeErrorConfirmationTouch,
  isBallReleaseOnNet,
  canSelectReceptionDrivenServeReceiver,
  createAttackBlockerSelection,
  getValidAttackBlockers,
  isReceptionDrivenServePendingTouch,
  isServeReleaseInReceivingCourt,
  resolveAttackBlockerSelection,
  resolveAceVictimFlow,
  resolveReceptionDrivenServeEvaluationFlow,
  updatePendingTouchBallTypeCode,
  updatePendingTouchEvaluation,
  updatePendingTouchNumBlockers,
  updatePendingTouchSelection,
  type AceVictimSelection,
  type AttackBlockerSelection,
  type CourtCoordinate,
  type RallyEndPreview,
  type TeamTacticalPlayers,
} from '../rally/rally-flow';
import { getTeamScopedPlayerKey } from '../tactical/player-identity';
import { getZoneCode } from '../../model/datavolley-code';
import type { DataVolleyBallTypeCode } from '../../model/datavolley-ball-types';
import type { ScoutingMode } from '@src/domain/scouting/types';
import { getReceptionBallTarget } from '@src/config/scouting/reception-ball-placement';
import { createLiveInputState, type AwaitingReceiverContext, type LiveInputState } from './live-touch-flow-store';
import { useAppStore } from '@src/app/store/app-store';

// ─── Phase definition ─────────────────────────────────────────────────────────

/**
 * Phases of the Quick Scout flow.
 *
 * serve_drawing       → server pre-selected, user drags ball to endpoint
 * reception_confirm   → receiver selected, eval chip shown; user can change eval,
 *                       then draw trajectory to determine next skill
 * play_ready          → general play state: user draws trajectory to determine next skill
 * awaiting_player     → trajectory drawn, user taps player. Carries determinedSkill
 * attack_eval         → attack eval chip + block area visible
 * awaiting_ace_target → serve with eval # → select ace victim
 * blocker_select      → tap the blocker player
 * block_eval          → block evaluation after blocker selected
 * rally_ended         → terminal state before reset
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
  | 'block_eval'
  | 'rally_ended';

// ─── Awaiting player context ─────────────────────────────────────────────────

export type AwaitingPlayerContext = {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  possessionTeam: TeamSide;
  determinedSkill: SkillType;
  ballDirection?: BallDirection | null;
  trajectory?: BallTrajectory | null;
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
const BLOCK_EVAL_OPTIONS: SkillEvaluation[] = ['#', '+', '-', '/', '!', '='];
const RECEPTION_DEFAULT_EVAL: SkillEvaluation = '+';
const ATTACK_DEFAULT_EVAL: SkillEvaluation = '+';
const BLOCK_DEFAULT_EVAL: SkillEvaluation = '+';

// ─── Controller input ─────────────────────────────────────────────────────────

export type QuickScoutControllerInput = {
  currentRallyTouches: readonly BallTouch[];
  teamPlayersBySide: TeamTacticalPlayers;
  servingTeam: TeamSide | null;
  servingPlayerId: string | null;
  isRallyActive: boolean;
  scoutingMode?: ScoutingMode;
  courtZones?: ScoutingZone[];
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  onAceVictimSelectionChange?: (isSelecting: boolean) => void;
  selectedBallTypeCode?: DataVolleyBallTypeCode | null;
  selectedNumBlockers?: 0 | 1 | 2 | 3 | null;
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

/** Build a preview pending touch so the toolbar shows the expected skill. */
function buildPreviewTouch(ctx: AwaitingPlayerContext): PendingTouch {
  return {
    playerId: '',
    teamSide: ctx.possessionTeam,
    skill: ctx.determinedSkill,
    zone: ctx.zone,
    evaluation: getDefaultEvaluationForSkill(ctx.determinedSkill),
    destinationPoint: ctx.destinationPoint,
    ballDirection: ctx.ballDirection ?? undefined,
    trajectory: ctx.trajectory ?? undefined,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
}

/** Find nearest in-court zone for a player position. */
function findNearestZone(
  courtZones: ScoutingZone[],
  teamSide: TeamSide,
  position: { x: number; y: number },
): ScoutingZone | null {
  const inCourtZones = courtZones.filter((z) => z.kind === 'in_court' && z.teamSide === teamSide);
  if (inCourtZones.length === 0) return null;
  return inCourtZones.reduce<ScoutingZone>((nearest, z2) => {
    const d1 = Math.hypot(z2.center.x - position.x, z2.center.y - position.y);
    const d2 = Math.hypot(nearest.center.x - position.x, nearest.center.y - position.y);
    return d1 < d2 ? z2 : nearest;
  }, inCourtZones[0]);
}

/** Build inferred set touches for auto-setter assignment. */
function buildInferredSetTouches(
  teamPlayersBySide: TeamTacticalPlayers,
  possessionTeam: TeamSide,
  courtZones: ScoutingZone[],
  isGoodReception: boolean,
): PendingTouch[] {
  const setterPlayer = teamPlayersBySide[possessionTeam]?.find((p) => p.isSetter);
  if (!setterPlayer || !courtZones.length) return [];

  const setterZone = findNearestZone(courtZones, possessionTeam, setterPlayer);
  if (!setterZone) return [];

  return [{
    playerId: setterPlayer.playerId,
    teamSide: possessionTeam,
    skill: 'set',
    zone: setterZone,
    evaluation: '+',
    setterCallCode: isGoodReception ? 'K1' : undefined,
    destinationPoint: { x: setterPlayer.x, y: setterPlayer.y },
    source: 'inferred',
    touchOrigin: 'implicit_inference',
    inferenceReason: 'setter_after_receive',
  }];
}

// ─── Controller ───────────────────────────────────────────────────────────────

export function useQuickScoutFlowController({
  currentRallyTouches,
  teamPlayersBySide,
  servingTeam,
  servingPlayerId,
  isRallyActive,
  courtZones,
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  onAceVictimSelectionChange,
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
  const [awaitingReceiverSelection, setAwaitingReceiverSelection] = useState(false);
  const [awaitingReceiverContext, setAwaitingReceiverContext] = useState<AwaitingReceiverContext | null>(null);
  const [awaitingPlayerContext, setAwaitingPlayerContext] = useState<AwaitingPlayerContext | null>(null);
  const [teamTouchCount, setTeamTouchCount] = useState(0);
  const [possessionTeam, setPossessionTeam] = useState<TeamSide | null>(null);

  const previousTouch = currentRallyTouches.at(-1);

  // ── Reset on rally deactivation ────────────────────────────────────────────
  useEffect(() => {
    if (!isRallyActive) {
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
      setAwaitingReceiverSelection(false);
      setAwaitingReceiverContext(null);
      setAwaitingPlayerContext(null);
      setTeamTouchCount(0);
      setPossessionTeam(null);
    }
  }, [isRallyActive, servingPlayerId, servingTeam]);

  // ── Set preview touch when entering awaiting_player ─────────────────────────
  useEffect(() => {
    if (phase === 'awaiting_player' && awaitingPlayerContext && !pendingTouch?.playerId) {
      setPendingTouch(buildPreviewTouch(awaitingPlayerContext));
    }
  }, [phase, awaitingPlayerContext, pendingTouch?.playerId]);

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
    if (touches.length === 0) return;
    onTouchesCommitted(touches);
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
    const inferredSetTouches = (!skipInferredSet && courtZones?.length)
      ? buildInferredSetTouches(teamPlayersBySide, thePossessionTeam, courtZones, isGoodReception)
      : [];
    commitTouches([...result.touches, ...inferredSetTouches]);
    setEvalChip(null);
    return { touches: [...result.touches, ...inferredSetTouches], isGoodReception, rallyEnded: false };
  }, [commitTouches, courtZones, endRally, teamPlayersBySide]);

  // ── Trajectory-based skill detection ───────────────────────────────────────
  const determineSkillFromTrajectory = useCallback((
    zone: ScoutingZone,
    releasePoint: CourtCoordinate,
    currentPossessionTeam: TeamSide,
    currentTouchCount: number,
  ): { determinedSkill: SkillType; crossesNet: boolean; isOnNet: boolean } => {
    const isOnNet = isBallReleaseOnNet(releasePoint);
    const isOpponentCourt = zone.kind === 'in_court' && zone.teamSide !== currentPossessionTeam;
    const crossesNet = isOpponentCourt || isOnNet;

    if (crossesNet) {
      return { determinedSkill: 'attack', crossesNet: true, isOnNet };
    }

    // Ball stays in own court
    if (currentTouchCount === 0) {
      return { determinedSkill: 'dig', crossesNet: false, isOnNet: false };
    }
    return { determinedSkill: 'set', crossesNet: false, isOnNet: false };
  }, []);

  // ── Zone snap (ball drag endpoint) ────────────────────────────────────────
  const handleZoneSnap = useCallback((
    zone: ScoutingZone,
    destinationPoint?: CourtCoordinate,
    ballDirection?: BallDirection,
  ) => {
    if (aceVictimSelection || (blockerSelection && phase !== 'blocker_select') || awaitingReceiverSelection) return;

    onSelectedZoneChange(zone);

    if (zone.kind === 'serve_start') {
      return;
    }

    const releasePoint = ballDirection?.end ?? destinationPoint ?? zone.center;

    // ── SERVE PHASE ───────────────────────────────────────────────────────────
    const isServeDraw = phase === 'serve_drawing'
      || (phase === 'idle' && currentRallyTouches.length === 0 && servingTeam && servingPlayerId);

    if (isServeDraw && servingTeam && servingPlayerId) {
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
      const { determinedSkill, crossesNet, isOnNet } = determineSkillFromTrajectory(
        zone, releasePoint, currentPossessionTeam, 1, // After reception, this is the 2nd touch (set)
      );

      // First commit the reception (skip inferred set if user is explicitly drawing a set)
      if (pendingTouch && isReceptionDrivenServePendingTouch(pendingTouch)) {
        const currentEval = evalChip?.current ?? RECEPTION_DEFAULT_EVAL;
        const resolved = commitReceptionAndResolve(pendingTouch, currentEval, currentPossessionTeam, determinedSkill === 'set');
        if (!resolved || resolved.rallyEnded) return;
      }

      if (determinedSkill === 'set') {
        // Trajectory stays in own court → SET
        const isGoodReception = (evalChip?.current === '#' || evalChip?.current === '+') ?? true;
        const setters = teamPlayersBySide[currentPossessionTeam]?.filter((p) => p.isSetter) ?? [];

        if (setters.length === 1) {
          // Auto-assign setter — keep as pendingTouch so toolbar shows set controls
          const setter = setters[0];
          const setterZone = courtZones ? findNearestZone(courtZones, currentPossessionTeam, setter) : null;
          if (setterZone) {
            const setTrajectory = touchDirection
              ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'set', evaluation: '+', direction: touchDirection })
              : null;
            const setTouch: PendingTouch = applyModifiers({
              playerId: setter.playerId,
              teamSide: currentPossessionTeam,
              skill: 'set',
              zone: setterZone,
              evaluation: '+',
              setterCallCode: isGoodReception ? 'K1' : undefined,
              destinationPoint: releasePoint,
              ballDirection: touchDirection ?? undefined,
              trajectory: setTrajectory ?? undefined,
              source: 'explicit',
              touchOrigin: 'live_scouting',
            });
            setPendingTouch(setTouch);
            setSelectedPlayerId(setter.playerId);
            setSelectedTeamSide(currentPossessionTeam);
            setPendingBallPosition(releasePoint);
            setPendingTrajectory(setTrajectory);
            setAwaitingPlayerContext(null);
            setPhase('play_ready');
            setTeamTouchCount(2);
            setPossessionTeam(currentPossessionTeam);
            return;
          }
        }

        // 0 or 2+ setters → go to awaiting_player with determinedSkill 'set'
        const setTrajectory = touchDirection
          ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'set', evaluation: '+', direction: touchDirection })
          : null;
        setAwaitingPlayerContext({
          zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
          determinedSkill: 'set', ballDirection: touchDirection, trajectory: setTrajectory,
        });
        setPendingTouch(null);
        setPendingBallPosition(releasePoint);
        setPendingTrajectory(setTrajectory);
        setSelectedPlayerId(null);
        setSelectedTeamSide(currentPossessionTeam);
        setPhase('awaiting_player');
        return;
      }

      // determinedSkill === 'attack' (crosses net or on net)
      const attackEval = isOnNet ? '/' as SkillEvaluation : ATTACK_DEFAULT_EVAL;
      const attackTrajectory = touchDirection
        ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'attack', evaluation: attackEval, direction: touchDirection })
        : null;

      setAwaitingPlayerContext({
        zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
        determinedSkill: 'attack', ballDirection: touchDirection, trajectory: attackTrajectory,
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

      // Commit any pending touch (e.g. set that was shown in toolbar) before processing new trajectory
      if (pendingTouch && pendingTouch.playerId) {
        commitTouches([pendingTouch]);
        setPendingTouch(null);
      }

      const touchDirection = createTouchDirection(ballDirection, zone);
      const { determinedSkill, crossesNet, isOnNet } = determineSkillFromTrajectory(
        zone, releasePoint, currentPossessionTeam, teamTouchCount,
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
        setAwaitingPlayerContext({
          zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
          determinedSkill: 'set', ballDirection: touchDirection, trajectory: setTrajectory,
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
      const attackEval = isOnNet ? '/' as SkillEvaluation : ATTACK_DEFAULT_EVAL;
      const attackTrajectory = touchDirection
        ? createBallTrajectory({ teamSide: currentPossessionTeam, skill: 'attack', evaluation: attackEval, direction: touchDirection })
        : null;

      setAwaitingPlayerContext({
        zone, destinationPoint: releasePoint, possessionTeam: currentPossessionTeam,
        determinedSkill: 'attack', ballDirection: touchDirection, trajectory: attackTrajectory,
      });
      setPendingTouch(null);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(attackTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(currentPossessionTeam);
      setPhase('awaiting_player');
    }
  }, [
    aceVictimSelection,
    applyModifiers,
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
    phase,
    possessionTeam,
    servingPlayerId,
    servingTeam,
    teamPlayersBySide,
    teamTouchCount,
  ]);

  // ── Player selection ────────────────────────────────────────────────────────
  const handlePlayerSelection = useCallback((playerId: string, teamSide: TeamSide) => {
    // Blocker selection (in blocker_select phase)
    if (blockerSelection && phase === 'blocker_select') {
      const resolved = resolveAttackBlockerSelection({
        selection: blockerSelection,
        playerId,
        teamSide,
        teamPlayersBySide,
      });
      if (!resolved) return;

      setSelectedPlayerId(playerId);
      setSelectedTeamSide(blockerSelection.blockingTeam);

      // Show block eval chip — store resolved touches in pendingTouch for reference
      setEvalChip({ options: BLOCK_EVAL_OPTIONS, current: BLOCK_DEFAULT_EVAL });
      setPhase('block_eval');
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

    // Awaiting player: user taps who performed the skill after drawing trajectory
    if (phase === 'awaiting_player' && awaitingPlayerContext) {
      if (teamSide !== awaitingPlayerContext.possessionTeam) return;

      const player = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (!player) return;

      const nearestZone = courtZones ? findNearestZone(courtZones, teamSide, player) : awaitingPlayerContext.zone;
      const physicalStartSide = (nearestZone ?? awaitingPlayerContext.zone).center.x < 50 ? 'away' as const : 'home' as const;
      const startZone = nearestZone ?? awaitingPlayerContext.zone;

      const { determinedSkill } = awaitingPlayerContext;

      if (determinedSkill === 'attack') {
        // Create attack touch → show attack eval chip
        const lastTouch = currentRallyTouches.at(-1);
        const isGoodReception = lastTouch?.skill === 'receive'
          ? (lastTouch.evaluation === '#' || lastTouch.evaluation === '+')
          : (lastTouch?.skill === 'set');

        const attackTouch = applyModifiers({
          playerId,
          teamSide,
          skill: 'attack' as const,
          zone: awaitingPlayerContext.zone,
          evaluation: ATTACK_DEFAULT_EVAL,
          destinationPoint: awaitingPlayerContext.destinationPoint,
          ballDirection: awaitingPlayerContext.ballDirection ?? undefined,
          trajectory: awaitingPlayerContext.trajectory ?? undefined,
          startZoneCode: getZoneCode({
            teamSide: physicalStartSide, zoneId: startZone.id,
            gridCoordinate: startZone.gridCoordinate, point: startZone.center,
          }),
          combinationCode: isGoodReception ? 'K1' : undefined,
          source: 'explicit',
          touchOrigin: 'live_scouting',
        });

        setPendingTouch(attackTouch);
        setSelectedPlayerId(playerId);
        setSelectedTeamSide(teamSide);
        setAwaitingPlayerContext(null);
        setEvalChip({ options: ATTACK_EVAL_OPTIONS, current: ATTACK_DEFAULT_EVAL });
        setPhase('attack_eval');
        return;
      }

      if (determinedSkill === 'set') {
        // Create set touch, auto-commit if non-terminal
        const setTouch = applyModifiers({
          playerId,
          teamSide,
          skill: 'set' as const,
          zone: startZone,
          evaluation: '+' as SkillEvaluation,
          destinationPoint: awaitingPlayerContext.destinationPoint,
          ballDirection: awaitingPlayerContext.ballDirection ?? undefined,
          trajectory: awaitingPlayerContext.trajectory ?? undefined,
          setterCallCode: 'K1',
          source: 'explicit',
          touchOrigin: 'live_scouting',
        });

        // Set with '=' is terminal (error) — end rally
        // For now set is always '+' by default, so auto-commit and continue
        commitTouches([setTouch]);
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

      // dig / freeball / cover — create touch, auto-commit, continue
      const touch = applyModifiers({
        playerId,
        teamSide,
        skill: determinedSkill as SkillType,
        zone: startZone,
        evaluation: getDefaultEvaluationForSkill(determinedSkill),
        destinationPoint: awaitingPlayerContext.destinationPoint,
        ballDirection: awaitingPlayerContext.ballDirection ?? undefined,
        trajectory: awaitingPlayerContext.trajectory ?? undefined,
        source: 'explicit',
        touchOrigin: 'live_scouting',
      });

      commitTouches([touch]);
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
    currentRallyTouches,
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
      setPendingTouch(applyModifiers(updated));
      setEvalChip({ ...evalChip, current: evaluation });

      const ballTarget = courtZones
        ? getReceptionBallTarget(evaluation, pendingTouch.teamSide, courtZones)
        : null;
      if (ballTarget) {
        setPendingBallPosition(ballTarget);
      }

      // = means reception error → auto-commit and end rally
      if (evaluation === '=') {
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
      }
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
        const blockerSel = createAttackBlockerSelection(updatedTouch, 'quick');
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
        const blockerSel = createAttackBlockerSelection(updatedTouch, 'quick');
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

    // Block eval chip (in block_eval phase)
    if (phase === 'block_eval' && blockerSelection) {
      const attackingTeam = blockerSelection.attackTouch.teamSide;
      const blockingTeam = blockerSelection.blockingTeam;

      // Resolve and commit the attack + block touches
      const resolved = resolveAttackBlockerSelection({
        selection: { ...blockerSelection, blockEvaluation: evaluation },
        playerId: selectedPlayerId ?? '',
        teamSide: blockingTeam,
        teamPlayersBySide,
      });

      if (evaluation === '#') {
        // B# → point for blocking team, rally ends
        if (resolved) {
          commitTouches(resolved.touches);
        }
        endRally(blockingTeam, 'block_kill');
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        setEvalChip(null);
        setBlockerSelection(null);
        setTeamTouchCount(0);
        setPossessionTeam(null);
        return;
      }

      if (evaluation === '=' || evaluation === '/') {
        // B= or B/ → point for attacking team, rally ends
        if (resolved) {
          commitTouches(resolved.touches);
        }
        endRally(attackingTeam, evaluation === '=' ? 'block_error' : 'block_invasion');
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        setEvalChip(null);
        setBlockerSelection(null);
        setTeamTouchCount(0);
        setPossessionTeam(null);
        return;
      }

      if (evaluation === '+') {
        // B+ → rally continues, blocking team has possession
        if (resolved) {
          commitTouches(resolved.touches);
        }
        setPhase('play_ready');
        setEvalChip(null);
        setBlockerSelection(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(blockingTeam);
        setTeamTouchCount(0); // New possession for blocking team
        setPossessionTeam(blockingTeam);
        return;
      }

      if (evaluation === '-' || evaluation === '!') {
        // B- or B! → rally continues, attacking team has possession
        if (resolved) {
          commitTouches(resolved.touches);
        }
        setPhase('play_ready');
        setEvalChip(null);
        setBlockerSelection(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(attackingTeam);
        setTeamTouchCount(0); // New possession (cover situation)
        setPossessionTeam(attackingTeam);
        return;
      }
    }
  }, [
    applyModifiers,
    blockerSelection,
    commitTouches,
    courtZones,
    endRally,
    evalChip,
    pendingTouch,
    pendingTrajectory,
    phase,
    selectedPlayerId,
    teamPlayersBySide,
  ]);

  // ── Ball type and blocker count ─────────────────────────────────────────────
  const handleBallTypeCodeChange = useCallback((code: DataVolleyBallTypeCode) => {
    setPendingTouch((t) => t ? updatePendingTouchBallTypeCode(t, code) : t);
  }, []);

  const handleNumBlockersChange = useCallback((numBlockers: 0 | 1 | 2 | 3) => {
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
  }, [onRallyEnd, rallyEndPreview]);

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
  const selectableBlockerPlayerKeys = (blockerSelection && (phase === 'blocker_select' || phase === 'block_eval'))
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
      const keys = players.map((p) => getTeamScopedPlayerKey(team, p.playerId));

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

    if ((phase === 'blocker_select' || phase === 'block_eval') && blockerSelection) {
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
    skillWasSelected: phase === 'attack_eval' || phase === 'reception_confirm' || phase === 'block_eval' || phase === 'awaiting_player',
    evaluationWasSelected: phase === 'attack_eval' || phase === 'block_eval',
    forceSkill: currentRallyTouches.length === 0 && pendingTouch?.skill === 'serve',
    scoutingMode: 'quick',
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
  };
}
