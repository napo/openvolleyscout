import { useEffect, useMemo, useState } from 'react';
import type { Team } from '@src/domain/roster/types';
import { getPlayerDisplayName } from '@src/domain/roster/helpers';
import type { TeamSide } from '@src/domain/common/enums';
import {
  createFullScoutingCells,
  getDefaultServeStartZoneForTeam,
  remapScoutingZonesForDisplaySides,
  type ScoutingZone,
} from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import { getBallTrajectoriesForTouches } from '@src/domain/trajectory';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import { useTranslation } from '@src/i18n';
import type { DataVolleyBallTypeCode } from '../model/datavolley-ball-types';
import {
  getBallTypeOptionsForSkill,
  getDefaultBallTypeCodeForSkill,
} from '../model/datavolley-ball-types';
import { LiveScoutingToolbar, getSkillTranslationKey } from './LiveScoutingToolbar';
import { ScoutingCourt, type ScoutingCourtPlayerMarker } from './ScoutingCourt';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import type { PendingTouch } from '../model';
import {
  EXPECTED_COURT_MARKER_COUNT,
  resolveTacticalCourtPlayers,
  type TacticalCourtPlayer,
} from '../live/tactical/positioning/tactical-position-resolver';
import {
  getAllowedZonesForLiveCourtPhase,
  getClickableZonesForLiveCourtPhase,
  type LiveCourtPhase,
} from '../live/tactical/tactical-zones';
import {
  getTeamTacticalPhase,
  type TeamTacticalPhases,
} from '../live/tactical/tactical-transition';
import { useQuickScoutFlowController } from '../live/stores/quick-scout-flow-store';
import {
  DEFAULT_NUM_BLOCKERS,
  getServingPlayerIdFromLineup,
  getServingPlayerId,
  isBallReleaseOnNet,
  isReceptionDrivenServePendingTouch,
  isServeErrorConfirmationPendingTouch,
} from '../live/rally/rally-flow';
import type { LiveToolbarPlayerSummary } from '../live/rally/live-toolbar-state';
import { getTeamScopedPlayerKey } from '../live/tactical/player-identity';
import { useAppStore } from '@src/app/store/app-store';
import { useCourtOrientationStore } from '../model/court-orientation-store';

interface LiveRallyStageProps {
  awayTeam: Team;
  homeTeam: Team;
  awayLineup: ActiveLineup | null;
  homeLineup: ActiveLineup | null;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
  teamTacticalPhases: TeamTacticalPhases;
  servingTeam: 'home' | 'away' | null;
  awayDisplaySide: 'left' | 'right';
  homeDisplaySide: 'left' | 'right';
  courtPhase: LiveCourtPhase;
  isRallyActive: boolean;
  currentRallyTouches: BallTouch[];
  selectedZone: ScoutingZone | null;
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  onAceVictimSelectionChange?: (isSelecting: boolean) => void;
  onBallPointerDown?: () => void;
  canUndo?: boolean;
  canRemoveLastTouch?: boolean;
  canOpenEvents?: boolean;
  onUndo?: () => void;
  onRemoveLastTouch?: () => void;
  onOpenEvents?: () => void;
  statusMessage?: string | null;
  homeLiberoPlayerId?: string | null;
  awayLiberoPlayerId?: string | null;
}

const COURT_ZONES = createFullScoutingCells();
const NO_ALLOWED_ZONES: ScoutingZone[] = [];
const INITIAL_BALL_POSITION = { x: 50, y: 50 };
const RING_COLOR_MAP: Record<string, string> = {
  viola: '#8b5cf6',
  green: '#16a34a',
  orange: '#ea580c',
  red: '#dc2626',
  pink: '#ec4899',
};

function addReplacementLabels(
  players: TacticalCourtPlayer[],
  formatLabel: (playerLabel: string) => string,
): ScoutingCourtPlayerMarker[] {
  return players.map((player) => {
    if (!player.isLibero || !player.replacedPlayerId) {
      return player;
    }

    return {
      ...player,
      replacingPlayerLabel: formatLabel(
        player.replacedPlayerJerseyNumber !== undefined
          ? `#${player.replacedPlayerJerseyNumber}`
          : player.replacedPlayerId,
      ),
    };
  });
}

