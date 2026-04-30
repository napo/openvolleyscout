import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { OrientationGuard } from '@src/app/layout/OrientationGuard';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import { MatchReadinessSection } from '@src/features/startup/components/MatchReadinessSection';
import { matchRepository } from '@src/infrastructure/repositories';
import { evaluateMatchReadiness } from '@src/lib/validation/match-readiness';
import { useScoutingStore } from '../model/scouting-store';
import {
  LiveRallyStage,
  MatchEndStage,
  PreMatchConfigStage,
  SetEndStage,
  SetSetupStage,
} from '../components';
import {
  buildDataVolleyRallyCode,
  createAnalysisReadyProject,
  createClosedMatchProject,
  getNextLiveCourtPhase,
  getCompletedSetDisplaySummary,
  getCompletedSetsDisplaySummary,
  getScoutingStageSummary,
  getSetQuickStats,
  getScoutingStageLayoutPolicy,
  isLandscapeRequiredForScoutingStage,
  isOperationalScoutingStage,
  updateScoutingConfig,
  usesFixedScoutingShell,
  useScoutingPersistence,
  buildRedCardCorrectionEventLog,
  buildReplayCorrectionEventLog,
  buildRotationFaultCorrectionEventLog,
  getUndoLastPointAvailability,
  buildVideoCheckCorrectionEventLog,
  getEvaluationsForSkill,
  getLatestVideoCheckContext,
  type LiveCourtPhase,
  type PendingTouch,
  type ScoreCorrectionReason,
  type ScoutingStage,
  type VideoCheckContext,
} from '../model';
import '../scouting-screen.css';

type ScoreCorrectionDraft = {
  reason: ScoreCorrectionReason;
  penalizedTeam: TeamSide;
  videoCheckContext: VideoCheckContext | null;
  videoCheckTouch: BallTouch | null;
};

