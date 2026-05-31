import { useEffect, useMemo } from 'react';
import type { Team } from '@src/domain/roster/types';
import { getPlayerDisplayName } from '@src/domain/roster/helpers';
import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import {
  createFullScoutingCells,
  getDefaultServeStartZoneForTeam,
  remapScoutingZonesForDisplaySides,
  type ScoutingZone,
} from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import { getBallTrajectoriesForTouches } from '@src/domain/trajectory';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import { useTranslation } from '@src/i18n';
import { LiveScoutingToolbar } from './LiveScoutingToolbar';
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
  type LiveCourtPhase,
} from '../live/tactical/tactical-zones';
import {
  getTeamTacticalPhase,
  type TeamTacticalPhases,
} from '../live/tactical/tactical-transition';
import { useLiveTouchFlowController } from '../live/stores/live-touch-flow-store';
import {
  getServingPlayerIdFromLineup,
  getServingPlayerId,
  isReceptionDrivenServePendingTouch,
  isServeErrorConfirmationPendingTouch,
} from '../live/rally/rally-flow';
import type { LiveToolbarPlayerSummary } from '../live/rally/live-toolbar-state';

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
  scoutingMode: ScoutingMode;
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
  scoutingMode,
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
  const awayPlayers = useMemo(() => addReplacementLabels(resolveTacticalCourtPlayers({
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
  const homePlayers = useMemo(() => addReplacementLabels(resolveTacticalCourtPlayers({
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

  const flow = useLiveTouchFlowController({
    currentRallyTouches,
    teamPlayersBySide,
    servingTeam,
    servingPlayerId,
    isRallyActive,
    scoutingMode,
    onSelectedZoneChange,
    onTouchesCommitted,
    onRallyEnd,
    onAceVictimSelectionChange,
  });

  const allowedZones = useMemo(() => (
    flow.aceVictimSelection
      ? NO_ALLOWED_ZONES
      : getAllowedZonesForLiveCourtPhase(courtZones, courtPhase)
  ), [courtPhase, courtZones, flow.aceVictimSelection]);
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
  const overlayMessage = flow.rallyEndPreview
    ? `${t('rallyEnded')} · ${t('confirmPoint')}`
    : flow.aceVictimSelection
      ? t('aceVictimSelection')
      : flow.blockerSelection
        ? t('selectOpponentBlocker')
      : playerCountWarningMessage ?? receptionReceiverMessage ?? serveErrorConfirmationMessage ?? statusMessage ?? (() => {
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
  const disabledPlayerTeamSides = useMemo(() => (
    flow.blockerSelection
      ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== flow.blockerSelection?.blockingTeam)
      : flow.aceVictimSelection
      ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== flow.aceVictimSelection?.receivingTeam)
      : isReceptionDrivenServePendingTouch(flow.pendingTouch)
        ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== flow.pendingTouch?.teamSide)
        : isServeErrorConfirmationPendingTouch(flow.pendingTouch, servingTeam) && servingTeam
          ? [servingTeam]
          : []
  ), [flow.aceVictimSelection, flow.blockerSelection, flow.pendingTouch, servingTeam]);
  const selectedToolbarPlayer: LiveToolbarPlayerSummary | null = selectedInputPlayer
    ? {
        jerseyNumber: selectedInputPlayer.jerseyNumber,
        name: getPlayerDisplayName(selectedInputPlayer),
        teamLabel: selectedInputTeamLabel,
        isLibero: Boolean(selectedInputPlayer.isLibero || selectedInputMarker?.isLibero),
      }
    : null;
  const touchControlsDisabled = flow.pendingTouch === null || Boolean(flow.aceVictimSelection || flow.blockerSelection);

  return (
    <ScoutingStageFrame
      stage="live_rally"
      eyebrow=""
      title=""
      description=""
      bodyClassName="scouting-stage__body--live-rally"
    >
      <div className="live-rally-stage">
        <ScoutingCourt
          zones={courtZones}
          awayPlayers={awayPlayers}
          homePlayers={homePlayers}
          allowedZones={allowedZones}
          selectedZone={selectedCourtZone}
          initialBallPosition={initialBallZone?.center ?? INITIAL_BALL_POSITION}
          selectedPlayerId={flow.selectedPlayerId}
          selectedTeamSide={flow.selectedTeamSide}
          disabledPlayerTeamSides={disabledPlayerTeamSides}
          selectablePlayerKeys={flow.selectableBlockerPlayerKeys}
          touchPopup={null}
          trajectories={rallyTrajectories}
          pendingTrajectory={flow.pendingTrajectory}
          overlayMessage={overlayMessage}
          overlayActionLabel={flow.rallyEndPreview ? t('confirmPoint') : null}
          isBallDraggable={!flow.aceVictimSelection && !flow.blockerSelection}
          homeLiberoPlayerId={homeLiberoPlayerId}
          awayLiberoPlayerId={awayLiberoPlayerId}
          isRallyActive={isRallyActive}
          onZoneSnap={flow.handleZoneSnap}
          pendingBallPosition={flow.pendingBallPosition}
          onPlayerSelect={flow.handlePlayerSelection}
          onOverlayAction={flow.handleRallyEndConfirm}
          onBallPointerDown={onBallPointerDown}
          onBallPositionChange={flow.handleBallPositionChange}
        />
        <LiveScoutingToolbar
          inputState={flow.liveInputState}
          scoutingMode={scoutingMode}
          selectedPlayer={selectedToolbarPlayer}
          controlsDisabled={touchControlsDisabled}
          skillEditable={!flow.forceSkill}
          canUndo={canUndo}
          canRemoveLastTouch={canRemoveLastTouch}
          canOpenEvents={canOpenEvents}
          onSkillChange={flow.handleSkillChange}
          onEvaluationChange={flow.handleEvaluationChange}
          selectedBallHeight="medium"
          onUndo={onUndo ?? (() => undefined)}
          onRemoveLastTouch={onRemoveLastTouch ?? (() => undefined)}
          onOpenEvents={onOpenEvents ?? (() => undefined)}
        />
      </div>
    </ScoutingStageFrame>
  );
}
