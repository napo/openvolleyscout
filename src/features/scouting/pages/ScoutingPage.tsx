import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { OrientationGuard } from '@src/app/layout/OrientationGuard';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import type { ScoutingMode } from '@src/domain/scouting/types';
import {
  createFullScoutingCells,
  getDefaultServeStartZoneForTeam,
  remapScoutingZonesForDisplaySides,
  type ScoutingZone,
} from '@src/domain/spatial';
import { updateBallTrajectoryMetadata } from '@src/domain/trajectory';
import type { BallTouch } from '@src/domain/touch/types';
import { MatchReadinessSection } from '@src/features/startup/components/MatchReadinessSection';
import { matchRepository } from '@src/infrastructure/repositories';
import { evaluateMatchReadiness } from '@src/lib/validation/match-readiness';
import { useDefenseSystemStore, useReceptionSystemStore } from '@src/features/systems/model';
import { useScoutingStore } from '../model/scouting-store';
import {
  LiveRallyStage,
  MatchEndStage,
  PreMatchConfigStage,
  ScoutingStageFrame,
  SetEndStage,
  SetSetupStage,
} from '../components';
import {
  buildDataVolleyRallyCode,
  buildMatchStats,
  buildSetMatchStats,
  createAnalysisReadyProject,
  createClosedMatchProject,
  getCompletedSetDisplaySummary,
  getCompletedSetsDisplaySummary,
  formatMatchResult,
  getNextSetPrefillConfig,
  getScoutingStageSummary,
  getScoutingStageLayoutPolicy,
  getLiveScoutingOrientationGuardMediaQuery,
  isLandscapeRequiredForScoutingStage,
  isOperationalScoutingStage,
  updateScoutingConfig,
  usesFixedScoutingShell,
  useScoutingPersistence,
  buildReplayCorrectionEventLog,
  buildRedCardCorrectionEventLog,
  buildRotationFaultCorrectionEventLog,
  getUndoLastPointAvailability,
  buildVideoCheckCorrectionEventLog,
  buildOtherDeadBallEvent,
  buildReplayActionEvent,
  buildSanctionRecordedEvent,
  buildSubstitutionMadeEvent,
  buildTimeoutCalledEvent,
  buildVideoCheckCorrectionEvent,
  getEligiblePlayersInForSubstitution,
  getNormalSubstitutionEligibility,
  getEvaluationsForSkill,
  getLatestVideoCheckContext,
  getProjectScoutingMode,
  getScoutingModeConfig,
  getScoutingModeLabelKey,
  normalizeScoutingMode,
  updateProjectScoutingMode,
  type LiveMatchState,
  type DeadBallEventType,
  type PendingTouch,
  type ScoutingStage,
  type VideoCheckContext,
} from '../model';
import {
  buildLiberoReplacementMadeEvent,
  getAutomaticLiberoReplacementProposal,
  getManualLiberoReplacementProposals,
  validateLiberoTouch,
  type LiberoReplacementProposal,
  type LiberoTouchViolation,
} from '../live/libero';
import {
  getNextLiveCourtPhase,
  type LiveCourtPhase,
} from '../live/tactical/tactical-zones';
import {
  getInitialTeamTacticalPhases,
  getNextTeamTacticalPhasesAfterTouch,
  getSetterReleasePhaseAfterTouch,
  getTeamTacticalPhasesAfterTouches,
  type TeamTacticalPhase,
  type TeamTacticalPhases,
} from '../live/tactical/tactical-transition';
import {
  shouldRenderCourtFirstLiveRally,
  shouldRenderDeadBallEventsPanel,
} from '../live/rally/live-stage-layout';
import { shouldReplaceLatestPendingTouch } from '../live/rally/rally-validation';
import '../scouting-screen.css';

type ManageActionDraft = {
  eventType: DeadBallEventType;
  teamSide: TeamSide;
  videoCheckContext: VideoCheckContext | null;
  videoCheckTouch: BallTouch | null;
  substitutionPlayerOutId: string;
  substitutionPlayerInId: string;
  liberoProposal: LiberoReplacementProposal | null;
};

type ScoreFeedback = {
  id: number;
  teamSide: TeamSide;
};

type ScoreSnapshot = {
  activeProjectId: string | null;
  setNumber: number | null;
  awayScore: number;
  homeScore: number;
};

const SCORE_FEEDBACK_DURATION_MS = 700;
const LIVE_SCOUTING_CELLS = createFullScoutingCells();

function createZoneReference(zone: ScoutingZone, pointOverride?: { x: number; y: number }) {
  return {
    teamSide: zone.teamSide,
    zoneId: zone.id,
    gridCoordinate: zone.gridCoordinate,
    point: pointOverride ?? zone.center,
  };
}

function formatCurrentEventLabel(
  eventType: string | undefined,
  t: (key: TranslationKey) => string,
) {
  switch (eventType) {
    case 'set_started':
      return t('setStarted');
    case 'rally_started':
      return t('rallyStarted');
    case 'touch_recorded':
      return t('touchRecorded');
    case 'point_awarded':
      return t('pointAwarded');
    case 'timeout_called':
      return t('timeout');
    case 'substitution_made':
      return t('substitution');
    case 'libero_replacement_made':
      return t('liberoReplacement');
    case 'red_card_point':
      return t('redCard');
    case 'replay_action':
      return t('replayAction');
    case 'video_check_correction':
      return t('videoCheck');
    case 'set_ended':
      return t('endSet');
    case 'rally_ended':
      return t('rallyEnded');
    default:
      return t('waitingToStartSet');
  }
}

function getLatestPointTeamSide(eventLog: readonly MatchEvent[] | undefined): TeamSide | null {
  return eventLog?.reduce<TeamSide | null>(
    (latestTeamSide, event) => (event.type === 'point_awarded' ? event.teamSide : latestTeamSide),
    null,
  ) ?? null;
}