function createZoneReference(zone: ScoutingZone) {
  return {
    teamSide: zone.teamSide,
    zoneId: zone.id,
    gridCoordinate: zone.gridCoordinate,
    point: zone.center,
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
    case 'set_ended':
      return t('endSet');
    case 'rally_ended':
      return t('rallyEnded');
    default:
      return t('waitingToStartSet');
  }
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
  const awardPoint = useScoutingStore((state) => state.awardPoint);
  const awardManualPoint = useScoutingStore((state) => state.awardManualPoint);
  const endRally = useScoutingStore((state) => state.endRally);
  const undoLastPoint = useScoutingStore((state) => state.undoLastPoint);
  const activeConfig = useScoutingStore((state) => state.activeConfig);
  const replaceLiveMatchEvents = useScoutingStore((state) => state.replaceLiveMatchEvents);
  const [selectedZone, setSelectedZone] = useState<ScoutingZone | null>(null);
  const [stageOverride, setStageOverride] = useState<ScoutingStage | null>(null);
  const [courtPhase, setCourtPhase] = useState<LiveCourtPhase>('waiting_to_serve');
  const [courtStatusMessage, setCourtStatusMessage] = useState<string | null>(null);
  const [scoreCorrectionDraft, setScoreCorrectionDraft] = useState<ScoreCorrectionDraft | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const touchOriginZoneRef = useRef<ScoutingZone | null>(null);

  useScoutingPersistence(activeProject);

  useEffect(() => {
    syncWithProject(activeProject);
  }, [activeProject, syncWithProject]);

  const stageSummary = useMemo(
    () => (activeProject ? getScoutingStageSummary(activeProject, liveMatch) : null),
    [activeProject, liveMatch],
  );

  useEffect(() => {
    if (stageSummary?.currentStage !== 'set_end') {
      setStageOverride(null);
    }
  }, [stageSummary?.currentStage]);

  useEffect(() => () => {
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
    }
  }, []);

  const activeStage = stageOverride === 'set_setup' && stageSummary?.currentStage === 'set_end'
    ? 'set_setup'
    : stageSummary?.currentStage ?? 'pre_match_config';

  useEffect(() => {
    if (activeStage !== 'live_rally' || !liveMatch?.servingTeam || liveMatch.isRallyActive) {
      return;
    }

    setCourtPhase('waiting_to_serve');
    setSelectedZone(null);
    touchOriginZoneRef.current = null;
  }, [activeStage, liveMatch?.currentRallyNumber, liveMatch?.isRallyActive, liveMatch?.servingTeam]);

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

  const currentEvent = liveMatch?.eventLog.at(-1);
  const currentEventLabel = formatCurrentEventLabel(currentEvent?.type, t);
  const awayTeam = getMatchTeamSnapshot(activeProject, 'away');
  const homeTeam = getMatchTeamSnapshot(activeProject, 'home');
  const awayTeamName = awayTeam.name || t('away');
  const homeTeamName = homeTeam.name || t('home');
  const completedSets = liveMatch?.completedSets ?? activeProject.scoutingSession.completedSets ?? [];
  const currentSetLabel = liveMatch?.currentSetNumber ?? 1;
  const currentRallyLabel = liveMatch?.currentRallyNumber ?? activeProject.scoutingSession.currentRallyNumber ?? 1;
  const servingTeamLabel = liveMatch?.servingTeam
    ? liveMatch.servingTeam === 'home'
      ? homeTeamName
      : awayTeamName
    : t('notSpecified');
  const activeStageLayoutPolicy = getScoutingStageLayoutPolicy(activeStage);
  const requiresLandscape = isLandscapeRequiredForScoutingStage(activeStage);
  const usesFixedShell = usesFixedScoutingShell(activeStage);
  const isOperationalStage = isOperationalScoutingStage(activeStage);
  const isPreMatchStage = activeStage === 'pre_match_config';
  const currentSetNumber = liveMatch?.currentSetNumber ?? stageSummary.nextSetNumber;
  const scoutingConfig = activeProject.scoutingConfig ?? createDefaultScoutingMatchConfig(activeProject.metadata.format);
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

  const openScoreCorrection = () => {
    const videoCheckContext = liveMatch ? getLatestVideoCheckContext(liveMatch) : null;

    setScoreCorrectionDraft({
      reason: 'replay',
      penalizedTeam: liveMatch?.servingTeam ?? 'away',
      videoCheckContext,
      videoCheckTouch: videoCheckContext?.originalTouch
        ? {
            ...videoCheckContext.originalTouch,
            evaluation: videoCheckContext.proposedEvaluation ?? videoCheckContext.originalTouch.evaluation,
          }
        : null,
    });
  };

  const closeScoreCorrection = () => {
    setScoreCorrectionDraft(null);
  };

  const syncCourtStateFromLiveMatch = () => {
    const latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch?.servingTeam) {
      setSelectedZone(null);
      setCourtPhase('waiting_to_serve');
      touchOriginZoneRef.current = null;
      return;
    }

    const nextSelectedZone = latestLiveMatch.isRallyActive
      ? null
      : getDefaultServeStartZone(latestLiveMatch.servingTeam, LIVE_SCOUTING_CELLS);

    setSelectedZone(nextSelectedZone);
    setCourtPhase(latestLiveMatch.isRallyActive ? 'rally_in_play' : 'waiting_to_serve');
    touchOriginZoneRef.current = null;
  };

  const persistProject = async (project: MatchProject) => {
    const persistedProject = await matchRepository.update(project);
    setActiveProject(persistedProject);
  };

  const handleTouchConfirm = (draft: PendingTouch) => {
    const latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch) {
      return;
    }

    recordTouch({
      id: `touch-${Date.now()}`,
      setNumber: latestLiveMatch.currentSetNumber,
      rallyNumber: latestLiveMatch.currentRallyNumber,
      sequenceNumber: latestLiveMatch.currentRallyTouches.length + 1,
      playerId: draft.playerId,
      teamSide: draft.teamSide,
      skill: draft.skill,
      evaluation: draft.evaluation,
      zone: createZoneReference(draft.zone),
      originZone: touchOriginZoneRef.current ? createZoneReference(touchOriginZoneRef.current) : undefined,
      targetZone: createZoneReference(draft.zone),
      createdAt: Date.now(),
    });
  };

  const finalizeRally = (pointWinner: 'home' | 'away', reason?: string) => {
    awardPoint(pointWinner, reason);
    endRally();
    setSelectedZone(null);
    setCourtPhase('waiting_to_serve');
    touchOriginZoneRef.current = null;
    showTransientCourtMessage(`${t('rallyEnded')} · ${t('pointTo', {
      team: pointWinner === 'home' ? homeTeamName : awayTeamName,
    })}`);
  };

  const handleManualPoint = (pointWinner: TeamSide) => {
    if (!awardManualPoint(pointWinner)) {
      return;
    }

    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(t('pointAwardedTo', {
      team: pointWinner === 'home' ? homeTeamName : awayTeamName,
    }));
  };

  const handleUndoLastPoint = () => {
    if (!undoLastPoint()) {
      return;
    }

    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(t('undoLastPoint'));
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
      existingEvents: activeProject.events,
      completedSets: activeProject.scoutingSession.completedSets,
    };

    startSet(setStartInput);
    setStageOverride(null);
  };

  const handleSaveConfig = async (config: typeof scoutingConfig) => {
    await persistProject(updateScoutingConfig(activeProject, config));
    setStageOverride('set_setup');
  };

  const handleStartNextSet = () => {
    setSelectedZone(null);
    setCourtPhase('waiting_to_serve');
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
    if (courtPhase === 'waiting_to_serve' && nextCourtPhase === 'rally_in_play' && liveMatch && !liveMatch.isRallyActive) {
      startRally();
    }

    touchOriginZoneRef.current = selectedZone;
    setCourtPhase(nextCourtPhase);
    setSelectedZone(zone);
    if (zone.kind === 'in_court') {
      setCourtStatusMessage(null);
    }
  };

  const handleTouchesCommitted = (touches: PendingTouch[]) => {
    touches.forEach((touch) => {
      handleTouchConfirm(touch);
    });
  };

  const handleCorrectionReasonChange = (reason: ScoreCorrectionReason) => {
    setScoreCorrectionDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const videoCheckContext = liveMatch ? getLatestVideoCheckContext(liveMatch) : null;

      return {
        ...currentDraft,
        reason,
        videoCheckContext,
        videoCheckTouch: reason === 'video_check' && videoCheckContext?.originalTouch
          ? {
              ...videoCheckContext.originalTouch,
              evaluation: videoCheckContext.proposedEvaluation ?? videoCheckContext.originalTouch.evaluation,
            }
          : currentDraft.videoCheckTouch,
      };
    });
  };

  const handleCorrectionPenalizedTeamChange = (teamSide: TeamSide) => {
    setScoreCorrectionDraft((currentDraft) => (
      currentDraft
        ? {
            ...currentDraft,
            penalizedTeam: teamSide,
          }
        : currentDraft
    ));
  };

  const handleVideoCheckTeamChange = (teamSide: TeamSide) => {
    setScoreCorrectionDraft((currentDraft) => {
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
    setScoreCorrectionDraft((currentDraft) => (
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
    setScoreCorrectionDraft((currentDraft) => (
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

  const applyScoreCorrection = () => {
    if (!liveMatch || !activeConfig || !scoreCorrectionDraft) {
      return;
    }

    let nextEventLog = null;

    switch (scoreCorrectionDraft.reason) {
      case 'replay':
        nextEventLog = buildReplayCorrectionEventLog(liveMatch);
        break;
      case 'video_check':
        if (!scoreCorrectionDraft.videoCheckContext || !scoreCorrectionDraft.videoCheckTouch) {
          return;
        }
        nextEventLog = buildVideoCheckCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          updatedTouch: scoreCorrectionDraft.videoCheckTouch,
          touchIndex: scoreCorrectionDraft.videoCheckContext.touchIndex,
        });
        break;
      case 'rotation_fault':
        nextEventLog = buildRotationFaultCorrectionEventLog({
          liveMatch,
          config: activeConfig,
        });
        break;
      case 'red_card':
        nextEventLog = buildRedCardCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          penalizedTeam: scoreCorrectionDraft.penalizedTeam,
        });
        break;
      default:
        nextEventLog = null;
    }

    if (!nextEventLog || !replaceLiveMatchEvents(nextEventLog)) {
      return;
    }

    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(t('scoreCorrection'));
    closeScoreCorrection();
  };

  const handleFinishMatch = async () => {
    await persistProject(createClosedMatchProject(activeProject));
  };

  const handleOpenAnalysis = async () => {
    await persistProject(createAnalysisReadyProject(activeProject));
    navigate('/analysis');
  };

  const setQuickStats = useMemo(() => {
    if (!stageSummary.latestCompletedSet) {
      return null;
    }

    const latestSetSummary = getCompletedSetDisplaySummary(stageSummary.latestCompletedSet);
    const baseStats = getSetQuickStats(activeProject.events, stageSummary.latestCompletedSet.setNumber);
    const winningTeamName = latestSetSummary.winner === 'home'
      ? homeTeamName
      : latestSetSummary.winner === 'away'
        ? awayTeamName
        : t('notSpecified');

    return {
      ...baseStats,
      setScore: {
        home: latestSetSummary.homeScore,
        away: latestSetSummary.awayScore,
      },
      setsWon: stageSummary.setsWon,
      winningTeamName,
    };
  }, [activeProject.events, awayTeamName, homeTeamName, stageSummary.latestCompletedSet, stageSummary.setsWon, t]);

  const latestCompletedSetDisplay = useMemo(
    () => (stageSummary.latestCompletedSet ? getCompletedSetDisplaySummary(stageSummary.latestCompletedSet) : null),
    [stageSummary.latestCompletedSet],
  );

  const completedSetSummaries = useMemo(
    () => getCompletedSetsDisplaySummary(completedSets),
    [completedSets],
  );

  const matchWinnerName = useMemo(() => {
    if (stageSummary.setsWon.home === stageSummary.setsWon.away) {
      return t('notSpecified');
    }

    return stageSummary.setsWon.home > stageSummary.setsWon.away ? homeTeamName : awayTeamName;
  }, [awayTeamName, homeTeamName, stageSummary.setsWon, t]);

  const correctionPlayerOptions = scoreCorrectionDraft?.videoCheckTouch
    ? getPlayersForTeamSide(scoreCorrectionDraft.videoCheckTouch.teamSide)
    : [];

  const correctionEvaluationOptions = scoreCorrectionDraft?.videoCheckTouch
    ? getEvaluationsForSkill(scoreCorrectionDraft.videoCheckTouch.skill)
    : [];
  const undoLastPointAvailability = getUndoLastPointAvailability(liveMatch);

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

  const stageShellClassName = [
    'scouting-screen__stage-shell',
    activeStageLayoutPolicy.shellMode === 'flow' ? 'scouting-screen__stage-shell--flow' : '',
    isOperationalStage ? 'scouting-screen__stage-shell--operational' : '',
  ].filter(Boolean).join(' ');

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
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onBack={() => setStageOverride(null)}
          onSetStarted={handleSetStarted}
        />
      )}

      {activeStage === 'live_rally' && (
        <LiveRallyStage
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          awayLineup={liveMatch?.awayActiveLineup ?? null}
          homeLineup={liveMatch?.homeActiveLineup ?? null}
          servingTeam={liveMatch?.servingTeam ?? null}
          courtPhase={courtPhase}
          isRallyActive={liveMatch?.isRallyActive ?? false}
          currentRallyTouches={liveMatch?.currentRallyTouches ?? []}
          selectedZone={selectedZone}
          onSelectedZoneChange={handleSelectedZoneChange}
          onTouchesCommitted={handleTouchesCommitted}
          onRallyEnd={finalizeRally}
          statusMessage={courtStatusMessage}
        />
      )}

      {activeStage === 'set_end' && latestCompletedSetDisplay && setQuickStats && (
        <SetEndStage
          setSummary={latestCompletedSetDisplay}
          awayTeamName={awayTeamName}
          homeTeamName={homeTeamName}
          setsWon={stageSummary.setsWon}
          quickStats={setQuickStats}
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
            </div>
          </section>
        ) : activeStage === 'set_setup' ? null : (
          <section className={scoutingHeaderClassName}>
            <div className="scouting-screen__header-main scouting-screen__matchbar">
              <div className="scouting-screen__team scouting-screen__team--away">
                <span className="scouting-screen__team-role">{t('away')}</span>
                <strong className="scouting-screen__team-name">{awayTeamName}</strong>
              </div>

              <div className="scouting-screen__scoreboard">
                <div className="scouting-screen__scoreboard-main">
                  <span className="scouting-screen__score-label">{t('liveScore')}</span>
                  <div className="scouting-screen__score-value">
                    <span>{liveMatch?.awayScore ?? 0}</span>
                    <span className="scouting-screen__score-divider">:</span>
                    <span>{liveMatch?.homeScore ?? 0}</span>
                  </div>
                </div>
                <div className="scouting-screen__score-controls" aria-label={t('liveScore')}>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => handleManualPoint('home')}
                    aria-label={t('addPointHome')}
                    title={t('addPointHome')}
                  >
                    {t('home')} +
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={handleUndoLastPoint}
                    disabled={!undoLastPointAvailability.canApply}
                    aria-label={t('undoAction')}
                    title={t('undoAction')}
                  >
                    {t('undoAction')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => handleManualPoint('away')}
                    aria-label={t('addPointGuest')}
                    title={t('addPointGuest')}
                  >
                    {t('away')} +
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={openScoreCorrection}
                    aria-label={t('correctScore')}
                    title={t('correctScore')}
                  >
                    {t('correctScore')}
                  </button>
                </div>
              </div>

              <div className="scouting-screen__team scouting-screen__team--home">
                <span className="scouting-screen__team-role">{t('home')}</span>
                <strong className="scouting-screen__team-name">{homeTeamName}</strong>
              </div>
            </div>

            <div className="scouting-screen__meta-row">
              <div className="scouting-screen__score-meta">
                <span>{t('currentSet')}: {currentSetLabel}</span>
                <span>{t('rallyNumber')}: {currentRallyLabel}</span>
                <span>{t('servingTeam')}: {servingTeamLabel}</span>
              </div>

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

            {scoreCorrectionDraft ? (
              <div className="scouting-screen__correction-dialog" role="dialog" aria-label={t('correctScore')}>
                <div className="scouting-screen__correction-header">
                  <strong>{t('correctScore')}</strong>
                </div>

                <label className="scouting-screen__correction-field">
                  <span>{t('correctionReason')}</span>
                  <select
                    value={scoreCorrectionDraft.reason}
                    onChange={(event) => handleCorrectionReasonChange(event.target.value as ScoreCorrectionReason)}
                  >
                    <option value="replay">{t('correctionReplay')}</option>
                    <option value="video_check">{t('correctionVideoCheck')}</option>
                    <option value="rotation_fault">{t('correctionRotationFault')}</option>
                    <option value="red_card">{t('correctionRedCard')}</option>
                  </select>
                </label>

                {scoreCorrectionDraft.reason === 'red_card' ? (
                  <label className="scouting-screen__correction-field">
                    <span>{t('selectRedCardTeam')}</span>
                    <select
                      value={scoreCorrectionDraft.penalizedTeam}
                      onChange={(event) => handleCorrectionPenalizedTeamChange(event.target.value as TeamSide)}
                    >
                      <option value="away">{awayTeamName}</option>
                      <option value="home">{homeTeamName}</option>
                    </select>
                  </label>
                ) : null}

                {scoreCorrectionDraft.reason === 'video_check' && scoreCorrectionDraft.videoCheckTouch ? (
                  <div className="scouting-screen__correction-grid">
                    <label className="scouting-screen__correction-field">
                      <span>{t('team')}</span>
                      <select
                        value={scoreCorrectionDraft.videoCheckTouch.teamSide}
                        onChange={(event) => handleVideoCheckTeamChange(event.target.value as TeamSide)}
                      >
                        <option value="away">{awayTeamName}</option>
                        <option value="home">{homeTeamName}</option>
                      </select>
                    </label>

                    <label className="scouting-screen__correction-field">
                      <span>{t('jerseyNumber')}</span>
                      <select
                        value={scoreCorrectionDraft.videoCheckTouch.playerId}
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
                        value={scoreCorrectionDraft.videoCheckTouch.evaluation}
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

                <div className="scouting-screen__correction-actions">
                  <button type="button" className="btn-secondary btn-small" onClick={closeScoreCorrection}>
                    {t('cancelCorrection')}
                  </button>
                  <button type="button" className="btn-primary btn-small" onClick={applyScoreCorrection}>
                    {t('confirmCorrection')}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        )}
        <OrientationGuard enabled={requiresLandscape}>
          {stageContent}
        </OrientationGuard>
      </div>
    </main>
  );
}
