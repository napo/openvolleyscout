import { useMemo } from 'react';
import type { Team } from '@src/domain/roster/types';
import type { SkillType, TeamSide } from '@src/domain/common/enums';
import { createFullScoutingCells, getDefaultServeStartZone, type ScoutingZone } from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { ScoutingCourt, type ScoutingCourtPlayerMarker, type ScoutingCourtTouchPopup } from './ScoutingCourt';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import { TOUCH_SKILLS, getEvaluationsForSkill, type PendingTouch } from '../model';
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
  getPlayerOptions,
  getPopupAvoidPoints,
  getServingPlayerId,
} from '../live/rally/rally-flow';

interface LiveRallyStageProps {
  awayTeam: Team;
  homeTeam: Team;
  awayLineup: ActiveLineup | null;
  homeLineup: ActiveLineup | null;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
  teamTacticalPhases: TeamTacticalPhases;
  servingTeam: 'home' | 'away' | null;
  courtPhase: LiveCourtPhase;
  isRallyActive: boolean;
  currentRallyTouches: BallTouch[];
  selectedZone: ScoutingZone | null;
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  onAceVictimSelectionChange?: (isSelecting: boolean) => void;
  onBallPointerDown?: () => void;
  statusMessage?: string | null;
}

const COURT_ZONES = createFullScoutingCells();
const NO_ALLOWED_ZONES: ScoutingZone[] = [];
const INITIAL_BALL_POSITION = { x: 50, y: 50 };

function getSkillTranslationKey(skill: SkillType): TranslationKey {
  switch (skill) {
    case 'serve':
      return 'skillServe';
    case 'receive':
      return 'skillReceive';
    case 'set':
      return 'skillSet';
    case 'attack':
      return 'skillAttack';
    case 'block':
      return 'skillBlock';
    case 'dig':
      return 'skillDig';
    case 'freeball':
      return 'skillFreeball';
    case 'cover':
      return 'skillCover';
    default:
      return 'skill';
  }
}

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
  courtPhase,
  isRallyActive,
  currentRallyTouches,
  selectedZone,
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  onAceVictimSelectionChange,
  onBallPointerDown,
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
  const pendingTouchPlayer = flow.pendingTouch
    ? allPlayers.find((player) => player.id === flow.pendingTouch?.playerId)
    : null;
  const pendingTouchTeamLabel =
    flow.pendingTouch?.teamSide === 'home'
      ? homeTeam.name || t('home')
      : flow.pendingTouch?.teamSide === 'away'
        ? awayTeam.name || t('away')
        : t('notSpecified');
  const pendingTouchPlayerLabel = pendingTouchPlayer ? String(pendingTouchPlayer.jerseyNumber) : t('notSpecified');
  const popupTeamOptions = useMemo(() => ([
    { teamSide: 'away' as const, label: awayTeam.name || t('away') },
    { teamSide: 'home' as const, label: homeTeam.name || t('home') },
  ]), [awayTeam.name, homeTeam.name, t]);
  const popupPlayerOptions = useMemo(() => {
    const activePlayers = flow.selectedTeamSide ? teamPlayersBySide[flow.selectedTeamSide] : [];
    return getPlayerOptions(activePlayers);
  }, [flow.selectedTeamSide, teamPlayersBySide]);
  const popupAvoidPoints = useMemo(() => getPopupAvoidPoints({
    popupAnchor: flow.popupAnchor,
    pendingTouch: flow.pendingTouch,
    teamPlayersBySide,
  }), [flow.pendingTouch, flow.popupAnchor, teamPlayersBySide]);
  const shouldShowTouchPopup = !flow.aceVictimSelection
    && selectedZone?.kind === 'in_court'
    && flow.pendingTouch !== null
    && flow.popupAnchor !== null;
  const touchPopup: ScoutingCourtTouchPopup | null = shouldShowTouchPopup && flow.pendingTouch && flow.popupAnchor
    ? {
        teamSide: flow.selectedTeamSide ?? flow.pendingTouch.teamSide,
        teamOptions: popupTeamOptions,
        playerId: flow.selectedPlayerId ?? flow.pendingTouch.playerId,
        playerOptions: popupPlayerOptions,
        playerLabel: pendingTouchPlayerLabel,
        teamLabel: pendingTouchTeamLabel,
        skill: flow.pendingTouch.skill,
        selectedEvaluation: flow.pendingTouch.evaluation,
        skillEditable: !flow.forceSkill,
        anchor: flow.popupAnchor,
        avoidPoints: popupAvoidPoints,
        onTeamChange: flow.handlePopupTeamChange,
        onPlayerChange: flow.handlePopupPlayerChange,
        onSkillChange: flow.handleSkillChange,
        onEvaluationChange: flow.handleEvaluationChange,
      }
    : null;
  const overlayMessage = flow.rallyEndPreview
    ? `${t('rallyEnded')} · ${t('confirmPoint')}`
    : flow.aceVictimSelection
      ? t('selectAceVictimPlayer')
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
  const selectedInputTeamLabel =
    flow.liveInputState.selectedTeamSide === 'home'
      ? homeTeam.name || t('home')
      : flow.liveInputState.selectedTeamSide === 'away'
        ? awayTeam.name || t('away')
        : t('notSpecified');
  const selectedInputPlayerLabel = selectedInputPlayer
    ? `#${selectedInputPlayer.jerseyNumber}`
    : t('notSpecified');
  const selectedSkill = flow.liveInputState.selectedSkill;
  const inputEvaluations = selectedSkill ? getEvaluationsForSkill(selectedSkill) : [];
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
          touchPopup={touchPopup}
          overlayMessage={overlayMessage}
          overlayActionLabel={flow.rallyEndPreview ? t('confirmPoint') : null}
          isBallDraggable={!flow.aceVictimSelection}
          onZoneSnap={flow.handleZoneSnap}
          onPlayerSelect={flow.handlePlayerSelection}
          onOverlayAction={flow.handleRallyEndConfirm}
          onBallPointerDown={onBallPointerDown}
          onBallPositionChange={flow.handleBallPositionChange}
        />
        <div
          className="live-rally-stage__input-bar"
          data-input-phase={flow.liveInputState.currentInputPhase}
        >
          <div className="live-rally-stage__input-summary" aria-label={t('selected')}>
            <span>{selectedInputTeamLabel}</span>
            <strong>{selectedInputPlayerLabel}</strong>
          </div>

          <div className="live-rally-stage__input-group" aria-label={t('skill')}>
            {TOUCH_SKILLS.map((skill) => (
              <button
                key={skill}
                type="button"
                className={`live-rally-stage__input-chip${selectedSkill === skill ? ' is-active' : ''}`}
                disabled={touchControlsDisabled || flow.forceSkill}
                aria-pressed={selectedSkill === skill}
                onClick={() => flow.handleSkillChange(skill)}
              >
                {t(getSkillTranslationKey(skill))}
              </button>
            ))}
          </div>

          <div className="live-rally-stage__input-group live-rally-stage__input-group--evaluation" aria-label={t('evaluation')}>
            {inputEvaluations.map((evaluation) => (
              <button
                key={evaluation}
                type="button"
                className={`live-rally-stage__input-chip live-rally-stage__input-chip--evaluation${
                  flow.liveInputState.selectedEvaluation === evaluation ? ' is-active' : ''
                }`}
                disabled={touchControlsDisabled}
                aria-pressed={flow.liveInputState.selectedEvaluation === evaluation}
                onClick={() => flow.handleEvaluationChange(evaluation)}
              >
                {evaluation}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ScoutingStageFrame>
  );
}
