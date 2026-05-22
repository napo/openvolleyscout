import { useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { MatchReportTable } from '@src/features/scouting/components/MatchReportTable';
import { SkillEvaluationDashboard } from '@src/features/scouting/components/SkillEvaluationDashboard';
import { buildMatchStats } from '@src/features/scouting/model/match-stats';
import {
  buildMatchReportHtml,
  createMatchReportFilename,
  downloadMatchReportHtml,
} from '@src/features/scouting/model/match-report';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import '@src/features/scouting/scouting-screen.css';

export function AnalysisPage() {
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);

  const homeTeam = activeProject ? getMatchTeamSnapshot(activeProject, 'home') : null;
  const awayTeam = activeProject ? getMatchTeamSnapshot(activeProject, 'away') : null;
  const completedSets = activeProject
    ? mergeCompletedSets(
        activeProject.scoutingSession?.completedSets,
        getCompletedSetsFromEvents(activeProject.events),
      )
    : [];
  const matchResult = activeProject
    ? formatProjectMatchResult(activeProject, { goldenSetLabel: t('goldenSet').toLowerCase() })
    : null;
  const scoutingConfig = activeProject
    ? activeProject.scoutingConfig ?? createDefaultScoutingMatchConfig(activeProject.metadata.format)
    : null;

  const matchStats = useMemo(() => (
    activeProject && homeTeam && awayTeam
      ? buildMatchStats({
        homeTeam,
        awayTeam,
        eventLog: activeProject.events,
        completedSets,
        currentRallyTouches: activeProject.scoutingSession?.currentRallyTouches ?? [],
      })
      : null
  ), [activeProject, awayTeam, completedSets, homeTeam]);

  const matchReportHtml = useMemo(() => {
    if (!activeProject || !homeTeam || !awayTeam || !matchStats || !scoutingConfig) {
      return '';
    }

    return buildMatchReportHtml({
      homeTeam,
      awayTeam,
      metadata: activeProject.metadata,
      scoutingConfig,
      eventLog: activeProject.events,
      completedSets,
      stats: matchStats,
    });
  }, [activeProject, awayTeam, completedSets, homeTeam, matchStats, scoutingConfig]);

  const handleDownloadMatchReportHtml = () => {
    if (!matchReportHtml || !homeTeam || !awayTeam || !activeProject) {
      return;
    }

    downloadMatchReportHtml(
      matchReportHtml,
      createMatchReportFilename(homeTeam.name, awayTeam.name, activeProject.metadata.playedAt),
    );
  };

  return (
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card analysis-page__layout"
          headerClassName="app-page-card__header"
          contentClassName="app-page-card__content analysis-page__content"
          header={(
            <div className="app-page-card__header-copy">
              <h1 className="app-page-card__title">{t('matchStatistics')}</h1>
              <p className="app-page-card__description">{activeProject ? t('analysisDescription') : t('noActiveProject')}</p>
            </div>
          )}
        >
          {activeProject && matchResult && matchStats ? (
            <>
              <div className="analysis-page__summary">
                <span className="load-data-card__result-label">
                  {matchResult.hasResult ? t('finalResult') : t('currentResult')}
                </span>
                {matchResult.hasResult ? (
                  <MatchResultDisplay
                    result={matchResult}
                    goldenSetLabel={t('goldenSet').toLowerCase()}
                  />
                ) : (
                  <span>{t('matchNotStarted')}</span>
                )}
              </div>
              <div className="analysis-page__actions">
                <button type="button" className="btn-secondary" onClick={handleDownloadMatchReportHtml}>
                  {t('downloadHtml')}
                </button>
              </div>
              {homeTeam && awayTeam && scoutingConfig ? (
                <div className="analysis-page__report-panel">
                  <MatchReportTable
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    metadata={activeProject.metadata}
                    scoutingConfig={scoutingConfig}
                    eventLog={activeProject.events}
                    completedSets={completedSets}
                    stats={matchStats}
                  />
                </div>
              ) : null}
              <SkillEvaluationDashboard stats={matchStats} />
            </>
          ) : (
            <div className="analysis-page__placeholder">
              <p className="analysis-page__placeholder-copy">{t('noActiveProject')}</p>
            </div>
          )}
        </AppPageLayout>
      </div>
    </main>
  );
}
