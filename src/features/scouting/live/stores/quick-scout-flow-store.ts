import { useCallback, useEffect, useState } from 'react';
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

// ─── Phase definition ─────────────────────────────────────────────────────────

/**
 * Phases of the Quick Scout flow.
 *
 * serve_drawing       → server pre-selected, user drags ball to endpoint
 * reception_confirm   → receiver selected, eval chip shown; user can change eval,
 *                       drag ball across net (attack), or tap a player
 * awaiting_attacker   → ball dragged across net; user taps who attacked
 * attack_select       → general play state: user can drag or tap next player
 * attack_pending      → attacker selected with start zone, drag to endpoint
 * attack_eval         → endpoint placed; eval chip visible (default #)
 * awaiting_ace_target → serve with eval # → select ace victim
 * block_zone_select   → attack eval / → tap the net zone where block occurred
 * blocker_select      → tap the blocker player
 * rally_ended         → terminal state before reset
 */
export type QuickScoutPhase =
  | 'idle'
  | 'serve_drawing'
  | 'reception_confirm'
  | 'awaiting_attacker'
  | 'attack_select'
  | 'attack_pending'
  | 'attack_eval'
  | 'awaiting_ace_target'
  | 'block_zone_select'
  | 'blocker_select'
  | 'rally_ended';

// ─── Eval chip ────────────────────────────────────────────────────────────────

export type QuickEvalChip = {
  options: SkillEvaluation[];
  current: SkillEvaluation;
};

