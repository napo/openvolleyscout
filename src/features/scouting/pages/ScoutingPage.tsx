import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import type { CourtZone } from '@src/domain/court';
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
  getScoutingStageSummary,
  getSetQuickStats,
  updateScoutingConfig,
  useScoutingPersistence,
  type ScoutingStage,
} from '../model';
import '../scouting-screen.css';

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
    case 'rally_ended':
      return t('rallyEnded');
    default:
      return t('waitingToStartSet');
  }
}

export function ScoutingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const readiness = evaluateMatchReadiness(activeProject);
  const liveMatch = useScoutingStore((state) => state.liveMatch);
  const syncWithProject = useScoutingStore((state) => state.syncWithProject);
  const startSet = useScoutingStore((state) => state.startSet);
  const endSet = useScoutingStore((state) => state.endSet);
  const [selectedZone, setSelectedZone] = useState<CourtZone | null>(null);
  const [stageOverride, setStageOverride] = useState<ScoutingStage | null>(null);

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

  if (!activeProject) {
    return (
      <main className="scouting-screen">
        <div className="scouting-screen__container">
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {t('scouting')}
          </h1>
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
  const currentSetLabel = liveMatch?.currentSetNumber ?? 1;
  const currentRallyLabel = liveMatch?.currentRallyNumber ?? activeProject.scoutingSession.currentRallyNumber ?? 1;
  const servingTeamLabel = liveMatch?.servingTeam
    ? liveMatch.servingTeam === 'home'
      ? homeTeamName
      : awayTeamName
    : t('notSpecified');
  const activeStage = stageOverride === 'set_setup' && stageSummary.currentStage === 'set_end'
    ? 'set_setup'
    : stageSummary.currentStage;
  const currentSetNumber = liveMatch?.currentSetNumber ?? stageSummary.nextSetNumber;
  const scoutingConfig = activeProject.scoutingConfig ?? createDefaultScoutingMatchConfig(activeProject.metadata.format);

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
  };

  const handleEndSet = () => {
    endSet();
    setSelectedZone(null);
    setStageOverride(null);
  };

  const handleStartNextSet = () => {
    setSelectedZone(null);
    setStageOverride('set_setup');
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

    return getSetQuickStats(activeProject.events, stageSummary.latestCompletedSet.setNumber);
  }, [activeProject.events, stageSummary.latestCompletedSet]);

  return (
    <main className="scouting-screen scouting-screen--fixed">
      <div className="scouting-screen__container scouting-screen__container--fixed">
        <section className="scouting-screen__header scouting-screen__header--compact">
          <div className="scouting-screen__event">
            <span className="scouting-screen__event-label">{t('currentEvent')}</span>
            <strong className="scouting-screen__event-value">{currentEventLabel}</strong>
          </div>

          <div className="scouting-screen__matchbar">
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
              <div className="scouting-screen__score-meta">
                <span>{t('currentSet')}: {currentSetLabel}</span>
                <span>{t('rallyNumber')}: {currentRallyLabel}</span>
                <span>{t('servingTeam')}: {servingTeamLabel}</span>
              </div>
            </div>

            <div className="scouting-screen__team scouting-screen__team--home">
              <span className="scouting-screen__team-role">{t('home')}</span>
              <strong className="scouting-screen__team-name">{homeTeamName}</strong>
            </div>
          </div>
        </section>

        <section className="scouting-screen__stage-shell">
          {activeStage === 'pre_match_config' && (
            <PreMatchConfigStage
              initialConfig={scoutingConfig}
              onSave={handleSaveConfig}
            />
          )}

          {activeStage === 'set_setup' && (
            <SetSetupStage
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              setNumber={currentSetNumber}
              onSetStarted={handleSetStarted}
            />
          )}

          {activeStage === 'live_rally' && (
            <LiveRallyStage
              awayTeam={awayTeam}
              homeTeam={homeTeam}
              awayLineup={liveMatch?.awayActiveLineup ?? null}
              homeLineup={liveMatch?.homeActiveLineup ?? null}
              selectedZone={selectedZone}
              onSelectedZoneChange={setSelectedZone}
              onRallyEnd={() => undefined}
              onEndSet={handleEndSet}
            />
          )}

          {activeStage === 'set_end' && stageSummary.latestCompletedSet && setQuickStats && (
            <SetEndStage
              latestCompletedSet={stageSummary.latestCompletedSet}
              quickStats={setQuickStats}
              onStartNextSet={handleStartNextSet}
              onFinishMatch={() => void handleFinishMatch()}
            />
          )}

          {activeStage === 'match_end' && (
            <MatchEndStage
              awayTeamName={awayTeamName}
              homeTeamName={homeTeamName}
              setsWon={stageSummary.setsWon}
              onOpenAnalysis={handleOpenAnalysis}
            />
          )}
        </section>
      </div>
    </main>
  );
}