export function LiveRallyStage({
  awayTeam,
  homeTeam,
  awayLineup,
  homeLineup,
  awayDisplaySide,
  homeDisplaySide,
  defenseSystemBlock,
  receptionSystemBlock,
  teamTacticalPhases,
  servingTeam,
  courtPhase,
  isRallyActive,
  currentRallyTouches,
  selectedZone,
  onSelectedZoneChange,
  onTouchesCommitted,
  homeLiberoPlayerId = null,
  awayLiberoPlayerId = null,
  onRallyEnd,
  onAceVictimSelectionChange,
  onBallPointerDown,
  canUndo = false,
  canRemoveLastTouch = false,
  canOpenEvents = true,
  onUndo,
  onRemoveLastTouch,
  onOpenEvents,
  statusMessage,
}: LiveRallyStageProps) {
  const { t } = useTranslation();
  const toolbarScale = useAppStore((state) => state.toolbarScale);
  const markerScale = useAppStore((state) => state.markerScale);
  const courtOrientation = useCourtOrientationStore((state) => state.orientation);
  // Height is the binding dimension for a tall/narrow vertical court, so the
  // toolbar's own height footprint directly competes with the court for
  // space below it — shrink it in vertical mode to hand height back to the court.
  const effectiveToolbarScale = courtOrientation === 'vertical' ? Math.min(toolbarScale, 1) : toolbarScale;
  const [selectedBallTypeCode, setSelectedBallTypeCode] = useState<DataVolleyBallTypeCode>('M');
  // DataVolley default: attacks are recorded against a two-player block unless changed.
  const [selectedNumBlockers, setSelectedNumBlockers] = useState<NumBlockers | null>(DEFAULT_NUM_BLOCKERS);
  // "No" on the point confirmation asks whether to change the evaluation or cancel the action.
  const [rallyEndDeclined, setRallyEndDeclined] = useState(false);
  const rosterPlayersBySide = useMemo(() => ({
    away: awayTeam.players,
    home: homeTeam.players,
  }), [awayTeam.players, homeTeam.players]);
  const courtZones = useMemo(() => remapScoutingZonesForDisplaySides(COURT_ZONES, {
    away: awayDisplaySide,
    home: homeDisplaySide,
  }), [awayDisplaySide, homeDisplaySide]);
  const selectedCourtZone = useMemo(() => (
    selectedZone ? courtZones.find((zone) => zone.id === selectedZone.id) ?? selectedZone : null
  ), [courtZones, selectedZone]);
  const initialBallZone = servingTeam ? getDefaultServeStartZoneForTeam(servingTeam, courtZones) : null;
  const activeServeStartZone = useMemo(() => {
    if (selectedCourtZone?.kind === 'serve_start') {
      return selectedCourtZone;
    }

    if (!servingTeam || currentRallyTouches.length > 0) {
      return null;
    }

    return getDefaultServeStartZoneForTeam(servingTeam, courtZones);
  }, [courtZones, currentRallyTouches.length, selectedCourtZone, servingTeam]);
  const awayPlayersBase = useMemo(() => addReplacementLabels(resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: getTeamTacticalPhase({ teamSide: 'away', phases: teamTacticalPhases, servingTeam }),
    defenseSystemBlock,
    receptionSystemBlock,
    serveStartZone: activeServeStartZone,
    displaySide: awayDisplaySide,
  }), (playerLabel) => t('liberoFor', { player: playerLabel })), [
    activeServeStartZone,
    awayLineup,
    awayTeam,
    awayDisplaySide,
    defenseSystemBlock,
    receptionSystemBlock,
    servingTeam,
    t,
    teamTacticalPhases,
  ]);
  const homePlayersBase = useMemo(() => addReplacementLabels(resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: homeLineup,
    phase: getTeamTacticalPhase({ teamSide: 'home', phases: teamTacticalPhases, servingTeam }),
    defenseSystemBlock,
    receptionSystemBlock,
    serveStartZone: activeServeStartZone,
    displaySide: homeDisplaySide,
  }), (playerLabel) => t('liberoFor', { player: playerLabel })), [
    activeServeStartZone,
    defenseSystemBlock,
    homeLineup,
    homeTeam,
    homeDisplaySide,
    receptionSystemBlock,
    servingTeam,
    t,
    teamTacticalPhases,
  ]);
  const awayPlayers = awayPlayersBase;
  const homePlayers = homePlayersBase;
  const teamPlayersBySide = useMemo(() => ({
    away: awayPlayers,
    home: homePlayers,
  }), [awayPlayers, homePlayers]);
  const servingPlayerId = useMemo(() => (
    servingTeam
      ? getServingPlayerIdFromLineup(servingTeam === 'home' ? homeLineup : awayLineup, servingTeam)
        ?? getServingPlayerId(teamPlayersBySide[servingTeam], servingTeam)
      : null
  ), [awayLineup, homeLineup, servingTeam, teamPlayersBySide]);
  const rallyTrajectories = useMemo(
    () => getBallTrajectoriesForTouches(currentRallyTouches),
    [currentRallyTouches],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey;
      if (isUndoShortcut) {
        event.preventDefault();
        if (canUndo && onUndo) {
          onUndo();
        }
        return;
      }

      // Backspace = remove only the last recorded touch from the active rally.
      // Keeps earlier touches in the rally intact (faster than grouped undo).
      if (event.key === 'Backspace' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        event.preventDefault();
        if (canRemoveLastTouch && onRemoveLastTouch) {
          onRemoveLastTouch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRemoveLastTouch, onUndo, onRemoveLastTouch]);

  const quickFlow = useQuickScoutFlowController({
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
    onUndoLastAction: onUndo,
    selectedBallTypeCode,
    selectedNumBlockers,
  });
  const flow = quickFlow;

  useEffect(() => {
    if (!flow.rallyEndPreview) {
      setRallyEndDeclined(false);
    }
  }, [flow.rallyEndPreview]);

  // During quick mode's serve_drawing phase pendingTouch is still null (before the first drag),
  // so selectedSkill would be null and J/F/JF buttons would not appear. Force 'serve' so the
  // user can pre-select the serve type before releasing the ball, matching C&S behaviour.
  const effectiveInputState = quickFlow.phase === 'serve_drawing'
    ? { ...flow.liveInputState, selectedSkill: 'serve' as const }
    : flow.liveInputState;

  const selectedSkillBallTypeOptions = getBallTypeOptionsForSkill(effectiveInputState.selectedSkill);
  const selectedSkillBallTypeCode = selectedSkillBallTypeOptions.some((option) => option.code === selectedBallTypeCode)
    ? selectedBallTypeCode
    : getDefaultBallTypeCodeForSkill(effectiveInputState.selectedSkill);
  const updatePendingBallTypeCode = flow.handleBallTypeCodeChange;

  useEffect(() => {
    if (selectedSkillBallTypeCode && selectedSkillBallTypeCode !== selectedBallTypeCode) {
      setSelectedBallTypeCode(selectedSkillBallTypeCode);
      updatePendingBallTypeCode(selectedSkillBallTypeCode);
    }
  }, [selectedBallTypeCode, selectedSkillBallTypeCode, updatePendingBallTypeCode]);

  const handleBallTypeCodeChange = (code: DataVolleyBallTypeCode) => {
    setSelectedBallTypeCode(code);
    updatePendingBallTypeCode(code);
  };

  const handleNumBlockersChange = (n: NumBlockers) => {
    setSelectedNumBlockers(n);
    flow.handleNumBlockersChange(n);
  };

  const isAwaitingReceiver = quickFlow.awaitingReceiverSelection;
  const awaitingReceiverCtx = quickFlow.awaitingReceiverContext;

  const hasReceiverSelected = !isAwaitingReceiver && isReceptionDrivenServePendingTouch(flow.pendingTouch);
  const receiverTeamSide = hasReceiverSelected ? flow.pendingTouch?.teamSide : null;

  const awayPlayersForCourt = useMemo(() => {
    if (!hasReceiverSelected || receiverTeamSide !== 'away') {
      return awayPlayersBase;
    }
    return addReplacementLabels(resolveTacticalCourtPlayers({
      teamSide: 'away',
      team: awayTeam,
      lineup: awayLineup,
      phase: 'after_reception_setter_release',
      defenseSystemBlock,
      receptionSystemBlock,
      serveStartZone: activeServeStartZone,
      displaySide: awayDisplaySide,
    }), (playerLabel) => t('liberoFor', { player: playerLabel }));
  }, [hasReceiverSelected, receiverTeamSide, awayPlayersBase, awayTeam, awayLineup, defenseSystemBlock, receptionSystemBlock, activeServeStartZone, awayDisplaySide, t]);

  const homePlayersForCourt = useMemo(() => {
    if (!hasReceiverSelected || receiverTeamSide !== 'home') {
      return homePlayersBase;
    }
    return addReplacementLabels(resolveTacticalCourtPlayers({
      teamSide: 'home',
      team: homeTeam,
      lineup: homeLineup,
      phase: 'after_reception_setter_release',
      defenseSystemBlock,
      receptionSystemBlock,
      serveStartZone: activeServeStartZone,
      displaySide: homeDisplaySide,
    }), (playerLabel) => t('liberoFor', { player: playerLabel }));
  }, [hasReceiverSelected, receiverTeamSide, homePlayersBase, homeTeam, homeLineup, defenseSystemBlock, receptionSystemBlock, activeServeStartZone, homeDisplaySide, t]);

  const isAwaitingAttacker = quickFlow.phase === 'awaiting_player';
  const awaitingAttackerCtx = quickFlow.awaitingAttackerContext;

  const awaitingSelectionPlayerKeys = useMemo(() => {
    if (isAwaitingReceiver && awaitingReceiverCtx) {
      const receivingPlayers = awaitingReceiverCtx.receivingTeam === 'away' ? awayPlayersForCourt : homePlayersForCourt;
      return receivingPlayers.map((player) => getTeamScopedPlayerKey(awaitingReceiverCtx.receivingTeam, player.playerId));
    }
    if (quickFlow.selectablePlayerKeys) {
      return quickFlow.selectablePlayerKeys;
    }
    if (isAwaitingAttacker && awaitingAttackerCtx) {
      const attackingPlayers = awaitingAttackerCtx.attackingTeam === 'away' ? awayPlayersForCourt : homePlayersForCourt;
      return attackingPlayers.map((player) => getTeamScopedPlayerKey(awaitingAttackerCtx.attackingTeam, player.playerId));
    }
    return null;
  }, [isAwaitingReceiver, awaitingReceiverCtx, quickFlow.selectablePlayerKeys, isAwaitingAttacker, awaitingAttackerCtx, awayPlayersForCourt, homePlayersForCourt]);

  const allowedZones = useMemo(() => (
    flow.aceVictimSelection
      ? NO_ALLOWED_ZONES
      : getAllowedZonesForLiveCourtPhase(courtZones, courtPhase)
  ), [courtPhase, courtZones, flow.aceVictimSelection]);
  const clickableZones = useMemo(() => (
    flow.aceVictimSelection
      ? NO_ALLOWED_ZONES
      : getClickableZonesForLiveCourtPhase(courtZones, courtPhase, servingTeam)
  ), [courtPhase, courtZones, flow.aceVictimSelection, servingTeam]);
  const selectedInputPlayer = flow.liveInputState.selectedPlayerId && flow.liveInputState.selectedTeamSide
    ? rosterPlayersBySide[flow.liveInputState.selectedTeamSide].find((player) => (
        player.id === flow.liveInputState.selectedPlayerId
      )) ?? null
    : null;
  const selectedInputMarker = flow.liveInputState.selectedPlayerId && flow.liveInputState.selectedTeamSide
    ? teamPlayersBySide[flow.liveInputState.selectedTeamSide].find((player) => (
        player.playerId === flow.liveInputState.selectedPlayerId
      )) ?? null
    : null;
  const selectedInputTeamLabel =
    flow.liveInputState.selectedTeamSide === 'home'
      ? homeTeam.name || t('home')
      : flow.liveInputState.selectedTeamSide === 'away'
        ? awayTeam.name || t('away')
        : t('notSpecified');
  const selectedPlayerLabel = selectedInputPlayer
    ? `#${selectedInputPlayer.jerseyNumber} ${getPlayerDisplayName(selectedInputPlayer)}`
    : flow.liveInputState.selectedPlayerId ?? t('notSpecified');
  const playerCountWarningMessage = awayPlayers.length !== EXPECTED_COURT_MARKER_COUNT || homePlayers.length !== EXPECTED_COURT_MARKER_COUNT
    ? t('expectedSixPlayersPerTeamWarning', {
        awayCount: awayPlayers.length,
        homeCount: homePlayers.length,
      })
    : null;
  const receptionReceiverMessage = isReceptionDrivenServePendingTouch(flow.pendingTouch)
    ? t('receiverSelectedLiveMessage', {
        player: selectedPlayerLabel,
        team: selectedInputTeamLabel,
      })
    : null;
  const serveErrorConfirmationMessage = isServeErrorConfirmationPendingTouch(flow.pendingTouch, servingTeam)
    ? t('serveOutNetConfirmationLiveMessage')
    : null;
  const quickAwaitingPlayerCtx = quickFlow.awaitingPlayerContext;
  // Dig/set awaiting a player stay draggable: redrawing instead of tapping a
  // player silently infers who did it (see quick-scout-flow-store.ts). Attack
  // (and freeball/cover) keep requiring an explicit tap, same as before.
  const isRedrawableAwaitingSkill = quickAwaitingPlayerCtx?.determinedSkill === 'dig'
    || quickAwaitingPlayerCtx?.determinedSkill === 'set';
  // The attack is stopped on the net either while its eval chip is open
  // (attack_eval) or, once the attacker is tapped, inside the blocker selection:
  // in both cases the net acts as a block area and the deflection segment can
  // still be drawn from the contact point.
  const quickAttackOnNet = Boolean(
    (
      quickFlow.phase === 'attack_eval'
      && quickFlow.pendingTouch?.skill === 'attack'
      && quickFlow.pendingTouch.destinationPoint
      && isBallReleaseOnNet(quickFlow.pendingTouch.destinationPoint)
    )
    || (
      quickFlow.phase === 'blocker_select'
      && quickFlow.blockerSelection
      && !quickFlow.blockerSelection.blockDirection
      && quickFlow.blockerSelection.attackTouch.destinationPoint
      && isBallReleaseOnNet(quickFlow.blockerSelection.attackTouch.destinationPoint)
    ),
  );
  const quickPhaseMessage = (() => {
    const qPhase = quickFlow.phase;
    if (qPhase === 'serve_drawing' || qPhase === 'idle') return t('quickDragServeToReceivingCourt');
    if (qPhase === 'reception_confirm' && isAwaitingReceiver) return t('selectReceivingPlayer');
    if (qPhase === 'reception_confirm') return t('quickReceptionConfirm', { player: selectedPlayerLabel });
    if (qPhase === 'awaiting_player') {
      return quickAwaitingPlayerCtx
        ? t('quickAwaitingPlayerForSkill', { skill: t(getSkillTranslationKey(quickAwaitingPlayerCtx.determinedSkill)) })
        : t('quickAwaitingAttacker');
    }
    if (qPhase === 'play_ready') return t('quickSelectNextPlayerOrDrag');
    if (qPhase === 'attack_eval') return quickAttackOnNet ? t('quickBlockDeflectionHint') : t('quickSelectAttackResult');
    if (qPhase === 'blocker_select') return quickAttackOnNet ? t('quickBlockDeflectionHint') : t('selectOpponentBlocker');
    if (qPhase === 'awaiting_ace_target') return t('aceVictimSelection');
    return null;
  })();

  const overlayMessage = flow.rallyEndPreview
    ? (rallyEndDeclined ? `${t('rallyEnded')} · ${t('rallyEndDeclinedPrompt')}` : `${t('rallyEnded')} · ${t('confirmPoint')}`)
    : flow.aceVictimSelection
      ? t('aceVictimSelection')
      : flow.blockerSelection
        ? (quickAttackOnNet ? t('quickBlockDeflectionHint') : t('selectOpponentBlocker'))
      : isAwaitingReceiver
        ? t('selectReceivingPlayer')
      : playerCountWarningMessage ?? quickPhaseMessage ?? receptionReceiverMessage ?? serveErrorConfirmationMessage ?? statusMessage ?? (() => {
        if (!selectedCourtZone || (selectedCourtZone.kind !== 'serve_start' && currentRallyTouches.length === 0 && !flow.pendingTouch)) {
          return t('selectServeStartZone');
        }

        if (selectedCourtZone.kind === 'serve_start' && !flow.pendingTouch) {
          return t('dragTowardReceivingArea');
        }

        if (flow.pendingTouch) {
          return t('selectNextTouchPlayer');
        }

        if (flow.selectedPlayerId) {
          return t('dragBallToOpponentCourt');
        }

        return t('dragBallToTargetZone');
      })();
  const overlayActionLabel = flow.rallyEndPreview
    ? (rallyEndDeclined ? t('changeEvaluation') : t('yes'))
    : null;
  const overlaySecondaryActionLabel = flow.rallyEndPreview
    ? (rallyEndDeclined ? t('cancel') : t('no'))
    : null;
  const handleOverlayAction = () => {
    if (!flow.rallyEndPreview) return;
    if (rallyEndDeclined) {
      flow.handleRallyEndChangeEvaluation();
    } else {
      flow.handleRallyEndConfirm();
    }
  };
  const handleOverlaySecondaryAction = () => {
    if (!flow.rallyEndPreview) return;
    if (rallyEndDeclined) {
      flow.handleRallyEndCancel();
    } else {
      setRallyEndDeclined(true);
    }
  };
  const disabledPlayerTeamSides = useMemo(() => (
    flow.blockerSelection
      ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== flow.blockerSelection?.blockingTeam)
      : flow.aceVictimSelection
      ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== flow.aceVictimSelection?.receivingTeam)
      : isAwaitingReceiver && awaitingReceiverCtx
        ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== awaitingReceiverCtx.receivingTeam)
      : quickAwaitingPlayerCtx
        ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== quickAwaitingPlayerCtx.possessionTeam)
      : isAwaitingAttacker && awaitingAttackerCtx
        ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== awaitingAttackerCtx.attackingTeam)
      : isReceptionDrivenServePendingTouch(flow.pendingTouch)
        ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== flow.pendingTouch?.teamSide)
        : isServeErrorConfirmationPendingTouch(flow.pendingTouch, servingTeam) && servingTeam
          ? [servingTeam]
          : []
  ), [flow.aceVictimSelection, flow.blockerSelection, flow.pendingTouch, isAwaitingReceiver, awaitingReceiverCtx, quickAwaitingPlayerCtx, isAwaitingAttacker, awaitingAttackerCtx, servingTeam]);
  const selectedToolbarPlayer: LiveToolbarPlayerSummary | null = selectedInputPlayer
    ? {
        jerseyNumber: selectedInputPlayer.jerseyNumber,
        name: getPlayerDisplayName(selectedInputPlayer),
        teamLabel: selectedInputTeamLabel,
        isLibero: Boolean(selectedInputPlayer.isLibero || selectedInputMarker?.isLibero),
      }
    : null;
  return (
    <ScoutingStageFrame
      stage="live_rally"
      eyebrow=""
      title=""
      description=""
      bodyClassName="scouting-stage__body--live-rally"
    >
      <div
        className={`live-rally-stage${courtOrientation === 'vertical' ? ' live-rally-stage--vertical' : ''}`}
        style={{ '--live-toolbar-scale': effectiveToolbarScale, '--live-marker-scale': markerScale, '--live-ring-color': RING_COLOR_MAP[quickFlow.selectionRingColor ?? ''] ?? undefined } as React.CSSProperties}
      >
        <ScoutingCourt
          zones={courtZones}
          orientation={courtOrientation}
          awayPlayers={awayPlayersForCourt}
          homePlayers={homePlayersForCourt}
          allowedZones={allowedZones}
          clickableZones={clickableZones}
          selectedZone={selectedCourtZone}
          initialBallPosition={initialBallZone?.center ?? INITIAL_BALL_POSITION}
          selectedPlayerId={flow.selectedPlayerId}
          selectedTeamSide={flow.selectedTeamSide}
          disabledPlayerTeamSides={disabledPlayerTeamSides}
          selectablePlayerKeys={flow.selectableBlockerPlayerKeys}
          awaitingSelectionPlayerKeys={awaitingSelectionPlayerKeys}
          touchPopup={null}
          trajectories={rallyTrajectories}
          pendingTrajectory={flow.pendingTrajectory}
          overlayMessage={overlayMessage}
          overlayActionLabel={overlayActionLabel}
          overlaySecondaryActionLabel={overlaySecondaryActionLabel}
          forceNetHighlight={quickAttackOnNet}
          isBallDraggable={!flow.aceVictimSelection && (!flow.blockerSelection || quickAttackOnNet) && !isAwaitingReceiver && (!isAwaitingAttacker || isRedrawableAwaitingSkill)}
          homeLiberoPlayerId={homeLiberoPlayerId}
          awayLiberoPlayerId={awayLiberoPlayerId}
          isRallyActive={isRallyActive}
          onZoneSnap={flow.handleZoneSnap}
          pendingBallPosition={flow.pendingBallPosition}
          onPlayerSelect={flow.handlePlayerSelection}
          onOverlayAction={handleOverlayAction}
          onOverlaySecondaryAction={handleOverlaySecondaryAction}
          onBallPointerDown={onBallPointerDown}
          onBallPositionChange={flow.handleBallPositionChange}
        />
        <LiveScoutingToolbar
          inputState={effectiveInputState}
          selectedPlayer={selectedToolbarPlayer}
          controlsDisabled={quickFlow.phase !== 'reception_confirm' && quickFlow.phase !== 'attack_eval' && quickFlow.phase !== 'play_ready' && quickFlow.phase !== 'awaiting_player'}
          skillEditable={!flow.forceSkill}
          canUndo={canUndo}
          canRemoveLastTouch={canRemoveLastTouch}
          canOpenEvents={canOpenEvents}
          onSkillChange={flow.handleSkillChange}
          onEvaluationChange={flow.handleEvaluationChange}
          selectedBallTypeCode={selectedSkillBallTypeCode}
          onBallTypeCodeChange={handleBallTypeCodeChange}
          selectedNumBlockers={selectedNumBlockers}
          onNumBlockersChange={handleNumBlockersChange}
          selectedCombinationCode={flow.pendingTouch?.setterCallCode ?? flow.pendingTouch?.combinationCode ?? null}
          onCombinationCodeChange={flow.handleCombinationCodeChange}
          onUndo={onUndo ?? (() => undefined)}
          onRemoveLastTouch={onRemoveLastTouch ?? (() => undefined)}
          onOpenEvents={onOpenEvents ?? (() => undefined)}
        />
      </div>
    </ScoutingStageFrame>
  );
}