export function ScoutingPage() {
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const readiness = evaluateMatchReadiness(activeProject);
  const liveMatch = useScoutingStore((state) => state.liveMatch);
  const syncWithProject = useScoutingStore((state) => state.syncWithProject);
  const startSet = useScoutingStore((state) => state.startSet);
  const startRally = useScoutingStore((state) => state.startRally);
  const recordTouch = useScoutingStore((state) => state.recordTouch);
  const setScoutingMode = useScoutingStore((state) => state.setScoutingMode);
  const awardPoint = useScoutingStore((state) => state.awardPoint);
  const awardManualPoint = useScoutingStore((state) => state.awardManualPoint);
  const endRally = useScoutingStore((state) => state.endRally);
  const undoLastPoint = useScoutingStore((state) => state.undoLastPoint);
  const activeConfig = useScoutingStore((state) => state.activeConfig);
  const replaceLiveMatchEvents = useScoutingStore((state) => state.replaceLiveMatchEvents);
  const activeDefenseSystemBlock = useDefenseSystemStore((state) => state.activeDefenseSystemBlock);
  const activeReceptionSystemBlock = useReceptionSystemStore((state) => state.activeReceptionSystemBlock);
  const [selectedZone, setSelectedZone] = useState<ScoutingZone | null>(null);
  const [stageOverride, setStageOverride] = useState<ScoutingStage | null>(null);
  const [courtPhase, setCourtPhase] = useState<LiveCourtPhase>('waiting_to_serve');
  const [teamTacticalPhases, setTeamTacticalPhases] = useState<TeamTacticalPhases>(() => getInitialTeamTacticalPhases(null));
  const [pendingSetterReleaseTeamSide, setPendingSetterReleaseTeamSide] = useState<TeamSide | null>(null);
  const [courtStatusMessage, setCourtStatusMessage] = useState<string | null>(null);
  const [manageActionDraft, setManageActionDraft] = useState<ManageActionDraft | null>(null);
  const [isAceVictimSelection, setIsAceVictimSelection] = useState(false);
  const [scoreFeedback, setScoreFeedback] = useState<ScoreFeedback | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const scoreFeedbackTimeoutRef = useRef<number | null>(null);
  const previousScoreSnapshotRef = useRef<ScoreSnapshot | null>(null);
  const touchOriginZoneRef = useRef<ScoutingZone | null>(null);
  const currentAwayScore = liveMatch?.awayScore ?? 0;
  const currentHomeScore = liveMatch?.homeScore ?? 0;

  useScoutingPersistence(activeProject);

  useEffect(() => {
    syncWithProject(activeProject);
  }, [activeProject, syncWithProject]);

  const stageSummary = useMemo(
    () => (activeProject ? getScoutingStageSummary(activeProject, liveMatch) : null),
    [activeProject, liveMatch],
  );

  const currentSetStartedEvent = useMemo(() => {
    if (!liveMatch) {
      return null;
    }

    return [...liveMatch.eventLog].reverse().find((event): event is Extract<MatchEvent, { type: 'set_started' }> => (
      event.type === 'set_started' && event.setNumber === liveMatch.currentSetNumber
    )) ?? null;
  }, [liveMatch]);

  const homeDisplaySide = currentSetStartedEvent?.homeLineup.displaySide ?? 'right';
  const awayDisplaySide = currentSetStartedEvent?.awayLineup.displaySide ?? 'left';
  const liveScoutingCells = useMemo(() => remapScoutingZonesForDisplaySides(LIVE_SCOUTING_CELLS, {
    away: awayDisplaySide,
    home: homeDisplaySide,
  }), [awayDisplaySide, homeDisplaySide]);

  useEffect(() => {
    if (stageSummary?.currentStage !== 'set_end') {
      setStageOverride(null);
    }
  }, [stageSummary?.currentStage]);

  useEffect(() => () => {
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    if (scoreFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(scoreFeedbackTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const currentSnapshot: ScoreSnapshot = {
      activeProjectId: liveMatch?.activeProjectId ?? null,
      setNumber: liveMatch?.currentSetNumber ?? null,
      awayScore: currentAwayScore,
      homeScore: currentHomeScore,
    };
    const previousSnapshot = previousScoreSnapshotRef.current;
    previousScoreSnapshotRef.current = currentSnapshot;

    if (
      !liveMatch
      || !previousSnapshot
      || previousSnapshot.activeProjectId !== currentSnapshot.activeProjectId
      || previousSnapshot.setNumber !== currentSnapshot.setNumber
    ) {
      return;
    }

    const awayScoreIncreased = currentSnapshot.awayScore > previousSnapshot.awayScore;
    const homeScoreIncreased = currentSnapshot.homeScore > previousSnapshot.homeScore;
    if (!awayScoreIncreased && !homeScoreIncreased) {
      return;
    }

    const scoringTeamSide = awayScoreIncreased && !homeScoreIncreased
      ? 'away'
      : homeScoreIncreased && !awayScoreIncreased
        ? 'home'
        : getLatestPointTeamSide(liveMatch.eventLog);

    if (!scoringTeamSide) {
      return;
    }

    const feedbackId = Date.now();
    setScoreFeedback({ id: feedbackId, teamSide: scoringTeamSide });

    if (scoreFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(scoreFeedbackTimeoutRef.current);
    }

    scoreFeedbackTimeoutRef.current = window.setTimeout(() => {
      setScoreFeedback((currentFeedback) => (
        currentFeedback?.id === feedbackId ? null : currentFeedback
      ));
      scoreFeedbackTimeoutRef.current = null;
    }, SCORE_FEEDBACK_DURATION_MS);
  }, [currentAwayScore, currentHomeScore, liveMatch]);

  const activeStage = stageOverride === 'set_setup' && stageSummary?.currentStage === 'set_end'
    ? 'set_setup'
    : stageSummary?.currentStage ?? 'pre_match_config';

  useEffect(() => {
    if (activeStage !== 'live_rally' || !liveMatch?.servingTeam || liveMatch.isRallyActive || manageActionDraft) {
      return;
    }

    setCourtPhase('waiting_to_serve');
    setTeamTacticalPhases(getInitialTeamTacticalPhases(liveMatch.servingTeam));
    setIsAceVictimSelection(false);
    setSelectedZone(null);
    touchOriginZoneRef.current = null;
  }, [activeStage, liveMatch?.currentRallyNumber, liveMatch?.isRallyActive, liveMatch?.servingTeam, manageActionDraft]);

  const showTransientCourtMessage = (message: string) => {
    setCourtStatusMessage(message);
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = window.setTimeout(() => {
      setCourtStatusMessage(null);
      statusTimeoutRef.current = null;
    }, 1400);
  };

  if (!activeProject) {
    return (
      <main className="scouting-screen scouting-screen--flow">
        <div className="scouting-screen__container">
          <section className="scouting-entry-card">
            <span className="scouting-entry-card__eyebrow">{t('scouting')}</span>
            <h1 className="scouting-entry-card__title">{t('scoutingEntryMatchRequiredTitle')}</h1>
            <p className="scouting-entry-card__description">{t('createMatchToStartScouting')}</p>
            <button type="button" className="btn-primary" onClick={() => navigate('/match')}>
              {t('goToMatchPage')}
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (!readiness.isReady) {
    return (
      <main className="match-setup-page match-setup-page--with-nav">
        <div className="match-setup-container match-setup-container--review">
          <header className="match-setup-header">
            <h1 className="match-setup-title">{t('scouting')}</h1>
            <p className="match-setup-subtitle">{t('matchNotReadyToStartScouting')}</p>
          </header>

          <div className="confirmation-content">
            <MatchReadinessSection readiness={readiness} />
            <div className="match-review-primary-action">
              <button type="button" className="btn-secondary" onClick={() => navigate('/match')}>
                {t('backToMatchSetup')}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!stageSummary) {
    return null;
  }

  const currentEvent = liveMatch?.eventLog.at(-1);
  const currentEventLabel = formatCurrentEventLabel(currentEvent?.type, t);
  const awayTeam = getMatchTeamSnapshot(activeProject, 'away');
  const homeTeam = getMatchTeamSnapshot(activeProject, 'home');
  const awayTeamName = awayTeam.name.trim() || t('away');
  const homeTeamName = homeTeam.name.trim() || t('home');
  const completedSets = liveMatch?.completedSets ?? activeProject.scoutingSession?.completedSets ?? [];
  const latestEventLog = liveMatch?.eventLog ?? activeProject.events;
  const currentSetLabel = liveMatch?.currentSetNumber ?? 1;
  const currentRallyLabel = liveMatch?.currentRallyNumber ?? activeProject.scoutingSession?.currentRallyNumber ?? 1;
  const servingTeamLabel = liveMatch?.servingTeam
    ? liveMatch.servingTeam === 'home'
      ? homeTeamName
      : awayTeamName
    : t('notSpecified');
  const activeStageLayoutPolicy = getScoutingStageLayoutPolicy(activeStage);
  const requiresLandscape = isLandscapeRequiredForScoutingStage(activeStage);
  const liveScoutingOrientationGuardMediaQuery = getLiveScoutingOrientationGuardMediaQuery();
  const usesFixedShell = usesFixedScoutingShell(activeStage);
  const isOperationalStage = isOperationalScoutingStage(activeStage);
  const isPreMatchStage = activeStage === 'pre_match_config';
  const currentSetNumber = liveMatch?.isSetStarted ? liveMatch.currentSetNumber : stageSummary.nextSetNumber;
  const scoutingConfig = activeProject.scoutingConfig ?? createDefaultScoutingMatchConfig(activeProject.metadata.format);
  const scoutingMode = normalizeScoutingMode(liveMatch?.scoutingMode ?? getProjectScoutingMode(activeProject));
  const scoutingModeConfig = getScoutingModeConfig(scoutingMode);
  const playedAt = activeProject.metadata.playedAt ? new Date(activeProject.metadata.playedAt) : null;
  const matchSummaryParts = [
    `${homeTeamName} - ${awayTeamName}`,
    activeProject.metadata.competition || t('unknownCompetition'),
    playedAt && !Number.isNaN(playedAt.getTime())
      ? playedAt.toLocaleDateString(locale)
      : t('dateUnavailable'),
    activeProject.metadata.venue || t('venueUnavailable'),
    playedAt && !Number.isNaN(playedAt.getTime())
      ? playedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : t('notSpecified'),
  ];
  const dataVolleyRallyCode = useMemo(() => {
    if (activeStage !== 'live_rally' || !liveMatch?.isRallyActive || (liveMatch.currentRallyTouches.length ?? 0) === 0) {
      return '';
    }

    const currentTouches = liveMatch.currentRallyTouches;

    return buildDataVolleyRallyCode({
      touches: currentTouches,
      getJerseyNumber: (playerId?: string) => {
        if (!playerId) {
          return undefined;
        }

        const players = [...homeTeam.players, ...awayTeam.players];
        return players.find((player) => player.id === playerId)?.jerseyNumber;
      },
    });
  }, [activeStage, awayTeam.players, homeTeam.players, liveMatch?.currentRallyTouches, liveMatch?.isRallyActive]);

  const getPlayersForTeamSide = (teamSide: TeamSide) => {
    const lineup = teamSide === 'home' ? liveMatch?.homeActiveLineup : liveMatch?.awayActiveLineup;
    const teamPlayers = teamSide === 'home' ? homeTeam.players : awayTeam.players;
    const lineupPlayerIds = lineup?.slots.map((slot) => slot.playerId) ?? [];
    const playersFromLineup = lineupPlayerIds
      .map((playerId) => teamPlayers.find((player) => player.id === playerId))
      .filter((player): player is typeof teamPlayers[number] => Boolean(player));

    return playersFromLineup.length > 0 ? playersFromLineup : teamPlayers;
  };

  const getTeamRosterForTeamSide = (teamSide: TeamSide) => (
    teamSide === 'home' ? homeTeam.players : awayTeam.players
  );

  const getLineupForTeamSide = (teamSide: TeamSide) => (
    teamSide === 'home' ? liveMatch?.homeActiveLineup ?? null : liveMatch?.awayActiveLineup ?? null
  );

  const getPlayerLabel = (teamSide: TeamSide, playerId: string) => {
    const player = getTeamRosterForTeamSide(teamSide).find((item) => item.id === playerId);

    return player ? `#${player.jerseyNumber} ${player.firstName} ${player.lastName}` : t('notSpecified');
  };

  const getLiberoProposalLabel = (proposal: LiberoReplacementProposal | null) => {
    if (!proposal) {
      return t('notSpecified');
    }

    return `${getPlayerLabel(proposal.teamSide, proposal.playerOutId)} ${t('playerOut').toLowerCase()}, ${
      getPlayerLabel(proposal.teamSide, proposal.playerInId)
    } ${t('playerIn').toLowerCase()}`;
  };

  const getLiberoFrontRowMessage = (proposal: LiberoReplacementProposal) => (
    t('liberoMustLeaveFrontRow', {
      player: getPlayerLabel(proposal.teamSide, proposal.replacedPlayerId),
    })
  );

  const getLiberoTouchViolationMessage = (violation: LiberoTouchViolation | undefined) => {
    switch (violation) {
      case 'libero_illegal_serve':
        return t('liberoIllegalServe');
      case 'libero_illegal_block':
        return t('liberoIllegalBlock');
      case 'libero_illegal_attack':
        return t('liberoIllegalAttack');
      default:
        return t('liberoReplacementTooSoon');
    }
  };

  const getLiberoEntryProposalMessage = (proposal: LiberoReplacementProposal) => (
    proposal.action === 'second_libero_enters'
      ? t('liberoSwapProposal')
      : t('liberoEntryProposal', {
          libero: getPlayerLabel(proposal.teamSide, proposal.liberoPlayerId),
          player: getPlayerLabel(proposal.teamSide, proposal.replacedPlayerId),
        })
  );

  const getAutomaticLiberoProposalMessage = (proposal: LiberoReplacementProposal) => (
    proposal.reason === 'front_row_exit'
      ? getLiberoFrontRowMessage(proposal)
      : proposal.reason === 'service_exit'
        ? t('liberoIllegalServe')
        : getLiberoEntryProposalMessage(proposal)
  );

  const getLiberoConfirmLabel = (proposal: LiberoReplacementProposal | null) => {
    if (proposal?.reason === 'front_row_exit') {
      return t('confirmLiberoExit');
    }

    if (proposal?.action === 'libero_enters') {
      return t('confirmLiberoEntry');
    }

    return t('confirmLiberoReplacement');
  };

  const getInitialLiberoEntryMessages = (sourceLiveMatch: LiveMatchState | null | undefined) => {
    if (!sourceLiveMatch) {
      return [];
    }

    return (['home', 'away'] as TeamSide[])
      .map((teamSide) => {
        const lineup = teamSide === 'home' ? sourceLiveMatch.homeActiveLineup : sourceLiveMatch.awayActiveLineup;
        const activeLiberoState = lineup?.personnelState.activeLiberoState;
        if (!activeLiberoState || activeLiberoState.enteredAtRallyNumber !== 1) {
          return null;
        }

        return t('liberoEntryProposal', {
          libero: getPlayerLabel(teamSide, activeLiberoState.liberoPlayerId),
          player: getPlayerLabel(teamSide, activeLiberoState.replacedPlayerId),
        });
      })
      .filter((message): message is string => Boolean(message));
  };

  const getLiberoProposalPriority = (proposal: LiberoReplacementProposal) => (
    proposal.reason === 'front_row_exit' ? 0 : 1
  );

  const getManageActionEventLabel = (eventType: DeadBallEventType) => {
    switch (eventType) {
      case 'replay':
        return t('replayAction');
      case 'video_check':
        return t('videoCheck');
      case 'rotation_fault':
        return t('correctionRotationFault');
      case 'red_card':
        return t('redCard');
      case 'timeout':
        return t('timeout');
      case 'substitution':
        return t('substitution');
      case 'libero_replacement':
        return t('liberoReplacement');
      case 'sanction':
        return t('reminderWarningSanction');
      case 'other':
        return t('other');
      default:
        return t('manageAction');
    }
  };

  const automaticLiberoProposals = liveMatch && !liveMatch.isRallyActive
    ? (['away', 'home'] as TeamSide[])
      .map((teamSide) => getAutomaticLiberoReplacementProposal(liveMatch, teamSide))
      .filter((proposal): proposal is LiberoReplacementProposal => Boolean(proposal))
      .sort((left, right) => getLiberoProposalPriority(left) - getLiberoProposalPriority(right))
    : [];
  const primaryAutomaticLiberoProposal = automaticLiberoProposals[0] ?? null;

  const createManageActionDraft = (
    eventType: DeadBallEventType,
    teamSide: TeamSide,
    liberoProposal: LiberoReplacementProposal | null = null,
  ): ManageActionDraft => {
    const videoCheckContext = liveMatch ? getLatestVideoCheckContext(liveMatch) : null;
    const lineup = getLineupForTeamSide(teamSide);
    const rosterPlayers = getTeamRosterForTeamSide(teamSide);
    const defaultSubstitutionPlayerOutId = lineup?.slots.find((slot) => (
      !slot.isLibero && !rosterPlayers.find((player) => player.id === slot.playerId)?.isLibero
    ))?.playerId ?? '';
    const defaultSubstitutionPlayerInId = lineup && defaultSubstitutionPlayerOutId
      ? getEligiblePlayersInForSubstitution({
          lineup,
          playerOutId: defaultSubstitutionPlayerOutId,
          rosterPlayers,
        })[0]?.id ?? ''
      : '';
    const defaultLiberoProposal = eventType === 'libero_replacement' && liveMatch
      ? liberoProposal
        ?? (!liveMatch.isRallyActive ? getAutomaticLiberoReplacementProposal(liveMatch, teamSide) : null)
        ?? getManualLiberoReplacementProposals(liveMatch, teamSide)[0]
        ?? null
      : null;

    return {
      eventType,
      teamSide,
      videoCheckContext,
      videoCheckTouch: videoCheckContext?.originalTouch
        ? {
            ...videoCheckContext.originalTouch,
            evaluation: videoCheckContext.proposedEvaluation ?? videoCheckContext.originalTouch.evaluation,
          }
        : null,
      substitutionPlayerOutId: defaultSubstitutionPlayerOutId,
      substitutionPlayerInId: defaultSubstitutionPlayerInId,
      liberoProposal: defaultLiberoProposal,
    };
  };

  const createLiberoReplacementDraft = (proposal: LiberoReplacementProposal): ManageActionDraft => ({
    eventType: 'libero_replacement',
    teamSide: proposal.teamSide,
    videoCheckContext: null,
    videoCheckTouch: null,
    substitutionPlayerOutId: '',
    substitutionPlayerInId: '',
    liberoProposal: proposal,
  });

  const openAutomaticLiberoProposal = (sourceLiveMatch: LiveMatchState | null | undefined) => {
    const proposal = sourceLiveMatch && !sourceLiveMatch.isRallyActive
      ? (['away', 'home'] as TeamSide[])
        .map((teamSide) => getAutomaticLiberoReplacementProposal(sourceLiveMatch, teamSide))
        .filter((item): item is LiberoReplacementProposal => Boolean(item))
        .sort((left, right) => getLiberoProposalPriority(left) - getLiberoProposalPriority(right))[0] ?? null
      : null;

    if (!proposal) {
      return false;
    }

    setManageActionDraft(createLiberoReplacementDraft(proposal));
    showTransientCourtMessage(getAutomaticLiberoProposalMessage(proposal));
    return true;
  };

  const openManageAction = () => {
    const defaultTeamSide = primaryAutomaticLiberoProposal?.teamSide ?? liveMatch?.servingTeam ?? 'away';
    const defaultEventType: DeadBallEventType = primaryAutomaticLiberoProposal ? 'libero_replacement' : 'replay';

    setManageActionDraft(createManageActionDraft(defaultEventType, defaultTeamSide, primaryAutomaticLiberoProposal));
  };

  const closeManageAction = () => {
    setManageActionDraft(null);
  };

  useEffect(() => {
    if (
      activeStage !== 'live_rally'
      || manageActionDraft
      || !primaryAutomaticLiberoProposal
    ) {
      return;
    }

    setManageActionDraft(createLiberoReplacementDraft(primaryAutomaticLiberoProposal));
    showTransientCourtMessage(getAutomaticLiberoProposalMessage(primaryAutomaticLiberoProposal));
  }, [
    activeStage,
    manageActionDraft,
    primaryAutomaticLiberoProposal?.action,
    primaryAutomaticLiberoProposal?.playerInId,
    primaryAutomaticLiberoProposal?.playerOutId,
    primaryAutomaticLiberoProposal?.reason,
    primaryAutomaticLiberoProposal?.teamSide,
  ]);

  const syncCourtStateFromLiveMatch = () => {
    const latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch?.servingTeam) {
      setSelectedZone(null);
      setCourtPhase('waiting_to_serve');
      setTeamTacticalPhases(getInitialTeamTacticalPhases(null));
      setPendingSetterReleaseTeamSide(null);
      setIsAceVictimSelection(false);
      touchOriginZoneRef.current = null;
      return;
    }

    const nextSelectedZone = latestLiveMatch.isRallyActive
      ? null
      : getDefaultServeStartZoneForTeam(latestLiveMatch.servingTeam, liveScoutingCells);

    setSelectedZone(nextSelectedZone);
    setCourtPhase(latestLiveMatch.isRallyActive ? 'rally_in_play' : 'waiting_to_serve');
    setTeamTacticalPhases(getTeamTacticalPhasesAfterTouches({
      servingTeam: latestLiveMatch.servingTeam,
      touches: latestLiveMatch.currentRallyTouches,
    }));
    setPendingSetterReleaseTeamSide(null);
    setIsAceVictimSelection(false);
    touchOriginZoneRef.current = null;
  };

  const persistProject = async (project: MatchProject) => {
    const persistedProject = await matchRepository.update(project);
    setActiveProject(persistedProject);
  };

  const handleScoutingModeChange = (nextModeValue: string) => {
    const nextMode = normalizeScoutingMode(nextModeValue);
    if (nextMode === scoutingMode) {
      return;
    }

    if (liveMatch?.isRallyActive) {
      window.confirm(t('modeChangeRequiresConfirmation'));
      return;
    }

    if (setScoutingMode(nextMode)) {
      showTransientCourtMessage(t(getScoutingModeLabelKey(nextMode)));
      return;
    }

    void persistProject(updateProjectScoutingMode(activeProject, nextMode));
  };

  const createTouchEventLocation = (touch: BallTouch): Extract<MatchEvent, { type: 'touch_recorded' }>['location'] => ({
    teamSide: touch.zone?.teamSide ?? touch.teamSide,
    zoneId: touch.zone?.zoneId,
    gridCoordinate: touch.zone?.gridCoordinate,
    point: touch.zone?.point,
  });

  const replaceLatestCurrentRallyTouch = (touch: BallTouch) => {
    const latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch?.isRallyActive) {
      return false;
    }

    const eventIndex = [...latestLiveMatch.eventLog].reverse().findIndex((event) => (
      event.type === 'touch_recorded'
      && event.touch.setNumber === touch.setNumber
      && event.touch.rallyNumber === touch.rallyNumber
      && event.touch.sequenceNumber === touch.sequenceNumber
    ));
    if (eventIndex < 0) {
      return false;
    }

    const eventLogIndex = latestLiveMatch.eventLog.length - 1 - eventIndex;
    const event = latestLiveMatch.eventLog[eventLogIndex];
    if (event.type !== 'touch_recorded') {
      return false;
    }

    const nextEventLog = latestLiveMatch.eventLog.map((currentEvent, index) => (
      index === eventLogIndex
        ? {
            ...event,
            createdAt: touch.createdAt,
            touch,
            location: createTouchEventLocation(touch),
          }
        : currentEvent
    ));

    return replaceLiveMatchEvents(nextEventLog);
  };

  const handleTouchConfirm = (draft: PendingTouch) => {
    let latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch) {
      return;
    }

    const liberoTouchValidation = validateLiberoTouch({
      lineups: {
        homeActiveLineup: latestLiveMatch.homeActiveLineup,
        awayActiveLineup: latestLiveMatch.awayActiveLineup,
      },
      teamSide: draft.teamSide,
      playerId: draft.playerId,
      skill: draft.skill,
    });
    if (!liberoTouchValidation.isValid) {
      showTransientCourtMessage(getLiberoTouchViolationMessage(liberoTouchValidation.violation));
      return;
    }

    if (!latestLiveMatch.isRallyActive) {
      if (draft.skill !== 'serve') {
        return;
      }

      startRally();
      latestLiveMatch = useScoutingStore.getState().liveMatch;
      if (!latestLiveMatch?.isRallyActive) {
        return;
      }
    }

    const previousTouch = latestLiveMatch.currentRallyTouches.at(-1) ?? null;
    const replacesPreviousTouch = shouldReplaceLatestPendingTouch(
      previousTouch,
      draft,
      latestLiveMatch.currentSetNumber,
      latestLiveMatch.currentRallyNumber,
    );
    const touchId = replacesPreviousTouch ? previousTouch.id : `touch-${Date.now()}`;
    const trajectory = draft.trajectory
      ? updateBallTrajectoryMetadata(draft.trajectory, {
          rallyTouchId: touchId,
          teamSide: draft.teamSide,
          skill: draft.skill,
          evaluation: draft.evaluation,
        })
      : undefined;
    const touch: BallTouch = {
      id: touchId,
      setNumber: latestLiveMatch.currentSetNumber,
      rallyNumber: latestLiveMatch.currentRallyNumber,
      sequenceNumber: replacesPreviousTouch ? previousTouch.sequenceNumber : latestLiveMatch.currentRallyTouches.length + 1,
      playerId: draft.playerId,
      teamSide: draft.teamSide,
      skill: draft.skill,
      evaluation: draft.evaluation,
      zone: createZoneReference(draft.zone, draft.destinationPoint),
      originZone: touchOriginZoneRef.current ? createZoneReference(touchOriginZoneRef.current) : undefined,
      targetZone: createZoneReference(draft.zone, draft.destinationPoint),
      trajectory,
      createdAt: Date.now(),
      source: draft.source ?? 'explicit',
      touchOrigin: draft.touchOrigin ?? (draft.source === 'inferred' ? 'implicit_inference' : scoutingModeConfig.touchOrigin),
      advancedDetails: draft.advancedDetails,
      requiredExplicitInput: draft.requiredExplicitInput
        ?? (scoutingModeConfig.requiredExplicitInput.skill || scoutingModeConfig.requiredExplicitInput.evaluation),
      inferredCandidate: draft.inferredCandidate ?? false,
      pendingInference: draft.pendingInference ?? false,
      inferenceReason: draft.inferenceReason,
      inferredFromTouchId: draft.inferredFromTouchId,
    };

    if (replacesPreviousTouch && replaceLatestCurrentRallyTouch(touch)) {
      const updatedLiveMatch = useScoutingStore.getState().liveMatch;
      if (updatedLiveMatch) {
        const pendingRelease = shouldQueueSetterRelease(teamTacticalPhases[touch.teamSide], touch);
        if (pendingRelease) {
          setPendingSetterReleaseTeamSide(touch.teamSide);
        } else {
          setTeamTacticalPhases(getTeamTacticalPhasesAfterTouches({
            servingTeam: updatedLiveMatch.servingTeam,
            touches: updatedLiveMatch.currentRallyTouches,
          }));
        }
      }
      return;
    }

    recordTouch(touch);
    if (shouldQueueSetterRelease(teamTacticalPhases[touch.teamSide], touch)) {
      setPendingSetterReleaseTeamSide(touch.teamSide);
    } else {
      setTeamTacticalPhases((currentPhases) => getNextTeamTacticalPhasesAfterTouch({
        phases: currentPhases,
        touch,
        previousTouch,
        servingTeam: latestLiveMatch.servingTeam,
      }));
    }
  };

  const finalizeRally = (pointWinner: 'home' | 'away', reason?: string) => {
    awardPoint(pointWinner, reason);
    const pointAwardedLiveMatch = useScoutingStore.getState().liveMatch;
    endRally();
    const rallyEndedLiveMatch = useScoutingStore.getState().liveMatch;
    setSelectedZone(null);
    setCourtPhase('waiting_to_serve');
    setTeamTacticalPhases(getInitialTeamTacticalPhases(pointWinner));
    setIsAceVictimSelection(false);
    touchOriginZoneRef.current = null;
    if (openAutomaticLiberoProposal(rallyEndedLiveMatch ?? pointAwardedLiveMatch)) {
      return;
    }

    showTransientCourtMessage(`${t('rallyEnded')} · ${t('pointTo', {
      team: pointWinner === 'home' ? homeTeamName : awayTeamName,
    })}`);
  };

  const handleManualPoint = (pointWinner: TeamSide) => {
    if (!awardManualPoint(pointWinner)) {
      return;
    }

    syncCourtStateFromLiveMatch();
    if (openAutomaticLiberoProposal(useScoutingStore.getState().liveMatch)) {
      return;
    }

    showTransientCourtMessage(t('pointAwardedTo', {
      team: pointWinner === 'home' ? homeTeamName : awayTeamName,
    }));
  };

  const handleUndoLastPoint = (teamSide?: TeamSide) => {
    if (teamSide) {
      const latestPointTeamSide = getLatestPointTeamSide(useScoutingStore.getState().liveMatch?.eventLog);

      if (latestPointTeamSide !== teamSide) {
        return;
      }
    }

    if (!undoLastPoint()) {
      return;
    }

    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(
      teamSide
        ? t('undoForTeam', { team: teamSide === 'home' ? homeTeamName : awayTeamName })
        : t('undoLastPoint'),
    );
  };

  const handleSetStarted = ({
    homeStartingLineup,
    awayStartingLineup,
    servingTeam,
  }: {
    homeStartingLineup: Parameters<typeof startSet>[0]['homeStartingLineup'];
    awayStartingLineup: Parameters<typeof startSet>[0]['awayStartingLineup'];
    servingTeam: Parameters<typeof startSet>[0]['servingTeam'];
  }) => {
    if (!activeProject) {
      return;
    }

    const setStartInput = {
      activeProjectId: activeProject.metadata.id,
      setNumber: currentSetNumber,
      homeStartingLineup,
      awayStartingLineup,
      servingTeam,
      scoutingMode,
      existingEvents: latestEventLog,
      completedSets,
    };

    startSet(setStartInput);
    const startedLiveMatch = useScoutingStore.getState().liveMatch;
    setTeamTacticalPhases(getInitialTeamTacticalPhases(servingTeam));
    setCourtPhase('waiting_to_serve');
    setIsAceVictimSelection(false);
    setSelectedZone(null);
    touchOriginZoneRef.current = null;
    setStageOverride(null);

    const initialLiberoMessages = getInitialLiberoEntryMessages(startedLiveMatch);
    if (initialLiberoMessages.length > 0) {
      showTransientCourtMessage(initialLiberoMessages.join(' · '));
    }
  };

  const handleSaveConfig = async (config: typeof scoutingConfig) => {
    await persistProject(updateScoutingConfig(activeProject, config));
    setStageOverride('set_setup');
  };

  const handleStartNextSet = () => {
    setSelectedZone(null);
    setCourtPhase('waiting_to_serve');
    setTeamTacticalPhases(getInitialTeamTacticalPhases(null));
    setIsAceVictimSelection(false);
    touchOriginZoneRef.current = null;
    setStageOverride('set_setup');
  };

  const handleSelectedZoneChange = (zone: ScoutingZone | null) => {
    if (!zone) {
      setSelectedZone(null);
      touchOriginZoneRef.current = null;
      return;
    }

    const nextCourtPhase = getNextLiveCourtPhase(courtPhase, zone);

    touchOriginZoneRef.current = selectedZone;
    setCourtPhase(nextCourtPhase);
    setSelectedZone(zone);
    if (zone.kind === 'in_court') {
      setCourtStatusMessage(null);
    }
  };

  const handleBallPointerDown = () => {
    if (!pendingSetterReleaseTeamSide || !liveMatch) {
      return;
    }

    const latestTouch = liveMatch.currentRallyTouches.at(-1);
    if (!latestTouch || latestTouch.teamSide !== pendingSetterReleaseTeamSide) {
      setPendingSetterReleaseTeamSide(null);
      return;
    }

    setTeamTacticalPhases((currentPhases) => getNextTeamTacticalPhasesAfterTouch({
      phases: currentPhases,
      touch: latestTouch,
      previousTouch: liveMatch.currentRallyTouches.at(-2) ?? null,
      servingTeam: liveMatch.servingTeam,
    }));
    setPendingSetterReleaseTeamSide(null);
  };

  const handleTouchesCommitted = (touches: PendingTouch[]) => {
    touches.forEach((touch) => {
      handleTouchConfirm(touch);
    });
  };

  const shouldQueueSetterRelease = (phase: TeamTacticalPhase, touch: BallTouch) => (
    getSetterReleasePhaseAfterTouch(phase, touch) !== null
  );

  const handleManageActionTypeChange = (eventType: DeadBallEventType) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return createManageActionDraft(eventType, currentDraft.teamSide);
    });
  };

  const handleManageActionTeamChange = (teamSide: TeamSide) => {
    setManageActionDraft((currentDraft) => (
      currentDraft
        ? createManageActionDraft(currentDraft.eventType, teamSide)
        : currentDraft
    ));
  };

  const handleVideoCheckTeamChange = (teamSide: TeamSide) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft?.videoCheckTouch) {
        return currentDraft;
      }

      const nextPlayers = getPlayersForTeamSide(teamSide);
      const nextPlayer = nextPlayers.find((player) => player.id === currentDraft.videoCheckTouch?.playerId) ?? nextPlayers[0];

      return {
        ...currentDraft,
        videoCheckTouch: {
          ...currentDraft.videoCheckTouch,
          teamSide,
          playerId: nextPlayer?.id,
        },
      };
    });
  };

  const handleVideoCheckPlayerChange = (playerId: string) => {
    setManageActionDraft((currentDraft) => (
      currentDraft?.videoCheckTouch
        ? {
            ...currentDraft,
            videoCheckTouch: {
              ...currentDraft.videoCheckTouch,
              playerId,
            },
          }
        : currentDraft
    ));
  };

  const handleVideoCheckEvaluationChange = (evaluation: SkillEvaluation) => {
    setManageActionDraft((currentDraft) => (
      currentDraft?.videoCheckTouch
        ? {
            ...currentDraft,
            videoCheckTouch: {
              ...currentDraft.videoCheckTouch,
              evaluation,
            },
          }
        : currentDraft
    ));
  };

  const handleSubstitutionPlayerOutChange = (playerOutId: string) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const lineup = getLineupForTeamSide(currentDraft.teamSide);
      const rosterPlayers = getTeamRosterForTeamSide(currentDraft.teamSide);
      const playerInId = lineup
        ? getEligiblePlayersInForSubstitution({
            lineup,
            playerOutId,
            rosterPlayers,
          })[0]?.id ?? ''
        : '';

      return {
        ...currentDraft,
        substitutionPlayerOutId: playerOutId,
        substitutionPlayerInId: playerInId,
      };
    });
  };

  const handleSubstitutionPlayerInChange = (playerInId: string) => {
    setManageActionDraft((currentDraft) => (
      currentDraft
        ? {
            ...currentDraft,
            substitutionPlayerInId: playerInId,
          }
        : currentDraft
    ));
  };

  const handleLiberoProposalChange = (proposalIndex: number) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft || !liveMatch) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        liberoProposal: getManualLiberoReplacementProposals(liveMatch, currentDraft.teamSide)[proposalIndex] ?? null,
      };
    });
  };

  const applyLiberoProposal = (proposal: LiberoReplacementProposal) => {
    if (!liveMatch) {
      return;
    }

    const nextEventLog = [
      ...liveMatch.eventLog,
      buildLiberoReplacementMadeEvent(liveMatch, proposal),
    ];

    if (!replaceLiveMatchEvents(nextEventLog)) {
      return;
    }

    const updatedLiveMatch = useScoutingStore.getState().liveMatch;
    syncCourtStateFromLiveMatch();

    if (openAutomaticLiberoProposal(updatedLiveMatch)) {
      return;
    }

    showTransientCourtMessage(getAutomaticLiberoProposalMessage(proposal));
    closeManageAction();
  };

  const applyManageAction = () => {
    if (!liveMatch || !manageActionDraft) {
      return;
    }

    let nextEventLog: MatchEvent[] | null = null;

    switch (manageActionDraft.eventType) {
      case 'replay':
        nextEventLog = buildReplayCorrectionEventLog(liveMatch);
        if (nextEventLog) {
          nextEventLog = [...nextEventLog, buildReplayActionEvent(liveMatch, manageActionDraft.teamSide)];
        }
        break;
      case 'video_check':
        if (!activeConfig || !manageActionDraft.videoCheckContext || !manageActionDraft.videoCheckTouch) {
          return;
        }
        nextEventLog = buildVideoCheckCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          updatedTouch: manageActionDraft.videoCheckTouch,
          touchIndex: manageActionDraft.videoCheckContext.touchIndex,
        });
        if (nextEventLog) {
          nextEventLog = [
            ...nextEventLog,
            buildVideoCheckCorrectionEvent(
              liveMatch,
              manageActionDraft.videoCheckTouch.id,
              manageActionDraft.videoCheckTouch.teamSide,
            ),
          ];
        }
        break;
      case 'rotation_fault':
        if (!activeConfig) {
          return;
        }
        nextEventLog = buildRotationFaultCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          penalizedTeam: manageActionDraft.teamSide,
        });
        break;
      case 'red_card':
        if (!activeConfig) {
          return;
        }
        nextEventLog = buildRedCardCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          penalizedTeam: manageActionDraft.teamSide,
        });
        break;
      case 'timeout':
        nextEventLog = [...liveMatch.eventLog, buildTimeoutCalledEvent(liveMatch, manageActionDraft.teamSide)];
        break;
      case 'substitution': {
        const lineup = getLineupForTeamSide(manageActionDraft.teamSide);
        const rosterPlayers = getTeamRosterForTeamSide(manageActionDraft.teamSide);
        if (!lineup || !manageActionDraft.substitutionPlayerOutId || !manageActionDraft.substitutionPlayerInId) {
          return;
        }

        const eligibility = getNormalSubstitutionEligibility({
          lineup,
          playerOutId: manageActionDraft.substitutionPlayerOutId,
          playerInId: manageActionDraft.substitutionPlayerInId,
          rosterPlayers,
        });
        if (!eligibility.isEligible) {
          return;
        }

        const reentryPair = lineup.personnelState.substitutionPairs.find((pair) => (
          pair.playerOutId === manageActionDraft.substitutionPlayerInId
          && pair.playerInId === manageActionDraft.substitutionPlayerOutId
          && !pair.hasReentered
        ));

        nextEventLog = [
          ...liveMatch.eventLog,
          buildSubstitutionMadeEvent({
            liveMatch,
            teamSide: manageActionDraft.teamSide,
            playerOutId: manageActionDraft.substitutionPlayerOutId,
            playerInId: manageActionDraft.substitutionPlayerInId,
            canReenterOnlyForPlayerId: reentryPair
              ? manageActionDraft.substitutionPlayerOutId
              : manageActionDraft.substitutionPlayerInId,
            hasReentered: Boolean(reentryPair),
          }),
        ];
        break;
      }
      case 'libero_replacement':
        if (!manageActionDraft.liberoProposal) {
          return;
        }

        nextEventLog = [
          ...liveMatch.eventLog,
          buildLiberoReplacementMadeEvent(liveMatch, manageActionDraft.liberoProposal),
        ];
        break;
      case 'sanction':
        nextEventLog = [...liveMatch.eventLog, buildSanctionRecordedEvent(liveMatch, manageActionDraft.teamSide)];
        break;
      case 'other':
        nextEventLog = [...liveMatch.eventLog, buildOtherDeadBallEvent(liveMatch, manageActionDraft.teamSide)];
        break;
      default:
        nextEventLog = null;
    }

    if (!nextEventLog || !replaceLiveMatchEvents(nextEventLog)) {
      return;
    }

    const updatedLiveMatch = useScoutingStore.getState().liveMatch;
    syncCourtStateFromLiveMatch();

    if (openAutomaticLiberoProposal(updatedLiveMatch)) {
      return;
    }

    showTransientCourtMessage(
      manageActionDraft.eventType === 'libero_replacement' && manageActionDraft.liberoProposal
        ? getAutomaticLiberoProposalMessage(manageActionDraft.liberoProposal)
        : t('manageAction'),
    );
    closeManageAction();
  };

  const handleFinishMatch = async () => {
    await persistProject(createClosedMatchProject(activeProject));
  };

  const handleOpenAnalysis = async () => {
    await persistProject(createAnalysisReadyProject(activeProject));
    navigate('/analysis');
  };

  const latestCompletedSetDisplay = useMemo(
    () => (stageSummary.latestCompletedSet ? getCompletedSetDisplaySummary(stageSummary.latestCompletedSet) : null),
    [stageSummary.latestCompletedSet],
  );

  const completedSetSummaries = useMemo(
    () => getCompletedSetsDisplaySummary(completedSets),
    [completedSets],
  );

  const nextSetPrefillConfig = useMemo(
    () => getNextSetPrefillConfig({
      eventLog: latestEventLog,
      nextSetNumber: stageSummary.nextSetNumber,
    }),
    [latestEventLog, stageSummary.nextSetNumber],
  );

  const latestCompletedSetStats = useMemo(
    () => (stageSummary.latestCompletedSet
      ? buildSetMatchStats({
          homeTeam,
          awayTeam,
          eventLog: latestEventLog,
          completedSets,
        }, stageSummary.latestCompletedSet.setNumber)
      : null),
    [awayTeam, completedSets, homeTeam, latestEventLog, stageSummary.latestCompletedSet],
  );

  const matchStats = useMemo(
    () => buildMatchStats({
      homeTeam,
      awayTeam,
      eventLog: latestEventLog,
      completedSets,
    }),
    [awayTeam, completedSets, homeTeam, latestEventLog],
  );

  const matchResult = useMemo(
    () => formatMatchResult({
      completedSets,
      config: scoutingConfig,
      goldenSetScore: activeProject.scoutingSession?.goldenSetScore,
      isComplete: stageSummary.isMatchComplete
        || activeProject.phase === 'closed'
        || activeProject.phase === 'analysis'
        || activeProject.scoutingSession?.matchStatus === 'completed',
      goldenSetLabel: t('goldenSet').toLowerCase(),
    }),
    [activeProject.phase, activeProject.scoutingSession?.goldenSetScore, activeProject.scoutingSession?.matchStatus, completedSets, scoutingConfig, stageSummary.isMatchComplete, t],
  );

  const matchWinnerName = useMemo(() => {
    if (matchResult.winnerSide === 'home') {
      return homeTeamName;
    }

    if (matchResult.winnerSide === 'away') {
      return awayTeamName;
    }

    if (stageSummary.setsWon.home === stageSummary.setsWon.away) {
      return t('notSpecified');
    }

    return stageSummary.setsWon.home > stageSummary.setsWon.away ? homeTeamName : awayTeamName;
  }, [awayTeamName, homeTeamName, matchResult.winnerSide, stageSummary.setsWon, t]);

  const correctionPlayerOptions = manageActionDraft?.videoCheckTouch
    ? getPlayersForTeamSide(manageActionDraft.videoCheckTouch.teamSide)
    : [];

  const correctionEvaluationOptions = manageActionDraft?.videoCheckTouch
    ? getEvaluationsForSkill(manageActionDraft.videoCheckTouch.skill)
    : [];
  const selectedManageActionLineup = manageActionDraft ? getLineupForTeamSide(manageActionDraft.teamSide) : null;
  const selectedManageActionRoster = manageActionDraft ? getTeamRosterForTeamSide(manageActionDraft.teamSide) : [];
  const substitutionPlayerOutOptions = selectedManageActionLineup?.slots.filter((slot) => (
    !slot.isLibero && !selectedManageActionRoster.find((player) => player.id === slot.playerId)?.isLibero
  )) ?? [];
  const substitutionPlayerInOptions = manageActionDraft && selectedManageActionLineup && manageActionDraft.substitutionPlayerOutId
    ? getEligiblePlayersInForSubstitution({
        lineup: selectedManageActionLineup,
        playerOutId: manageActionDraft.substitutionPlayerOutId,
        rosterPlayers: selectedManageActionRoster,
      })
    : [];
  const manualLiberoProposals = manageActionDraft?.eventType === 'libero_replacement' && liveMatch
    ? getManualLiberoReplacementProposals(liveMatch, manageActionDraft.teamSide)
    : [];
  const selectedLiberoProposalIndex = manageActionDraft?.liberoProposal
    ? manualLiberoProposals.findIndex((proposal) => (
        proposal.action === manageActionDraft.liberoProposal?.action
        && proposal.playerOutId === manageActionDraft.liberoProposal.playerOutId
        && proposal.playerInId === manageActionDraft.liberoProposal.playerInId
      ))
    : -1;
  const selectedTeamName = manageActionDraft?.teamSide === 'home' ? homeTeamName : awayTeamName;
  const opponentTeamName = manageActionDraft?.teamSide === 'home' ? awayTeamName : homeTeamName;
  const selectedActiveLiberoState = selectedManageActionLineup?.personnelState.activeLiberoState ?? null;
  const selectedSecondLiberoId = selectedManageActionLineup?.personnelState.secondLiberoPlayerId;
  const selectedSubstitutionEligibility = manageActionDraft && selectedManageActionLineup
    && manageActionDraft.substitutionPlayerOutId
    && manageActionDraft.substitutionPlayerInId
    ? getNormalSubstitutionEligibility({
        lineup: selectedManageActionLineup,
        playerOutId: manageActionDraft.substitutionPlayerOutId,
        playerInId: manageActionDraft.substitutionPlayerInId,
        rosterPlayers: selectedManageActionRoster,
      })
    : null;
  const canConfirmManageAction = manageActionDraft ? (() => {
    if (manageActionDraft.eventType === 'substitution') {
      return Boolean(selectedSubstitutionEligibility?.isEligible);
    }

    if (manageActionDraft.eventType === 'libero_replacement') {
      return Boolean(manageActionDraft.liberoProposal);
    }

    if (manageActionDraft.eventType === 'video_check') {
      return Boolean(manageActionDraft.videoCheckContext && manageActionDraft.videoCheckTouch);
    }

    return true;
  })() : false;
  const renderDeadBallEventsPanel = shouldRenderDeadBallEventsPanel({
    activeStage,
    hasManageActionPanel: Boolean(manageActionDraft),
  });
  const renderCourtFirstLiveRally = shouldRenderCourtFirstLiveRally({
    activeStage,
    hasManageActionPanel: Boolean(manageActionDraft),
  });
  const undoLastPointAvailability = getUndoLastPointAvailability(liveMatch);
  const latestUndoablePointTeamSide = undoLastPointAvailability.canApply
    ? getLatestPointTeamSide(liveMatch?.eventLog)
    : null;
  const canUndoAwayPoint = latestUndoablePointTeamSide === 'away';
  const canUndoHomePoint = latestUndoablePointTeamSide === 'home';
  const scoreFeedbackSideClassName = scoreFeedback ? `is-scoring-${scoreFeedback.teamSide}` : '';
  const scoreFeedbackTeamName = scoreFeedback?.teamSide === 'home' ? homeTeamName : awayTeamName;
  const canEditLiveScore = activeStage === 'live_rally' && Boolean(liveMatch?.isSetStarted) && !isAceVictimSelection;

  const scoutingScreenClassName = [
    'scouting-screen',
    usesFixedShell ? 'scouting-screen--fixed' : 'scouting-screen--flow',
    isOperationalStage ? 'scouting-screen--operational' : '',
  ].filter(Boolean).join(' ');

  const scoutingContainerClassName = [
    'scouting-screen__container',
    usesFixedShell ? 'scouting-screen__container--fixed' : 'scouting-screen__container--flow',
  ].filter(Boolean).join(' ');

  const scoutingHeaderClassName = [
    'scouting-screen__header',
    usesFixedShell ? 'scouting-screen__header--compact' : '',
    isOperationalStage ? 'scouting-screen__header--operational' : '',
  ].filter(Boolean).join(' ');

  const scoutingModeSwitch = (
    <label className="scouting-screen__mode-switch">
      <span>{t('scoutingMode')}</span>
      <select
        value={scoutingMode}
        aria-label={t('switchScoutingMode')}
        onChange={(event) => handleScoutingModeChange(event.target.value as ScoutingMode)}
      >
        <option value="simple">{t('simpleMode')}</option>
        <option value="advanced">{t('advancedMode')}</option>
      </select>
    </label>
  );

  const scoutingMatchbarClassName = [
    'scouting-screen__header-main',
    'scouting-screen__matchbar',
    scoreFeedbackSideClassName,
  ].filter(Boolean).join(' ');

  const stageShellClassName = [
    'scouting-screen__stage-shell',
    activeStageLayoutPolicy.shellMode === 'flow' ? 'scouting-screen__stage-shell--flow' : '',
    isOperationalStage ? 'scouting-screen__stage-shell--operational' : '',
  ].filter(Boolean).join(' ');

  const manageActionPanel = manageActionDraft ? (
    <div className="scouting-screen__manage-action-stage">
      <div className="scouting-screen__correction-dialog scouting-screen__manage-action-dialog" role="dialog" aria-label={t('endOfActionEvents')}>
        <div className="scouting-screen__correction-header">
          <strong>{t('endOfActionEvents')}</strong>
          <span className="scouting-screen__correction-action">{t('manageAction')}</span>
        </div>

        {primaryAutomaticLiberoProposal ? (
          <section className="scouting-screen__manage-action-proposal" aria-label={t('proposedAutomaticAction')}>
            <span>{t('proposedAutomaticAction')}</span>
            <strong>
              {primaryAutomaticLiberoProposal.reason === 'front_row_exit'
                ? getLiberoFrontRowMessage(primaryAutomaticLiberoProposal)
                : primaryAutomaticLiberoProposal.reason === 'service_exit'
                  ? t('liberoIllegalServe')
                  : getLiberoEntryProposalMessage(primaryAutomaticLiberoProposal)}
            </strong>
            <p>{getLiberoProposalLabel(primaryAutomaticLiberoProposal)}</p>
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => applyLiberoProposal(primaryAutomaticLiberoProposal)}
            >
              {getLiberoConfirmLabel(primaryAutomaticLiberoProposal)}
            </button>
          </section>
        ) : null}

        <div className="scouting-screen__correction-grid scouting-screen__manage-action-top-grid">
          <label className="scouting-screen__correction-field">
            <span>{t('selectTeam')}</span>
            <select
              value={manageActionDraft.teamSide}
              onChange={(event) => handleManageActionTeamChange(event.target.value as TeamSide)}
            >
              <option value="away">{awayTeamName}</option>
              <option value="home">{homeTeamName}</option>
            </select>
          </label>

          <label className="scouting-screen__correction-field">
            <span>{t('teamEvent')}</span>
            <select
              value={manageActionDraft.eventType}
              onChange={(event) => handleManageActionTypeChange(event.target.value as DeadBallEventType)}
            >
              <optgroup label={t('pointCorrection')}>
                <option value="replay">{t('replayAction')}</option>
                <option value="video_check">{t('videoCheck')}</option>
                <option value="rotation_fault">{t('correctionRotationFault')}</option>
                <option value="red_card">{t('redCard')}</option>
              </optgroup>
              <optgroup label={t('teamEvent')}>
                <option value="timeout">{t('timeout')}</option>
                <option value="substitution">{t('substitution')}</option>
                <option value="libero_replacement">{t('liberoReplacement')}</option>
                <option value="sanction">{t('reminderWarningSanction')}</option>
                <option value="other">{t('other')}</option>
              </optgroup>
            </select>
          </label>
        </div>

        <div className="scouting-screen__manage-action-options" aria-label={t('pointCorrection')}>
          {(['replay', 'video_check', 'rotation_fault', 'red_card'] as DeadBallEventType[]).map((eventType) => (
            <button
              key={eventType}
              type="button"
              className={`scouting-screen__manage-action-option ${manageActionDraft.eventType === eventType ? 'is-active' : ''}`}
              onClick={() => handleManageActionTypeChange(eventType)}
            >
              {getManageActionEventLabel(eventType)}
            </button>
          ))}
        </div>

        <div className="scouting-screen__manage-action-options" aria-label={t('teamEvent')}>
          {(['timeout', 'substitution', 'libero_replacement', 'sanction', 'other'] as DeadBallEventType[]).map((eventType) => (
            <button
              key={eventType}
              type="button"
              className={`scouting-screen__manage-action-option ${manageActionDraft.eventType === eventType ? 'is-active' : ''}`}
              onClick={() => handleManageActionTypeChange(eventType)}
            >
              {getManageActionEventLabel(eventType)}
            </button>
          ))}
        </div>

        {manageActionDraft.eventType === 'video_check' && manageActionDraft.videoCheckTouch ? (
          <div className="scouting-screen__correction-grid">
            <label className="scouting-screen__correction-field">
              <span>{t('team')}</span>
              <select
                value={manageActionDraft.videoCheckTouch.teamSide}
                onChange={(event) => handleVideoCheckTeamChange(event.target.value as TeamSide)}
              >
                <option value="away">{awayTeamName}</option>
                <option value="home">{homeTeamName}</option>
              </select>
            </label>

            <label className="scouting-screen__correction-field">
              <span>{t('jerseyNumber')}</span>
              <select
                value={manageActionDraft.videoCheckTouch.playerId}
                onChange={(event) => handleVideoCheckPlayerChange(event.target.value)}
              >
                {correctionPlayerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.jerseyNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="scouting-screen__correction-field">
              <span>{t('evaluation')}</span>
              <select
                value={manageActionDraft.videoCheckTouch.evaluation}
                onChange={(event) => handleVideoCheckEvaluationChange(event.target.value as SkillEvaluation)}
              >
                {correctionEvaluationOptions.map((evaluation) => (
                  <option key={evaluation} value={evaluation}>
                    {evaluation}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {manageActionDraft.eventType === 'substitution' ? (
          <div className="scouting-screen__correction-grid">
            <label className="scouting-screen__correction-field">
              <span>{t('playerOut')}</span>
              <select
                value={manageActionDraft.substitutionPlayerOutId}
                onChange={(event) => handleSubstitutionPlayerOutChange(event.target.value)}
              >
                {substitutionPlayerOutOptions.map((slot) => (
                  <option key={slot.playerId} value={slot.playerId}>
                    {getPlayerLabel(manageActionDraft.teamSide, slot.playerId)}
                  </option>
                ))}
              </select>
            </label>

            <label className="scouting-screen__correction-field">
              <span>{t('playerIn')}</span>
              <select
                value={manageActionDraft.substitutionPlayerInId}
                onChange={(event) => handleSubstitutionPlayerInChange(event.target.value)}
              >
                {substitutionPlayerInOptions.length > 0 ? substitutionPlayerInOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {getPlayerLabel(manageActionDraft.teamSide, player.id)}
                  </option>
                )) : (
                  <option value="">{t('noEligibleSubstitutions')}</option>
                )}
              </select>
            </label>
          </div>
        ) : null}

        {manageActionDraft.eventType === 'libero_replacement' ? (
          <div className="scouting-screen__manage-action-libero">
            <div className="scouting-screen__manage-action-status">
              <span>{t('liberoOnCourt')}: {selectedActiveLiberoState ? getPlayerLabel(manageActionDraft.teamSide, selectedActiveLiberoState.liberoPlayerId) : t('notSpecified')}</span>
              <span>{t('replacedPlayer')}: {selectedActiveLiberoState ? getPlayerLabel(manageActionDraft.teamSide, selectedActiveLiberoState.replacedPlayerId) : t('notSpecified')}</span>
              <span>{t('secondLibero')}: {selectedSecondLiberoId ? getPlayerLabel(manageActionDraft.teamSide, selectedSecondLiberoId) : t('notSpecified')}</span>
            </div>

            <label className="scouting-screen__correction-field">
              <span>{t('liberoReplacement')}</span>
              <select
                value={selectedLiberoProposalIndex >= 0 ? selectedLiberoProposalIndex : ''}
                onChange={(event) => handleLiberoProposalChange(Number(event.target.value))}
              >
                {manualLiberoProposals.length > 0 ? manualLiberoProposals.map((proposal, index) => (
                  <option key={`${proposal.action}-${proposal.playerOutId}-${proposal.playerInId}`} value={index}>
                    {getLiberoProposalLabel(proposal)}
                  </option>
                )) : (
                  <option value="">{t('noLiberoReplacementAvailable')}</option>
                )}
              </select>
            </label>
          </div>
        ) : null}

        <div className="scouting-screen__manage-action-confirmation">
          <span>{t('proposedAutomaticAction')}</span>
          <strong>
            {manageActionDraft.eventType === 'substitution'
              ? `${getPlayerLabel(manageActionDraft.teamSide, manageActionDraft.substitutionPlayerOutId)} ${t('playerOut').toLowerCase()}, ${getPlayerLabel(manageActionDraft.teamSide, manageActionDraft.substitutionPlayerInId)} ${t('playerIn').toLowerCase()}`
              : manageActionDraft.eventType === 'libero_replacement'
                ? getLiberoProposalLabel(manageActionDraft.liberoProposal)
                : manageActionDraft.eventType === 'red_card'
                  ? `${t('redCard')}: ${selectedTeamName}; ${t('pointTo', { team: opponentTeamName })}`
                  : manageActionDraft.eventType === 'timeout'
                    ? `${t('timeout')}: ${selectedTeamName}`
                    : getManageActionEventLabel(manageActionDraft.eventType)}
          </strong>
        </div>

        <div className="scouting-screen__correction-actions">
          <button type="button" className="btn-secondary btn-small" onClick={closeManageAction}>
            {t('cancelEvent')}
          </button>
          <button type="button" className="btn-primary btn-small" onClick={applyManageAction} disabled={!canConfirmManageAction}>
            {manageActionDraft.eventType === 'substitution'
              ? t('confirmSubstitution')
              : manageActionDraft.eventType === 'libero_replacement'
                ? getLiberoConfirmLabel(manageActionDraft.liberoProposal)
                : t('confirmEvent')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const stageContent = (
    <section className={stageShellClassName}>
      {activeStage === 'pre_match_config' && (
        <PreMatchConfigStage
          initialConfig={scoutingConfig}
          onSave={handleSaveConfig}
        />
      )}

      {activeStage === 'set_setup' && (
        <SetSetupStage
          matchSummary={matchSummaryParts.join(' | ')}
          setNumber={currentSetNumber}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          initialSetup={stageSummary.latestCompletedSet ? nextSetPrefillConfig : null}
          onBack={() => setStageOverride(null)}
          onSetStarted={handleSetStarted}
        />
      )}

      {renderDeadBallEventsPanel ? (
        <ScoutingStageFrame
          stage="live_rally"
          eyebrow=""
          title=""
          description=""
          bodyClassName="scouting-stage__body--live-rally scouting-stage__body--events-panel"
        >
          <div className="live-rally-stage live-rally-stage--events-panel">
            {manageActionPanel}
          </div>
        </ScoutingStageFrame>
      ) : null}

      {renderCourtFirstLiveRally && (
        <LiveRallyStage
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          awayLineup={liveMatch?.awayActiveLineup ?? null}
          homeLineup={liveMatch?.homeActiveLineup ?? null}
          awayDisplaySide={awayDisplaySide}
          homeDisplaySide={homeDisplaySide}
          defenseSystemBlock={activeDefenseSystemBlock}
          receptionSystemBlock={activeReceptionSystemBlock}
          teamTacticalPhases={teamTacticalPhases}
          servingTeam={liveMatch?.servingTeam ?? null}
          scoutingMode={scoutingMode}
          courtPhase={courtPhase}
          isRallyActive={liveMatch?.isRallyActive ?? false}
          currentRallyTouches={liveMatch?.currentRallyTouches ?? []}
          selectedZone={selectedZone}
          onSelectedZoneChange={handleSelectedZoneChange}
          onTouchesCommitted={handleTouchesCommitted}
          onRallyEnd={finalizeRally}
          onAceVictimSelectionChange={setIsAceVictimSelection}
          onBallPointerDown={handleBallPointerDown}
          canUndoLastPoint={canEditLiveScore && undoLastPointAvailability.canApply}
          canOpenEvents={canEditLiveScore}
          onUndoLastPoint={() => handleUndoLastPoint()}
          onOpenEvents={openManageAction}
          statusMessage={courtStatusMessage}
        />
      )}

      {activeStage === 'set_end' && latestCompletedSetDisplay && latestCompletedSetStats && (
        <SetEndStage
          setSummary={latestCompletedSetDisplay}
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          setsWon={stageSummary.setsWon}
          setStats={latestCompletedSetStats}
          canStartNextSet={!stageSummary.isMatchComplete}
          onStartNextSet={handleStartNextSet}
          onFinishMatch={() => void handleFinishMatch()}
        />
      )}

      {activeStage === 'match_end' && (
        <MatchEndStage
          awayTeamName={awayTeamName}
          homeTeamName={homeTeamName}
          winnerTeamName={matchWinnerName}
          setsWon={stageSummary.setsWon}
          completedSets={completedSetSummaries}
          matchStats={matchStats}
          matchResult={matchResult}
          onOpenAnalysis={handleOpenAnalysis}
          onBackToMatchSetup={() => navigate('/match')}
        />
      )}
    </section>
  );

  return (
    <main className={scoutingScreenClassName}>
      <div className={scoutingContainerClassName}>
        {isPreMatchStage ? (
          <section className="scouting-screen__pre-match-header">
            <p className="scouting-screen__pre-match-summary">
              <span className="scouting-screen__pre-match-summary-label">{t('match')}:</span>{' '}
              {matchSummaryParts.join(' | ')}
            </p>
            <div className="scouting-screen__pre-match-copy">
              <h1 className="scouting-screen__pre-match-title">{t('preMatchConfigTitle')}</h1>
              <p className="scouting-screen__pre-match-description">{t('preMatchConfigMatchLevelDescription')}</p>
              {scoutingModeSwitch}
            </div>
          </section>
        ) : activeStage === 'set_setup' ? null : (
          <section className={scoutingHeaderClassName}>
            <div className={scoutingMatchbarClassName}>
              <div className="scouting-screen__team scouting-screen__team--away">
                <div className="scouting-screen__side-controls scouting-screen__side-controls--away">
                  <button
                    type="button"
                    className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--add"
                    onClick={() => handleManualPoint('away')}
                    disabled={!canEditLiveScore}
                    aria-label={t('addPointToTeam', { team: awayTeamName })}
                    title={`+1 ${awayTeamName}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--undo"
                    onClick={() => handleUndoLastPoint('away')}
                    disabled={!canEditLiveScore || !canUndoAwayPoint}
                    aria-label={t('undoForTeam', { team: awayTeamName })}
                    title={t('undoForTeam', { team: awayTeamName })}
                  >
                    {t('undoAction')}
                  </button>
                </div>
                <strong className="scouting-screen__team-name">{awayTeamName}</strong>
              </div>

              <div className="scouting-screen__scoreboard">
                <div className="scouting-screen__scoreboard-main">
                  <span className="scouting-screen__score-label">{t('currentResult')}</span>
                  <div className="scouting-screen__score-value" aria-label={`${homeTeamName} ${stageSummary.setsWon.home} ${t('sets')} / ${currentHomeScore} ${t('points')}; ${awayTeamName} ${stageSummary.setsWon.away} ${t('sets')} / ${currentAwayScore} ${t('points')}`}>
                    <span className="scouting-screen__score-row">
                      <span className="scouting-screen__score-row-label">{t('sets')}</span>
                      <strong>{stageSummary.setsWon.home}-{stageSummary.setsWon.away}</strong>
                    </span>
                    <span className="scouting-screen__score-row">
                      <span className="scouting-screen__score-row-label">{t('points')}</span>
                      <strong>
                        <span
                          key={`home-${currentHomeScore}`}
                          className="scouting-screen__score-number scouting-screen__score-number--home score-animated"
                        >
                          {currentHomeScore}
                        </span>
                        <span className="scouting-screen__score-divider">-</span>
                        <span
                          key={`away-${currentAwayScore}`}
                          className="scouting-screen__score-number scouting-screen__score-number--away score-animated"
                        >
                          {currentAwayScore}
                        </span>
                      </strong>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-small scouting-screen__score-correction-button"
                  onClick={openManageAction}
                  disabled={!canEditLiveScore}
                  aria-label={t('manageAction')}
                  title={t('manageAction')}
                >
                  {t('manageAction')}
                </button>
              </div>

              <div className="scouting-screen__team scouting-screen__team--home">
                <strong className="scouting-screen__team-name">{homeTeamName}</strong>
                <div className="scouting-screen__side-controls scouting-screen__side-controls--home">
                  <button
                    type="button"
                    className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--undo"
                    onClick={() => handleUndoLastPoint('home')}
                    disabled={!canEditLiveScore || !canUndoHomePoint}
                    aria-label={t('undoForTeam', { team: homeTeamName })}
                    title={t('undoForTeam', { team: homeTeamName })}
                  >
                    {t('undoAction')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--add"
                    onClick={() => handleManualPoint('home')}
                    disabled={!canEditLiveScore}
                    aria-label={t('addPointToTeam', { team: homeTeamName })}
                    title={`+1 ${homeTeamName}`}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="scouting-screen__meta-row">
              <div className="scouting-screen__score-meta">
                <span>{t('currentSet')}: {currentSetLabel}</span>
                <span>{t('rallyNumber')}: {currentRallyLabel}</span>
                <span>{t('servingTeam')}: {servingTeamLabel}</span>
              </div>

              {scoutingModeSwitch}

              <div className="scouting-screen__event scouting-screen__event--inline">
                <span className="scouting-screen__event-label">{t('currentEvent')}</span>
                <strong className="scouting-screen__event-value">{currentEventLabel}</strong>
              </div>
            </div>

            {activeStage === 'live_rally' && dataVolleyRallyCode ? (
              <div className="scouting-screen__datavolley-code" aria-live="polite">
                {dataVolleyRallyCode}
              </div>
            ) : null}

          </section>
        )}
        {scoreFeedback ? (
          <div
            key={scoreFeedback.id}
            className={`scouting-screen__rally-won-overlay scouting-screen__rally-won-overlay--${scoreFeedback.teamSide}`}
            role="status"
            aria-live="polite"
          >
            <span className="scouting-screen__rally-won-label">{t('rallyWon')}</span>
            <strong className="scouting-screen__rally-won-team">{scoreFeedbackTeamName}</strong>
          </div>
        ) : null}
        <OrientationGuard
          enabled={requiresLandscape}
          mediaQuery={liveScoutingOrientationGuardMediaQuery}
          messageKey="rotateForLiveScouting"
          hintKey={null}
        >
          {stageContent}
        </OrientationGuard>
      </div>
    </main>
  );
}
