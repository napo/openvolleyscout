import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { OrientationGuard } from '@src/app/layout/OrientationGuard';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import { createFullScoutingCells, getDefaultServeStartZone, type ScoutingZone } from '@src/domain/spatial';
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
  type LiveCourtPhase,
  type ScoutingStage,
} from '../model';
import '../scouting-screen.css';

const LIVE_SCOUTING_CELLS = createFullScoutingCells();

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
  const [selectedZone, setSelectedZone] = useState<ScoutingZone | null>(null);
  const [stageOverride, setStageOverride] = useState<ScoutingStage | null>(null);
  const [courtPhase, setCourtPhase] = useState<LiveCourtPhase>('waiting_to_serve');

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

  const activeStage = stageOverride === 'set_setup' && stageSummary?.currentStage === 'set_end'
    ? 'set_setup'
    : stageSummary?.currentStage ?? 'pre_match_config';

  useEffect(() => {
    if (activeStage !== 'live_rally' || !liveMatch?.servingTeam || liveMatch.isRallyActive) {
      return;
    }

    const defaultServeStartZone = getDefaultServeStartZone(liveMatch.servingTeam, LIVE_SCOUTING_CELLS);
    if (!defaultServeStartZone) {
      return;
    }

    setCourtPhase('waiting_to_serve');
    setSelectedZone(defaultServeStartZone);
  }, [activeStage, liveMatch?.currentRallyNumber, liveMatch?.isRallyActive, liveMatch?.servingTeam]);

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

  const persistProject = async (project: MatchProject) => {
    const persistedProject = await matchRepository.update(project);
    setActiveProject(persistedProject);
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
    setStageOverride('set_setup');
  };

  const handleSelectedZoneChange = (zone: ScoutingZone | null) => {
    if (!zone) {
      return;
    }

    const nextCourtPhase = getNextLiveCourtPhase(courtPhase, zone);
    if (courtPhase === 'waiting_to_serve' && nextCourtPhase === 'rally_in_play' && liveMatch && !liveMatch.isRallyActive) {
      startRally();
    }

    setCourtPhase(nextCourtPhase);
    setSelectedZone(zone);
  };

  const handleTouchConfirm = ({
    playerId,
    teamSide,
    skill,
    evaluation,
    zone,
  }: {
    playerId?: string;
    teamSide: 'home' | 'away';
    skill: Parameters<typeof recordTouch>[0]['skill'];
    evaluation?: Parameters<typeof recordTouch>[0]['evaluation'];
    zone: ScoutingZone;
  }) => {
    if (!liveMatch) {
      return;
    }

    recordTouch({
      id: `touch-${Date.now()}`,
      setNumber: liveMatch.currentSetNumber,
      rallyNumber: liveMatch.currentRallyNumber,
      sequenceNumber: liveMatch.currentRallyTouches.length + 1,
      playerId,
      teamSide,
      skill,
      evaluation,
      zone: {
        teamSide: zone.teamSide,
        zoneId: zone.id,
        gridCoordinate: zone.gridCoordinate,
        point: zone.center,
      },
      createdAt: Date.now(),
    });
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
          onTouchConfirm={handleTouchConfirm}
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
                <span className="scouting-screen__score-label">{t('liveScore')}</span>
                <div className="scouting-screen__score-value">
                  <span>{liveMatch?.awayScore ?? 0}</span>
                  <span className="scouting-screen__score-divider">:</span>
                  <span>{liveMatch?.homeScore ?? 0}</span>
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
          </section>
        )}
        <OrientationGuard enabled={requiresLandscape}>
          {stageContent}
        </OrientationGuard>
      </div>
    </main>
  );
}