const RECEPTION_EVAL_OPTIONS: SkillEvaluation[] = ['#', '+', '!', '-', '='];
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
  const [awaitingReceiverSelection, setAwaitingReceiverSelection] = useState(false);
  const [awaitingReceiverContext, setAwaitingReceiverContext] = useState<AwaitingReceiverContext | null>(null);
  const [awaitingAttackerContext, setAwaitingAttackerContext] = useState<{
    zone: ScoutingZone;
    destinationPoint: CourtCoordinate;
    attackingTeam: TeamSide;
    ballDirection?: BallDirection | null;
    trajectory?: BallTrajectory | null;
  } | null>(null);

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
      setAwaitingAttackerContext(null);
    }
  }, [isRallyActive, servingPlayerId, servingTeam]);

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

  const endRally = useCallback((pointTeam: TeamSide, reason: string) => {
    setRallyEndPreview({ pointTeam, reason });
  }, []);

  // ── Zone snap (ball drag endpoint) ────────────────────────────────────────
  const handleZoneSnap = useCallback((
    zone: ScoutingZone,
    destinationPoint?: CourtCoordinate,
    ballDirection?: BallDirection,
  ) => {
    // In block_zone_select, zone snaps are needed to capture the contact point.
    if (aceVictimSelection || (blockerSelection && phase !== 'block_zone_select') || awaitingReceiverSelection) return;

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
        onRallyEnd(getOppositeTeamSide(servingTeam), 'serve_error');
        setPhase('rally_ended');
        setSelectedPlayerId(servingPlayerId);
        setSelectedTeamSide(servingTeam);
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
      return;
    }

    // ── POST-RECEPTION / GENERAL PLAY ─────────────────────────────────────────
    if (phase === 'reception_confirm' || phase === 'attack_select') {
      const lastCommittedTouch = currentRallyTouches.at(-1);
      const possessionTeam = lastCommittedTouch?.teamSide
        ?? pendingTouch?.teamSide
        ?? (servingTeam ? getOppositeTeamSide(servingTeam) : null);

      if (!possessionTeam) return;

      // Tap or drag within own court → move ball to attack start position (no touch created)
      if (zone.kind === 'in_court' && zone.teamSide === possessionTeam && !isBallReleaseOnNet(releasePoint)) {
        setPendingBallPosition(releasePoint);
        return;
      }

      if (!ballDirection) return;

      const touchDirection = createTouchDirection(ballDirection, zone);

      if (isBallReleaseOnNet(releasePoint)) {
        // Ball released on the net → block (A/)
        const attackTrajectory = touchDirection
          ? createBallTrajectory({ teamSide: possessionTeam, skill: 'attack', evaluation: '/', direction: touchDirection })
          : null;

        if (phase === 'reception_confirm' && pendingTouch && isReceptionDrivenServePendingTouch(pendingTouch)) {
          const currentEval = evalChip?.current ?? RECEPTION_DEFAULT_EVAL;
          const touchWithEval = updatePendingTouchEvaluation(pendingTouch, currentEval);
          const result = resolveReceptionDrivenServeEvaluationFlow(touchWithEval);
          if (result && result.kind !== 'rally_ended') {
            const isGoodReception = currentEval === '#' || currentEval === '+';
            const setterPlayer = teamPlayersBySide[possessionTeam]?.find((p) => p.isSetter);
            const inferredSetTouches: PendingTouch[] = [];
            if (setterPlayer && courtZones?.length) {
              const inCourtZones = courtZones.filter((z) => z.kind === 'in_court' && z.teamSide === possessionTeam);
              const setterZone = inCourtZones.length > 0
                ? inCourtZones.reduce<ScoutingZone>((nearest, z2) => {
                    const d1 = Math.hypot(z2.center.x - setterPlayer.x, z2.center.y - setterPlayer.y);
                    const d2 = Math.hypot(nearest.center.x - setterPlayer.x, nearest.center.y - setterPlayer.y);
                    return d1 < d2 ? z2 : nearest;
                  }, inCourtZones[0])
                : null;
              if (setterZone) {
                inferredSetTouches.push({
                  playerId: setterPlayer.playerId, teamSide: possessionTeam, skill: 'set', zone: setterZone,
                  evaluation: '+', setterCallCode: isGoodReception ? 'K1' : undefined,
                  destinationPoint: { x: setterPlayer.x, y: setterPlayer.y },
                  source: 'inferred', touchOrigin: 'implicit_inference', inferenceReason: 'setter_after_receive',
                });
              }
            }
            commitTouches([...result.touches, ...inferredSetTouches]);
          }
          setEvalChip(null);
        }

        setAwaitingAttackerContext({
          zone, destinationPoint: releasePoint, attackingTeam: possessionTeam,
          ballDirection: touchDirection, trajectory: attackTrajectory,
        });
        setPendingTouch(null);
        setPendingBallPosition(releasePoint);
        setPendingTrajectory(attackTrajectory);
        setSelectedPlayerId(null);
        setSelectedTeamSide(possessionTeam);
        setPhase('awaiting_attacker');
        return;
      }

      const isOpponentCourt = zone.kind === 'in_court' && zone.teamSide !== possessionTeam;
      if (isOpponentCourt) {
        // Ball dragged across net → attack trajectory, ask who attacked
        const attackTrajectory = touchDirection
          ? createBallTrajectory({ teamSide: possessionTeam, skill: 'attack', evaluation: '#', direction: touchDirection })
          : null;

        if (phase === 'reception_confirm' && pendingTouch && isReceptionDrivenServePendingTouch(pendingTouch)) {
          const currentEval = evalChip?.current ?? RECEPTION_DEFAULT_EVAL;
          const touchWithEval = updatePendingTouchEvaluation(pendingTouch, currentEval);
          const result = resolveReceptionDrivenServeEvaluationFlow(touchWithEval);
          if (result && result.kind !== 'rally_ended') {
            const isGoodReception = currentEval === '#' || currentEval === '+';
            const setterPlayer = teamPlayersBySide[possessionTeam]?.find((p) => p.isSetter);
            const inferredSetTouches: PendingTouch[] = [];
            if (setterPlayer && courtZones?.length) {
              const inCourtZones = courtZones.filter((z) => z.kind === 'in_court' && z.teamSide === possessionTeam);
              const setterZone = inCourtZones.length > 0
                ? inCourtZones.reduce<ScoutingZone>((nearest, z2) => {
                    const d1 = Math.hypot(z2.center.x - setterPlayer.x, z2.center.y - setterPlayer.y);
                    const d2 = Math.hypot(nearest.center.x - setterPlayer.x, nearest.center.y - setterPlayer.y);
                    return d1 < d2 ? z2 : nearest;
                  }, inCourtZones[0])
                : null;
              if (setterZone) {
                inferredSetTouches.push({
                  playerId: setterPlayer.playerId, teamSide: possessionTeam, skill: 'set', zone: setterZone,
                  evaluation: '+', setterCallCode: isGoodReception ? 'K1' : undefined,
                  destinationPoint: { x: setterPlayer.x, y: setterPlayer.y },
                  source: 'inferred', touchOrigin: 'implicit_inference', inferenceReason: 'setter_after_receive',
                });
              }
            }
            commitTouches([...result.touches, ...inferredSetTouches]);
          }
          setEvalChip(null);
        }

        setAwaitingAttackerContext({
          zone, destinationPoint: releasePoint, attackingTeam: possessionTeam,
          ballDirection: touchDirection, trajectory: attackTrajectory,
        });
        setPendingTouch(null);
        setPendingBallPosition(releasePoint);
        setPendingTrajectory(attackTrajectory);
        setSelectedPlayerId(null);
        setSelectedTeamSide(possessionTeam);
        setPhase('awaiting_attacker');
        return;
      }
    }

    // ── ATTACK PHASE ──────────────────────────────────────────────────────────
    if ((phase === 'attack_pending') && pendingTouch) {
      const attackingTeam = pendingTouch.teamSide;

      // Optional start-zone tap: if user taps (no drag) a zone on own court,
      // update startZoneCode and wait for the subsequent drag to the destination.
      if (!ballDirection && zone.kind === 'in_court' && zone.teamSide === attackingTeam) {
        const newStartZoneCode = getZoneCode({
          teamSide: zone.teamSide,
          zoneId: zone.id,
          gridCoordinate: zone.gridCoordinate,
          point: zone.center,
        });
        setPendingTouch(applyModifiers({ ...pendingTouch, startZoneCode: newStartZoneCode }));
        setPendingBallPosition(releasePoint);
        return;
      }

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

    // ── BLOCK ZONE SELECT ─────────────────────────────────────────────────────
    // User taps where the block contact occurred (front row of blocking team).
    // Advances to blocker_select with the contact zone recorded.
    if (phase === 'block_zone_select' && blockerSelection) {
      if (zone.kind === 'in_court' && zone.teamSide === blockerSelection.blockingTeam) {
        setBlockerSelection({ ...blockerSelection, blockContactZone: zone });
      }
      setPhase('blocker_select');
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

      const attackingTeam = blockerSelection.attackTouch.teamSide;
      const continuesRally = blockerSelection.rallyContinues;

      setSelectedPlayerId(null);
      setSelectedTeamSide(continuesRally ? attackingTeam : null);
      setBlockerSelection(null);
      setAceVictimSelection(null);
      setRallyEndPreview(null);
      setPendingBallPosition(null);
      setPendingTrajectory(null);
      setEvalChip(null);
      commitTouches(resolved.touches);

      if (continuesRally) {
        // A! case: rally continues with the same attacking team
        setPhase('attack_select');
      } else {
        // A/ case: block for point, rally ends
        onRallyEnd(resolved.pointTeam, resolved.reason);
        setPhase('rally_ended');
      }
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

    // Awaiting attacker: user taps who attacked after dragging across net
    if (phase === 'awaiting_attacker' && awaitingAttackerContext) {
      if (teamSide !== awaitingAttackerContext.attackingTeam) return;

      const player = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (!player) return;

      const inCourtZones = courtZones?.filter((z) => z.kind === 'in_court' && z.teamSide === teamSide) ?? [];
      const nearestZone = inCourtZones.length > 0
        ? inCourtZones.reduce<ScoutingZone>((nearest, z2) => {
            const d1 = Math.hypot(z2.center.x - player.x, z2.center.y - player.y);
            const d2 = Math.hypot(nearest.center.x - player.x, nearest.center.y - player.y);
            return d1 < d2 ? z2 : nearest;
          }, inCourtZones[0])
        : awaitingAttackerContext.zone;

      const lastTouch = currentRallyTouches.at(-1);
      const isGoodReception = lastTouch?.skill === 'receive'
        ? (lastTouch.evaluation === '#' || lastTouch.evaluation === '+')
        : (lastTouch?.skill === 'set');

      const physicalStartSide = nearestZone.center.x < 50 ? 'away' as const : 'home' as const;
      const attackTouch = applyModifiers({
        playerId,
        teamSide,
        skill: 'attack' as const,
        zone: awaitingAttackerContext.zone,
        evaluation: '#' as const,
        destinationPoint: awaitingAttackerContext.destinationPoint,
        ballDirection: awaitingAttackerContext.ballDirection ?? undefined,
        trajectory: awaitingAttackerContext.trajectory ?? undefined,
        startZoneCode: getZoneCode({
          teamSide: physicalStartSide, zoneId: nearestZone.id,
          gridCoordinate: nearestZone.gridCoordinate, point: nearestZone.center,
        }),
        combinationCode: isGoodReception ? 'K1' : undefined,
        source: 'explicit',
        touchOrigin: 'live_scouting',
      });

      setPendingTouch(attackTouch);
      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAwaitingAttackerContext(null);
      setEvalChip({ options: ATTACK_EVAL_OPTIONS, current: ATTACK_DEFAULT_EVAL });
      setPhase('attack_eval');
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
      setPhase('reception_confirm');
      return;
    }

    // Reception confirm: tapping any player (including the receiver themselves) selects the attacker.
    // After a good reception the attacking team IS the receiving team (sideout), so we allow
    // any team here to also cover transition scenarios (opponent attacks after a bad reception).
    if (phase === 'reception_confirm' && pendingTouch) {
      // Any tap on any player = "this is the attacker". The receiver can also be the attacker.
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

      const receivingTeam = pendingTouch.teamSide;
      const isGoodReception = currentEval === '#' || currentEval === '+';
      const setterPlayer = teamPlayersBySide[receivingTeam]?.find((p) => p.isSetter);
      const inferredSetTouches: PendingTouch[] = [];
      if (setterPlayer && courtZones?.length) {
        const inCourtZones = courtZones.filter((z) => z.kind === 'in_court' && z.teamSide === receivingTeam);
        const setterZone = inCourtZones.length > 0
          ? inCourtZones.reduce<ScoutingZone>((nearest, zone) => {
              const d1 = Math.hypot(zone.center.x - setterPlayer.x, zone.center.y - setterPlayer.y);
              const d2 = Math.hypot(nearest.center.x - setterPlayer.x, nearest.center.y - setterPlayer.y);
              return d1 < d2 ? zone : nearest;
            }, inCourtZones[0])
          : null;
        if (setterZone) {
          inferredSetTouches.push({
            playerId: setterPlayer.playerId,
            teamSide: receivingTeam,
            skill: 'set',
            zone: setterZone,
            evaluation: '+',
            setterCallCode: isGoodReception ? 'K1' : undefined,
            destinationPoint: { x: setterPlayer.x, y: setterPlayer.y },
            source: 'inferred',
            touchOrigin: 'implicit_inference',
            inferenceReason: 'setter_after_receive',
          });
        }
      }

      commitTouches([...result.touches, ...inferredSetTouches]);
      setEvalChip(null);

      const attackingTeam = teamSide;
      const attackPlayer = teamPlayersBySide[attackingTeam]?.find((p) => p.playerId === playerId);
      if (attackPlayer) {
        setPendingBallPosition({ x: attackPlayer.x, y: attackPlayer.y });
      }
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
        previousTouch: inferredSetTouches.at(-1) ?? result.touches.at(-1) ?? previousTouch ?? null,
        isGoodReception,
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
    }

    // Attack select: tap a player to become the attacker
    if (phase === 'attack_select') {
      const attackPlayer = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (attackPlayer) {
        setPendingBallPosition({ x: attackPlayer.x, y: attackPlayer.y });
      }
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
    awaitingReceiverContext,
    awaitingReceiverSelection,
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
        // Blocked for point — skip block contact zone tap, go directly to blocker player selection
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
        setPhase('attack_select');
        setEvalChip(null);
        setSelectedPlayerId(null);
        setSelectedTeamSide(updatedTouch.teamSide);
      }
    }
  }, [
    applyModifiers,
    commitTouches,
    courtZones,
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
    skillWasSelected: phase === 'attack_pending' || phase === 'attack_eval' || phase === 'reception_confirm',
    evaluationWasSelected: phase === 'attack_eval',
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
    awaitingReceiverSelection,
    awaitingReceiverContext,
    awaitingAttackerContext,
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

// ─── Helper: build pending attack touch for a player ─────────────────────────

function buildAttackTouchForPlayer(input: {
  playerId: string;
  teamSide: TeamSide;
  player: { x: number; y: number };
  courtZones: ScoutingZone[];
  previousTouch: Pick<BallTouch, 'playerId' | 'teamSide' | 'skill' | 'evaluation'> | null;
  isGoodReception?: boolean;
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
    combinationCode: input.isGoodReception ? 'K1' : undefined,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
}
