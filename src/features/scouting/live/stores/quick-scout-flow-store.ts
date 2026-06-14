import { useCallback, useEffect, useState } from 'react';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
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
  buildServeErrorConfirmationTouch,
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
import { createLiveInputState, type LiveInputState } from './live-touch-flow-store';

// ─── Phase definition ─────────────────────────────────────────────────────────

/**
 * Phases of the Quick Scout flow.
 *
 * serve_drawing      → server pre-selected, user drags ball to endpoint
 * reception_confirm  → pending serve+receive built with default eval (+);
 *                      reception chip shown; tapping an attacker commits and continues
 * attack_select      → reception committed, waiting for attacker tap
 * attack_pending     → attacker selected, optional start-zone tap, then drag to endpoint
 * attack_eval        → endpoint placed in opponent court; eval chip visible (default #)
 * awaiting_ace_target→ serve with eval # → select ace victim
 * blocker_select     → attack eval / → select blocker player
 * rally_ended        → terminal state before reset
 */
export type QuickScoutPhase =
  | 'idle'
  | 'serve_drawing'
  | 'reception_confirm'
  | 'attack_select'
  | 'attack_pending'
  | 'attack_eval'
  | 'awaiting_ace_target'
  | 'blocker_select'
  | 'rally_ended';

// ─── Eval chip ────────────────────────────────────────────────────────────────

export type QuickEvalChip = {
  options: SkillEvaluation[];
  current: SkillEvaluation;
};

