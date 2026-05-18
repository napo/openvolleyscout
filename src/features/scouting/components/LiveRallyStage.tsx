import { useMemo } from 'react';
import type { Team } from '@src/domain/roster/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import { createFullScoutingCells, getDefaultServeStartZone, type ScoutingZone } from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import { useTranslation } from '@src/i18n';
import { LiveScoutingToolbar } from './LiveScoutingToolbar';
import { ScoutingCourt, type ScoutingCourtPlayerMarker } from './ScoutingCourt';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import type { PendingTouch } from '../model';
import {
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
  getServingPlayerId,
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
  canUndoLastPoint?: boolean;
  canOpenEvents?: boolean;
  onUndoLastPoint?: () => void;
  onOpenEvents?: () => void;
  statusMessage?: string | null;
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
  onRallyEnd,
  onAceVictimSelectionChange,
  onBallPointerDown,
  canUndoLastPoint = false,
  canOpenEvents = true,
  onUndoLastPoint,
  onOpenEvents,
  statusMessage,
}: LiveRallyStageProps) {
  const { t } = useTranslation();
  const allPlayers = useMemo(() => [...homeTeam.players, ...awayTeam.players], [awayTeam.players, homeTeam.players]);
  const initialBallZone = servingTeam ? getDefaultServeStartZone(servingTeam, COURT_ZONES) : null;
  const activeServeStartZone = useMemo(() => {
    if (selectedZone?.kind === 'serve_start') {
      return selectedZone;
    }

    if (!servingTeam || currentRallyTouches.length > 0) {
      return null;
    }

    return getDefaultServeStartZone(servingTeam, COURT_ZONES);
  }, [currentRallyTouches.length, selectedZone, servingTeam]);
  const awayPlayers = useMemo(() => addReplacementLabels(resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: getTeamTacticalPhase({ teamSide: 'away', phases: teamTacticalPhases, servingTeam }),
    defenseSystemBlock,
    receptionSystemBlock,
    serveStartZone: activeServeStartZone,
  }), (playerLabel) => t('liberoFor', { player: playerLabel })), [
    activeServeStartZone,
    awayLineup,
    awayTeam,
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
  }), (playerLabel) => t('liberoFor', { player: playerLabel })), [
    activeServeStartZone,
    defenseSystemBlock,
    homeLineup,
    homeTeam,
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
    servingTeam ? getServingPlayerId(teamPlayersBySide[servingTeam], servingTeam) : null
  ), [servingTeam, teamPlayersBySide]);

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
      : getAllowedZonesForLiveCourtPhase(COURT_ZONES, courtPhase)
  ), [courtPhase, flow.aceVictimSelection]);
  const overlayMessage = flow.rallyEndPreview
    ? `${t('rallyEnded')} · ${t('confirmPoint')}`
    : flow.aceVictimSelection
      ? t('aceVictimSelection')
      : statusMessage ?? (() => {
        if (!selectedZone || (selectedZone.kind !== 'serve_start' && currentRallyTouches.length === 0 && !flow.pendingTouch)) {
          return t('selectServeStartZone');
        }

        if (selectedZone.kind === 'serve_start' && !flow.pendingTouch) {
          return t('dragBallToTargetZone');
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
    flow.aceVictimSelection
      ? (['away', 'home'] as TeamSide[]).filter((teamSide) => teamSide !== flow.aceVictimSelection?.receivingTeam)
      : []
  ), [flow.aceVictimSelection]);
  const selectedInputPlayer = flow.liveInputState.selectedPlayerId
    ? allPlayers.find((player) => player.id === flow.liveInputState.selectedPlayerId)
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
  const selectedToolbarPlayer: LiveToolbarPlayerSummary | null = selectedInputPlayer
    ? {
        jerseyNumber: selectedInputPlayer.jerseyNumber,
        name: selectedInputPlayer.shortName
          || `${selectedInputPlayer.firstName} ${selectedInputPlayer.lastName}`.trim()
          || selectedInputPlayer.playerCode,
        teamLabel: selectedInputTeamLabel,
        isLibero: Boolean(selectedInputPlayer.isLibero || selectedInputMarker?.isLibero),
      }
    : null;
  const touchControlsDisabled = flow.pendingTouch === null || Boolean(flow.aceVictimSelection);

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
          awayPlayers={awayPlayers}
          homePlayers={homePlayers}
          allowedZones={allowedZones}
          selectedZone={selectedZone}
          initialBallPosition={initialBallZone?.center ?? INITIAL_BALL_POSITION}
          selectedPlayerId={flow.selectedPlayerId}
          selectedTeamSide={flow.selectedTeamSide}
          disabledPlayerTeamSides={disabledPlayerTeamSides}
          touchPopup={null}
          overlayMessage={overlayMessage}
          overlayActionLabel={flow.rallyEndPreview ? t('confirmPoint') : null}
          isBallDraggable={!flow.aceVictimSelection}
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
          canUndoLastPoint={canUndoLastPoint}
          canOpenEvents={canOpenEvents}
          onSkillChange={flow.handleSkillChange}
          onEvaluationChange={flow.handleEvaluationChange}
          onUndoLastPoint={onUndoLastPoint ?? (() => undefined)}
          onOpenEvents={onOpenEvents ?? (() => undefined)}
        />
      </div>
    </ScoutingStageFrame>
  );
}
