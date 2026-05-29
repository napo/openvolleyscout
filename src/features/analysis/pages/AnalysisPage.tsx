import { useMemo, useState, useRef } from 'react';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { MatchReportTable } from '@src/features/scouting/components/MatchReportTable';
import { PerformanceDashboard } from '@src/features/analytics/dashboard';
import { buildMatchStats } from '@src/features/scouting/model/match-stats';
import {
  buildMatchReportHtml,
  downloadMatchReportPng,
  openPrintableMatchReportHtml,
  exportMatchReportPdf,
  type BuildMatchReportDocumentInput,
} from '@src/features/scouting/model/match-report';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { exportMatchToDataVolley, downloadDataVolleyFile } from '@src/features/export/datavolley';
import '@src/features/scouting/scouting-screen.css';

type StatsView = 'report' | 'charts';

export function AnalysisPage() {
  const { t } = useTranslation();
  const matchReportRef = useRef<HTMLElement>(null);
  const activeProject = useAppStore((state) => state.activeProject);
  const [statsView, setStatsView] = useState<StatsView>('report');

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

  const matchReportInput = useMemo<BuildMatchReportDocumentInput | null>(() => {
    if (!activeProject || !homeTeam || !awayTeam || !matchStats || !scoutingConfig) {
      return null;
    }

    return {
      homeTeam,
      awayTeam,
      metadata: activeProject.metadata,
      scoutingConfig,
      eventLog: activeProject.events,
      completedSets,
      stats: matchStats,
      lineupSnapshots: activeProject.scoutingSession?.lineupSnapshots,
    };
  }, [activeProject, awayTeam, completedSets, homeTeam, matchStats, scoutingConfig]);

  const matchReportHtml = useMemo(() => (
    matchReportInput ? buildMatchReportHtml(matchReportInput) : ''
  ), [matchReportInput]);

  const handleOpenPrintableMatchReport = () => {
    if (!matchReportHtml) {
      return;
    }

    openPrintableMatchReportHtml(matchReportHtml);
  };

  const handleDownloadMatchReportPng = () => {
    if (!matchReportInput) {
      return;
    }

    void downloadMatchReportPng(matchReportInput);
  };

  const handleExportPdf = () => {
    if (!matchReportRef.current || !homeTeam || !awayTeam) {
      return;
    }

    const filename = `${homeTeam.name}-vs-${awayTeam.name}.pdf`;

    void exportMatchReportPdf(matchReportRef.current, filename);
  };

  const handleExportDataVolley = () => {
    if (!activeProject) {
      return;
    }

    const result = exportMatchToDataVolley(activeProject);
    downloadDataVolleyFile(result.fileName, result.text);

    const errorCount = result.diagnostics.filter((d) => d.severity === 'error').length;
    const warningCount = result.diagnostics.filter((d) => d.severity === 'warning').length;
    if (errorCount > 0 || warningCount > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `[DataVolley export] ${result.fileName} — ${result.diagnostics.length} diagnostic(s): ${errorCount} error(s), ${warningCount} warning(s)`,
        result.diagnostics,
      );
    }
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
                <button
                  type="button"
                  className="btn-secondary icon-button"
                  onClick={handleOpenPrintableMatchReport}
                  title={t('openPrintableReport')}
                  aria-label={t('openPrintableReport')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h14c1 0 2 1 2 2v10" />
                    <polyline points="16 5 16 1 8 1 8 5" />
                    <rect x="2" y="12" width="20" height="8" />
                    <path d="M22 17H2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn-secondary icon-button"
                  onClick={handleExportPdf}
                  title={t('exportPdf')}
                  aria-label={t('exportPdf')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6-6 6 6" />
                    <path d="M12 3v11" />
                    <path d="M19 21H5a2 2 0 0 1-2-2V9" />
                    <path d="M7 13h10" />
                    <path d="M7 17h4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn-secondary icon-button"
                  onClick={handleExportDataVolley}
                  title={t('exportDataVolleyHelp')}
                  aria-label={t('exportDataVolley')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </button>
              </div>

              <div className="stats-view-tabs analysis-page__stats-tabs" role="tablist" aria-label={t('matchReport')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsView === 'report'}
                  className={`stats-view-tabs__tab${statsView === 'report' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('report')}
                >
                  {t('matchReport')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsView === 'charts'}
                  className={`stats-view-tabs__tab${statsView === 'charts' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('charts')}
                >
                  {t('performanceCharts')}
                </button>
              </div>

              {statsView === 'report' ? (
                <div
                  className="stats-view-tabs__panel analysis-page__report-panel"
                  role="tabpanel"
                  ref={matchReportRef as React.Ref<HTMLDivElement>}
                >
                  {homeTeam && awayTeam && scoutingConfig ? (
                    <MatchReportTable
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      metadata={activeProject.metadata}
                      scoutingConfig={scoutingConfig}
                      eventLog={activeProject.events}
                      completedSets={completedSets}
                      stats={matchStats}
                      lineupSnapshots={activeProject.scoutingSession?.lineupSnapshots}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <PerformanceDashboard stats={matchStats} />
                </div>
              )}
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