const RECEPTION_EVAL_OPTIONS: SkillEvaluation[] = ['+', '!', '-', '='];
const ATTACK_EVAL_OPTIONS: SkillEvaluation[] = ['#', '+', '-', '/', '!'];
const RECEPTION_DEFAULT_EVAL: SkillEvaluation = '+';
const ATTACK_DEFAULT_EVAL: SkillEvaluation = '#';

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
    }
  }, [isRallyActive, servingPlayerId, servingTeam]);

  // ── Auto-select server at start of rally ───────────────────────────────────
  useEffect(() => {
    if (!servingPlayerId || !servingTeam || selectedPlayerId || pendingTouch || blockerSelection) {
      return;
    }
    if (currentRallyTouches.length > 0) return;

    setSelectedPlayerId(servingPlayerId);
    setSelectedTeamSide(servingTeam);
    if (phase === 'idle') setPhase('serve_drawing');
  }, [blockerSelection, currentRallyTouches.length, pendingTouch, phase, selectedPlayerId, servingPlayerId, servingTeam]);

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

  const endRally = useCallback((pointTeam: TeamSide, reason: string) => {
    setRallyEndPreview({ pointTeam, reason });
  }, []);

  // ── Zone snap (ball drag endpoint) ────────────────────────────────────────
  const handleZoneSnap = useCallback((
    zone: ScoutingZone,
    destinationPoint?: CourtCoordinate,
    ballDirection?: BallDirection,
  ) => {
    if (aceVictimSelection || blockerSelection) return;

    onSelectedZoneChange(zone);
    const releasePoint = ballDirection?.end ?? destinationPoint ?? zone.center;

    // ── SERVE PHASE ───────────────────────────────────────────────────────────
    const isServeDraw = phase === 'serve_drawing'
      || (currentRallyTouches.length === 0 && servingTeam && servingPlayerId);

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
        onRallyEnd(getOppositeTeamSide(servingTeam), 'serve_error');
        setPhase('rally_ended');
        setSelectedPlayerId(servingPlayerId);
        setSelectedTeamSide(servingTeam);
        return;
      }

      const receptionDrivenTouch = buildReceptionDrivenServeReceiveTouch({
        zone,
        destinationPoint: releasePoint,
        servingTeam,
        servingPlayerId,
        teamPlayersBySide,
        evaluation: RECEPTION_DEFAULT_EVAL,
        serveDirection: touchDirection,
        serveTrajectory,
      });

      if (!receptionDrivenTouch) {
        // No receiver auto-selected (no player nearby) — fall through to serve error
        const errorTouch = buildServeErrorConfirmationTouch({
          zone,
          destinationPoint: releasePoint,
          servingTeam,
          servingPlayerId,
          serveDirection: touchDirection,
          serveTrajectory,
        });
        setPendingTouch(applyModifiers(errorTouch));
        setPendingBallPosition(releasePoint);
        setPendingTrajectory(serveTrajectory);
        setSelectedPlayerId(servingPlayerId);
        setSelectedTeamSide(servingTeam);
        setEvalChip(null);
        setPhase('serve_drawing');
        return;
      }

      const typedTouch = applyModifiers(receptionDrivenTouch);
      setPendingTouch(typedTouch);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(serveTrajectory);
      setSelectedPlayerId(typedTouch.playerId ?? null);
      setSelectedTeamSide(typedTouch.teamSide);
      // Show reception eval chip; default is already set to +
      // The chip is non-blocking: tapping an attacker proceeds with the current eval
      setEvalChip({ options: RECEPTION_EVAL_OPTIONS, current: RECEPTION_DEFAULT_EVAL });
      setPhase('reception_confirm');
      return;
    }

    // ── ATTACK PHASE ──────────────────────────────────────────────────────────
    if ((phase === 'attack_pending') && pendingTouch) {
      const attackingTeam = pendingTouch.teamSide;
      const touchDirection = createTouchDirection(ballDirection, zone);
      const { evaluation, isAmbiguous } = inferAttackEvalFromZone(zone, attackingTeam);

      const attackTrajectory = touchDirection
        ? createBallTrajectory({
            teamSide: attackingTeam,
            skill: 'attack',
            evaluation,
            direction: touchDirection,
          })
        : null;

      const updatedTouch = applyModifiers({
        ...pendingTouch,
        zone,
        evaluation,
        destinationPoint: releasePoint,
        ballDirection: touchDirection,
        trajectory: attackTrajectory ?? undefined,
      });

      if (!isAmbiguous) {
        // Clear evaluation (out / net) — auto-commit, rally ends
        const pointTeam = evaluation === '=' ? getOppositeTeamSide(attackingTeam) : attackingTeam;
        commitTouches([updatedTouch]);
        onRallyEnd(pointTeam, `attack_${evaluation}`);
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        return;
      }

      // Ambiguous: ball in opponent court → show chip (default #)
      setPendingTouch(updatedTouch);
      setPendingBallPosition(releasePoint);
      setPendingTrajectory(attackTrajectory);
      setEvalChip({ options: ATTACK_EVAL_OPTIONS, current: evaluation });
      setPhase('attack_eval');
    }
  }, [
    aceVictimSelection,
    applyModifiers,
    blockerSelection,
    commitTouches,
    currentRallyTouches.length,
    onRallyEnd,
    onSelectedZoneChange,
    pendingTouch,
    phase,
    servingPlayerId,
    servingTeam,
    teamPlayersBySide,
  ]);

  // ── Player selection ────────────────────────────────────────────────────────
  const handlePlayerSelection = useCallback((playerId: string, teamSide: TeamSide) => {
    // Blocker selection after blocked attack
    if (blockerSelection) {
      const resolved = resolveAttackBlockerSelection({
        selection: blockerSelection,
        playerId,
        teamSide,
        teamPlayersBySide,
      });
      if (!resolved) return;

      setSelectedPlayerId(null);
      setSelectedTeamSide(null);
      setBlockerSelection(null);
      setAceVictimSelection(null);
      setRallyEndPreview(null);
      setPendingBallPosition(null);
      setPendingTrajectory(null);
      setEvalChip(null);
      commitTouches(resolved.touches);
      onRallyEnd(resolved.pointTeam, resolved.reason);
      setPhase('rally_ended');
      return;
    }

    // Ace victim selection
    if (aceVictimSelection) {
      const resolved = resolveAceVictimFlow({ selection: aceVictimSelection, playerId, teamSide });
      if (!resolved) return;

      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAceVictimSelection(null);
      setRallyEndPreview(null);
      setPendingBallPosition(null);
      setEvalChip(null);
      commitTouches(resolved.touches);
      onRallyEnd(resolved.pointTeam, resolved.reason);
      setPhase('rally_ended');
      return;
    }

    // Reception confirm: allow changing receiver or select attacker to proceed
    if (phase === 'reception_confirm' && pendingTouch) {
      const receivingTeam = pendingTouch.teamSide;

      if (teamSide === receivingTeam && canSelectReceptionDrivenServeReceiver(pendingTouch, teamSide)) {
        // Change receiver while still in reception_confirm
        const updated = updatePendingTouchSelection(pendingTouch, playerId, teamSide);
        setPendingTouch(applyModifiers(updated));
        setSelectedPlayerId(playerId);
        setSelectedTeamSide(teamSide);
        return;
      }

      // Tapping an attacker (opposite team) commits serve+receive and enters attack_pending
      if (teamSide !== receivingTeam) {
        const currentEval = evalChip?.current ?? RECEPTION_DEFAULT_EVAL;
        const touchWithEval = updatePendingTouchEvaluation(pendingTouch, currentEval);
        const result = resolveReceptionDrivenServeEvaluationFlow(touchWithEval);
        if (!result) return;

        if (result.kind === 'rally_ended') {
          commitTouches(result.touches);
          onRallyEnd(result.preview.pointTeam, result.preview.reason);
          setPhase('rally_ended');
          setSelectedPlayerId(null);
          setSelectedTeamSide(null);
          setEvalChip(null);
          return;
        }

        commitTouches(result.touches);
        setEvalChip(null);

        // Now build attack pending touch for selected attacker
        const attackingTeam = teamSide;
        const attackPlayer = teamPlayersBySide[attackingTeam]?.find((p) => p.playerId === playerId);
        if (!attackPlayer || !courtZones?.length) {
          setSelectedPlayerId(playerId);
          setSelectedTeamSide(attackingTeam);
          setPhase('attack_select');
          return;
        }

        const attackTouch = buildAttackTouchForPlayer({
          playerId,
          teamSide: attackingTeam,
          player: attackPlayer,
          courtZones,
          previousTouch: result.touches.at(-1) ?? previousTouch ?? null,
        });
        if (!attackTouch) {
          setSelectedPlayerId(playerId);
          setSelectedTeamSide(attackingTeam);
          setPhase('attack_select');
          return;
        }

        setPendingTouch(applyModifiers(attackTouch));
        setPendingBallPosition({ x: attackPlayer.x, y: attackPlayer.y });
        setSelectedPlayerId(playerId);
        setSelectedTeamSide(attackingTeam);
        setPhase('attack_pending');
        return;
      }
    }

    // Attack select: tap a player to become the attacker
    if (phase === 'attack_select') {
      const attackPlayer = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (!attackPlayer || !courtZones?.length) {
        setSelectedPlayerId(playerId);
        setSelectedTeamSide(teamSide);
        setPhase('attack_pending');
        return;
      }

      const attackTouch = buildAttackTouchForPlayer({
        playerId,
        teamSide,
        player: attackPlayer,
        courtZones,
        previousTouch: previousTouch ?? null,
      });
      if (!attackTouch) {
        setSelectedPlayerId(playerId);
        setSelectedTeamSide(teamSide);
        setPhase('attack_pending');
        return;
      }

      setPendingTouch(applyModifiers(attackTouch));
      setPendingBallPosition({ x: attackPlayer.x, y: attackPlayer.y });
      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setPhase('attack_pending');
    }
  }, [
    aceVictimSelection,
    applyModifiers,
    blockerSelection,
    commitTouches,
    courtZones,
    evalChip,
    onRallyEnd,
    pendingTouch,
    phase,
    previousTouch,
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

      // = means reception error → auto-commit and end rally
      if (evaluation === '=') {
        const result = resolveReceptionDrivenServeEvaluationFlow(updated);
        if (!result) return;
        commitTouches(result.touches);
        if (result.kind === 'rally_ended') {
          onRallyEnd(result.preview.pointTeam, result.preview.reason);
          setPhase('rally_ended');
          setSelectedPlayerId(null);
          setSelectedTeamSide(null);
          setEvalChip(null);
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
        onRallyEnd(updatedTouch.teamSide, 'attack_kill');
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        setEvalChip(null);
        return;
      }

      if (evaluation === '=') {
        // Attack error — rally ends, opponent wins point
        commitTouches([updatedTouch]);
        onRallyEnd(getOppositeTeamSide(updatedTouch.teamSide), 'attack_error');
        setPhase('rally_ended');
        setSelectedPlayerId(null);
        setSelectedTeamSide(null);
        setEvalChip(null);
        return;
      }

      if (evaluation === '/') {
        // Blocked for point — enter blocker selection
        const blockerSel = createAttackBlockerSelection(updatedTouch, 'simple');
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
        onRallyEnd(getOppositeTeamSide(updatedTouch.teamSide), 'attack_blocked');
        setPhase('rally_ended');
        setEvalChip(null);
        return;
      }

      if (evaluation === '+' || evaluation === '-') {
        // Defended — rally continues with next attack from opponent
        commitTouches([updatedTouch]);
        setPhase('attack_select');
        setEvalChip(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(getOppositeTeamSide(updatedTouch.teamSide));
        return;
      }

      if (evaluation === '!') {
        // Blocked but recovered — team continues with cover/attack
        commitTouches([updatedTouch]);
        setPhase('attack_select');
        setEvalChip(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(updatedTouch.teamSide);
      }
    }
  }, [
    applyModifiers,
    commitTouches,
    evalChip,
    onRallyEnd,
    pendingTouch,
    pendingTrajectory,
    phase,
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

  // ── Evaluation change (from toolbar — kept for blocker/ace compatibility) ──
  const handleEvaluationChange = useCallback((evaluation: SkillEvaluation) => {
    handleEvalChipSelect(evaluation);
  }, [handleEvalChipSelect]);

  // ── Derived: selectable blocker player keys ─────────────────────────────────
  const selectableBlockerPlayerKeys = blockerSelection
    ? getValidAttackBlockers({ selection: blockerSelection, teamPlayersBySide }).map((p) => (
        getTeamScopedPlayerKey(blockerSelection.blockingTeam, p.playerId)
      ))
    : null;

  // ── LiveInputState for toolbar compatibility ─────────────────────────────────
  const liveInputState: LiveInputState = createLiveInputState({
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    pendingTouch,
    aceVictimSelection,
    blockerSelection,
    skillWasSelected: phase === 'attack_pending' || phase === 'attack_eval',
    evaluationWasSelected: phase === 'attack_eval' || phase === 'reception_confirm',
    forceSkill: currentRallyTouches.length === 0 && pendingTouch?.skill === 'serve',
    scoutingMode: 'quick',
  });

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
    evalChip,
    forceSkill: false,
    liveInputState,
    selectableBlockerPlayerKeys,
    handleZoneSnap,
    handlePlayerSelection,
    handleBallPositionChange,
    handleBallTypeCodeChange,
    handleNumBlockersChange,
    handleEvaluationChange,
    handleEvalChipSelect,
    handleSkillChange: () => undefined,
    handlePopupTeamChange: () => undefined,
    handlePopupPlayerChange: () => undefined,
    handleRallyEndConfirm,
  };
}

// ─── Helper: build pending attack touch for a player ─────────────────────────

function buildAttackTouchForPlayer(input: {
  playerId: string;
  teamSide: TeamSide;
  player: { x: number; y: number };
  courtZones: ScoutingZone[];
  previousTouch: Pick<BallTouch, 'playerId' | 'teamSide' | 'skill' | 'evaluation'> | null;
}): PendingTouch | null {
  const inCourtZones = input.courtZones.filter((z) => z.kind === 'in_court' && z.teamSide === input.teamSide);
  if (inCourtZones.length === 0) return null;

  const nearestZone = inCourtZones.reduce<ScoutingZone>((nearest, zone) => {
    const d1 = Math.hypot(zone.center.x - input.player.x, zone.center.y - input.player.y);
    const d2 = Math.hypot(nearest.center.x - input.player.x, nearest.center.y - input.player.y);
    return d1 < d2 ? zone : nearest;
  }, inCourtZones[0]);

  return {
    playerId: input.playerId,
    teamSide: input.teamSide,
    skill: 'attack',
    zone: nearestZone,
    evaluation: getDefaultEvaluationForSkill('attack'),
    destinationPoint: { x: input.player.x, y: input.player.y },
    startZoneCode: getZoneCode({
      teamSide: nearestZone.teamSide,
      zoneId: nearestZone.id,
      gridCoordinate: nearestZone.gridCoordinate,
      point: nearestZone.center,
    }),
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
}
