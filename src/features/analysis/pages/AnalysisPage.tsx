import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import type { MatchProject } from '@src/domain/match/types';
import { matchRepository } from '@src/infrastructure/repositories';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { MatchReportTable } from '@src/features/scouting/components/MatchReportTable';
import { TeamPerformanceDashboard } from '@src/features/analytics/dashboard/TeamPerformanceDashboard';
import { PlayerPerformanceDashboard } from '@src/features/analytics/dashboard/PlayerPerformanceDashboard';
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
import { exportMatchAsOvs } from '@src/features/sync/export/export-match';
import { SideOutStudyPanel } from '@src/features/analytics/sideout/SideOutStudyPanel';
import { CrossRotationAnalysisPanel } from '@src/features/analytics/cross-rotation/CrossRotationAnalysisPanel';
import { TrendsPanel } from '@src/features/analytics/trends/TrendsPanel';
import { filterMatchesForTeam } from '@src/features/teams/model/team-match-filter';
import { VideoAnalysisPanel } from '../video/VideoAnalysisPanel';
import '@src/features/scouting/scouting-screen.css';

type StatsView = 'report' | 'team-performance' | 'player-performance' | 'sideout-study' | 'cross-rotation' | 'trends' | 'video-analysis';

export function AnalysisPage() {
  const { t } = useTranslation();
  const matchReportRef = useRef<HTMLElement>(null);
  const activeProject = useAppStore((state) => state.activeProject);
  const [statsView, setStatsView] = useState<StatsView>('report');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [allMatches, setAllMatches] = useState<MatchProject[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const matches = await matchRepository.list();
      if (!cancelled) setAllMatches(matches);
    })();
    return () => { cancelled = true; };
  }, []);

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

  const similarityFocus = useMemo(() => {
    if (!activeProject) return undefined;
    const teamIds = [activeProject.homeSelection.archivedTeamId, activeProject.awaySelection.archivedTeamId]
      .filter((id): id is string => Boolean(id));
    const playerIds = [...(homeTeam?.players ?? []), ...(awayTeam?.players ?? [])].map((p) => p.id);
    return { teamIds, playerIds };
  }, [activeProject, homeTeam, awayTeam]);

  const trendsTeamOptions = useMemo(() => {
    if (!activeProject || !homeTeam || !awayTeam) return [];
    const homeRef = { teamId: activeProject.homeSelection.archivedTeamId, teamName: homeTeam.name };
    const awayRef = { teamId: activeProject.awaySelection.archivedTeamId, teamName: awayTeam.name };
    return [
      {
        key: 'home',
        label: homeTeam.name,
        teamRef: homeRef,
        matches: filterMatchesForTeam(allMatches, homeRef.teamId, homeRef.teamName),
      },
      {
        key: 'away',
        label: awayTeam.name,
        teamRef: awayRef,
        matches: filterMatchesForTeam(allMatches, awayRef.teamId, awayRef.teamName),
      },
    ];
  }, [activeProject, homeTeam, awayTeam, allMatches]);

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

  const handleExportPdf = async () => {
    if (!matchReportRef.current || !homeTeam || !awayTeam || isExportingPdf) {
      return;
    }

    const filename = `${homeTeam.name}-vs-${awayTeam.name}.pdf`;

    setIsExportingPdf(true);
    try {
      await exportMatchReportPdf(matchReportRef.current, filename);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportDataVolley = () => {
    if (!activeProject) {
      return;
    }

    const result = exportMatchToDataVolley(activeProject);
    void downloadDataVolleyFile(result.fileName, result.text);

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

  const handleExportOvs = async () => {
    if (!activeProject) {
      return;
    }

    try {
      await exportMatchAsOvs(activeProject);
    } catch (error) {
      console.error('Error exporting .ovs file:', error);
      window.alert(t('ovsExportFailed'));
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
                  onClick={() => void handleExportPdf()}
                  disabled={isExportingPdf}
                  title={isExportingPdf ? t('exportPdfGenerating') : t('exportPdf')}
                  aria-label={isExportingPdf ? t('exportPdfGenerating') : t('exportPdf')}
                  aria-busy={isExportingPdf}
                >
                  {isExportingPdf ? (
                    <svg className="icon-button__spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 3a9 9 0 1 1-9 9" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
                      <polyline points="14.5 2 14.5 7.5 20 7.5" />
                      <text x="12" y="17" fontSize="5" fontWeight="700" letterSpacing="-0.3" textAnchor="middle" stroke="none" fill="currentColor">PDF</text>
                    </svg>
                  )}
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
                    <polyline points="16 11 12 15 8 11" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn-secondary icon-button"
                  onClick={handleExportOvs}
                  title={t('exportOvsHelp')}
                  aria-label={t('exportOvs')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8v13H3V8" />
                    <path d="M1 3h22v5H1z" />
                    <path d="M10 12h4" />
                  </svg>
                </button>
              </div>

              <div className="stats-view-tabs analysis-page__stats-tabs" role="tablist" aria-label={t('matchStatistics')}>
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
                  aria-selected={statsView === 'team-performance'}
                  className={`stats-view-tabs__tab${statsView === 'team-performance' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('team-performance')}
                >
                  {t('performanceTeams')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsView === 'player-performance'}
                  className={`stats-view-tabs__tab${statsView === 'player-performance' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('player-performance')}
                >
                  {t('performancePlayer')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsView === 'sideout-study'}
                  className={`stats-view-tabs__tab${statsView === 'sideout-study' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('sideout-study')}
                >
                  {t('sideOutStudy')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsView === 'cross-rotation'}
                  className={`stats-view-tabs__tab${statsView === 'cross-rotation' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('cross-rotation')}
                >
                  {t('crossRotationAnalysis')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsView === 'trends'}
                  className={`stats-view-tabs__tab${statsView === 'trends' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('trends')}
                >
                  {t('trendsTitle')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsView === 'video-analysis'}
                  className={`stats-view-tabs__tab${statsView === 'video-analysis' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('video-analysis')}
                >
                  {t('videoAnalysis')}
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
              ) : statsView === 'team-performance' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <TeamPerformanceDashboard stats={matchStats} />
                </div>
              ) : statsView === 'player-performance' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <PlayerPerformanceDashboard stats={matchStats} />
                </div>
              ) : statsView === 'sideout-study' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <SideOutStudyPanel stats={matchStats} />
                </div>
              ) : statsView === 'cross-rotation' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <CrossRotationAnalysisPanel stats={matchStats} />
                </div>
              ) : statsView === 'trends' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <TrendsPanel similarityFocus={similarityFocus} teamOptions={trendsTeamOptions} />
                </div>
              ) : statsView === 'video-analysis' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <VideoAnalysisPanel project={activeProject} />
                </div>
              ) : null}
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
