import { StatsCaptureContext } from '@src/features/analytics/export/stats-capture-context';
import { Link, useLocation } from 'react-router-dom';
import { EfficiencyNote } from '@src/features/analytics/EfficiencyNote';
import { buildStatsSnapshot } from '@src/features/analytics/export/shared-stats-snapshot';
import { buildSharedTrendsSnapshot } from '@src/features/analytics/export/shared-trends';
import { SNAPSHOT_TABS } from '@src/features/analytics/export/SharedStatsPanel';
import { useFilterStore } from '@src/features/analytics/stores/filter-store';
import { TabExportControl } from '@src/features/analytics/export/TabExportControl';
import type { TranslationKey } from '@src/i18n';
import { PlayByPlayPanel, type PlayByPlayShare } from '@src/features/analytics/play-by-play/PlayByPlayPanel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { LoadingProgressBanner, yieldToUi, type LoadProgressState } from '@src/components/LoadingProgressBanner';
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
import { type MatchStats } from '@src/features/scouting/model/match-stats';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { subscribeIndicatorSettings } from '@src/features/scouting/model/indicator-settings';
import {
  buildMatchReportHtml,
  buildMatchTabellinoReport,
  
  openPrintableMatchReportHtml,
  type BuildMatchReportDocumentInput } from '@src/features/scouting/model/match-report';
import { exportMatchReportPdf } from '@src/features/scouting/model/match-report-pdf';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { exportMatchToDataVolley, downloadDataVolleyFile } from '@src/features/export/datavolley';
import { exportMatchAsOvs } from '@src/features/sync/export/export-match';
import { SideOutStudyPanel } from '@src/features/analytics/sideout/SideOutStudyPanel';
import { hasSideOutStudyData } from '@src/features/analytics/sideout/sideout-distribution';
import { CrossRotationAnalysisPanel } from '@src/features/analytics/cross-rotation/CrossRotationAnalysisPanel';
import { ZoneAnalysisPanel } from '@src/features/analytics/zone-analysis/ZoneAnalysisPanel';
import { hasZoneAnalysisData } from '@src/features/analytics/zone-analysis/zone-analysis';
import { getMatchCodeTables } from '@src/domain/match/code-tables';
import { createTouchVideoSecondsResolver } from '../video/video-event-index';
import { TrendsPanel } from '@src/features/analytics/trends/TrendsPanel';
import { useIsAnyTrendsFeatureEnabled } from '@src/app/store/experimental-features-store';
import { filterMatchesForTeam } from '@src/features/teams/model/team-match-filter';
import { VideoAnalysisPanel } from '../video/VideoAnalysisPanel';
import { PointNotesPanel } from '../video/PointNotesPanel';
import '@src/features/scouting/scouting-screen.css';

const statsViewTitles: Record<StatsView, TranslationKey> = {
  'play-by-play': 'pbpTitle', report: 'matchReport', 'team-performance': 'performanceTeams',
  'player-performance': 'performancePlayer', 'sideout-study': 'sideOutStudy',
  'zone-analysis': 'zoneAnalysis', 'cross-rotation': 'crossRotationAnalysis', trends: 'trendsTitle', 'video-analysis': 'videoAnalysis',
  notes: 'pointNoteTab',
};

type StatsView = 'play-by-play' | 'report' | 'team-performance' | 'player-performance' | 'sideout-study' | 'zone-analysis' | 'cross-rotation' | 'trends' | 'video-analysis' | 'notes';

export function AnalysisPage() {
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const trendsEnabled = useIsAnyTrendsFeatureEnabled();
  const hasPointNotes = (activeProject?.videoAnalysis?.notes?.length ?? 0) > 0;
  const location = useLocation();
  // The home page can open a specific view directly (e.g. the video analysis).
  const [statsView, setStatsView] = useState<StatsView>(() => (location.state as { view?: StatsView } | null)?.view ?? 'report');
  const [isExportingTab, setIsExportingTab] = useState(false);
  // A zone analysis attack opened in Video analysis.
  const [videoSeekSeconds, setVideoSeekSeconds] = useState<number | null>(null);
  const zoneVideoSecondsOf = useMemo(() => {
    const analysis = activeProject?.videoAnalysis;
    if (!activeProject || !analysis?.source || statsView !== 'zone-analysis') return undefined;
    return createTouchVideoSecondsResolver(activeProject.events, analysis);
  }, [activeProject, statsView]);
  const exportPanelRef = useRef<HTMLDivElement>(null);
  // The play by play on screen, for its share link.
  const playByPlayShareRef = useRef<PlayByPlayShare | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState<LoadProgressState | null>(null);
  const [computeProgress, setComputeProgress] = useState<LoadProgressState | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [matchReportHtml, setMatchReportHtml] = useState('');
  const [allMatches, setAllMatches] = useState<MatchProject[]>([]);

  useEffect(() => {
    if (!trendsEnabled && statsView === 'trends') {
      setStatsView('report');
    }
    if (!hasPointNotes && statsView === 'notes') {
      setStatsView('report');
    }
  }, [trendsEnabled, hasPointNotes, statsView]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const matches = await matchRepository.list();
      if (!cancelled) setAllMatches(matches);
    })();
    return () => { cancelled = true; };
  }, []);

  const homeTeam = useMemo(
    () => (activeProject ? getMatchTeamSnapshot(activeProject, 'home') : null),
    [activeProject],
  );
  const awayTeam = useMemo(
    () => (activeProject ? getMatchTeamSnapshot(activeProject, 'away') : null),
    [activeProject],
  );
  const completedSets = useMemo(() => (
    activeProject
      ? mergeCompletedSets(
          activeProject.scoutingSession?.completedSets,
          getCompletedSetsFromEvents(activeProject.events),
        )
      : []
  ), [activeProject]);
  const matchResult = activeProject
    ? formatProjectMatchResult(activeProject, { goldenSetLabel: t('goldenSet').toLowerCase() })
    : null;
  const scoutingConfig = useMemo(() => (
    activeProject
      ? activeProject.scoutingConfig ?? createDefaultScoutingMatchConfig(activeProject.metadata.format)
      : null
  ), [activeProject]);

  const [indicatorVersion, setIndicatorVersion] = useState(0);

  useEffect(() => subscribeIndicatorSettings(() => setIndicatorVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!activeProject || !homeTeam || !awayTeam || !scoutingConfig) {
      setMatchStats(null);
      setMatchReportHtml('');
      setComputeProgress(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setComputeProgress({ loaded: 1, total: 3, currentName: t('progressComputingMatchStats') });
      await yieldToUi();
      if (cancelled) return;
      const stats = buildProjectMatchStats(activeProject);
      if (cancelled) return;

      setComputeProgress({ loaded: 2, total: 3, currentName: t('progressGeneratingMatchReport') });
      await yieldToUi();
      if (cancelled) return;
      const html = buildMatchReportHtml({
        homeTeam,
        awayTeam,
        metadata: activeProject.metadata,
        scoutingConfig,
        eventLog: activeProject.events,
        completedSets,
        stats,
        lineupSnapshots: activeProject.scoutingSession?.lineupSnapshots,
        t,
      });
      if (cancelled) return;

      setComputeProgress({ loaded: 3, total: 3, currentName: t('progressPreparingAnalysisViews') });
      await yieldToUi();
      if (cancelled) return;
      setMatchStats(stats);
      setMatchReportHtml(html);
      setComputeProgress(null);
    })();
    return () => { cancelled = true; };
  }, [activeProject, awayTeam, completedSets, homeTeam, indicatorVersion, scoutingConfig, t]);

  const hasSideOutStudy = useMemo(
    () => Boolean(matchStats && hasSideOutStudyData(matchStats)),
    [matchStats],
  );

  useEffect(() => {
    if (statsView === 'sideout-study' && !hasSideOutStudy) {
      setStatsView('report');
    }
  }, [statsView, hasSideOutStudy]);

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

  const handleOpenPrintableMatchReport = () => {
    if (!matchReportHtml) {
      return;
    }

    openPrintableMatchReportHtml(matchReportHtml);
  };


  const handleExportPdf = async () => {
    if (!matchReportInput || isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);
    setExportProgress({ loaded: 1, total: 2, currentName: t('progressExportingFormat', { format: 'PDF' }) });
    await yieldToUi();
    try {
      await exportMatchReportPdf(matchReportInput, t);
      setExportProgress({ loaded: 2, total: 2, currentName: t('progressSavingFile') });
    } catch (error) {
      console.error('Error exporting match report PDF:', error);
      window.alert(t('exportPdfFailed'));
    } finally {
      setIsExportingPdf(false);
      setExportProgress(null);
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
        `[DataVolley export] ${result.fileName} - ${result.diagnostics.length} diagnostic(s): ${errorCount} error(s), ${warningCount} warning(s)`,
        result.diagnostics,
      );
    }
  };

  const handleExportTiebreak = async () => {
    if (!activeProject) {
      return;
    }

    try {
      // Loaded on demand: it brings in SQLite (sql.js) and the file template.
      const { exportMatchToTiebreak, downloadTiebreakFile } = await import('@src/features/export/tiebreak');
      const result = await exportMatchToTiebreak(activeProject);
      await downloadTiebreakFile(result);
      if (result.diagnostics.length > 0) {
        // eslint-disable-next-line no-console
        console.info(`[Tiebreak Tech export] ${result.fileName}`, result.diagnostics);
      }
    } catch (error) {
      console.error('Error exporting Tiebreak Tech file:', error);
      window.alert(t('exportTiebreakFailed'));
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
          {activeProject && computeProgress ? (
            <LoadingProgressBanner progress={computeProgress} />
          ) : activeProject && matchResult && matchStats ? (
            <>
              {exportProgress ? <LoadingProgressBanner progress={exportProgress} marginBottom="0.75rem" /> : null}
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
                {statsView === 'report' ? <>
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
                  <span className="icon-button__label">{t('openPrintableReport')}</span>
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
                  <span className="icon-button__label">{isExportingPdf ? t('exportPdfGenerating') : t('exportPdf')}</span>
                </button>
                </> : null}
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
                  <span className="icon-button__label">{t('exportDataVolley')}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary icon-button"
                  onClick={() => void handleExportTiebreak()}
                  title={t('exportTiebreakHelp')}
                  aria-label={t('exportTiebreak')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
                    <polyline points="14.5 2 14.5 7.5 20 7.5" />
                    <text x="12" y="17" fontSize="6" fontWeight="700" letterSpacing="-0.3" textAnchor="middle" stroke="none" fill="currentColor">TB</text>
                  </svg>
                  <span className="icon-button__label">{t('exportTiebreak')}</span>
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
                  <span className="icon-button__label">{t('exportOvs')}</span>
                </button>
              </div>

              <div className="stats-view-tabs analysis-page__stats-tabs" role="tablist" aria-label={t('matchStatistics')}>
                <button type="button" role="tab" disabled={isExportingTab} aria-selected={statsView === 'play-by-play'} className={`stats-view-tabs__tab${statsView === 'play-by-play' ? ' stats-view-tabs__tab--active' : ''}`} onClick={() => setStatsView('play-by-play')}>{t('pbpTitle')}</button>
                <button
                  type="button"
                  role="tab" disabled={isExportingTab}
                  aria-selected={statsView === 'report'}
                  className={`stats-view-tabs__tab${statsView === 'report' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('report')}
                >
                  {t('matchReport')}
                </button>
                <button
                  type="button"
                  role="tab" disabled={isExportingTab}
                  aria-selected={statsView === 'team-performance'}
                  className={`stats-view-tabs__tab${statsView === 'team-performance' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('team-performance')}
                >
                  {t('performanceTeams')}
                </button>
                <button
                  type="button"
                  role="tab" disabled={isExportingTab}
                  aria-selected={statsView === 'player-performance'}
                  className={`stats-view-tabs__tab${statsView === 'player-performance' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('player-performance')}
                >
                  {t('performancePlayer')}
                </button>
                {hasSideOutStudy ? (
                  <button
                    type="button"
                    role="tab" disabled={isExportingTab}
                    aria-selected={statsView === 'sideout-study'}
                    className={`stats-view-tabs__tab${statsView === 'sideout-study' ? ' stats-view-tabs__tab--active' : ''}`}
                    onClick={() => setStatsView('sideout-study')}
                  >
                    {t('sideOutStudy')}
                  </button>
                ) : null}
                {matchStats && hasZoneAnalysisData(matchStats) ? (
                  <button
                    type="button"
                    role="tab" disabled={isExportingTab}
                    aria-selected={statsView === 'zone-analysis'}
                    className={`stats-view-tabs__tab${statsView === 'zone-analysis' ? ' stats-view-tabs__tab--active' : ''}`}
                    onClick={() => setStatsView('zone-analysis')}
                  >
                    {t('zoneAnalysis')}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="tab" disabled={isExportingTab}
                  aria-selected={statsView === 'cross-rotation'}
                  className={`stats-view-tabs__tab${statsView === 'cross-rotation' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('cross-rotation')}
                >
                  {t('crossRotationAnalysis')}
                </button>
                {trendsEnabled ? (
                  <button
                    type="button"
                    role="tab" disabled={isExportingTab}
                    aria-selected={statsView === 'trends'}
                    className={`stats-view-tabs__tab${statsView === 'trends' ? ' stats-view-tabs__tab--active' : ''}`}
                    onClick={() => setStatsView('trends')}
                  >
                    {t('trendsTitle')}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="tab" disabled={isExportingTab}
                  aria-selected={statsView === 'video-analysis'}
                  className={`stats-view-tabs__tab${statsView === 'video-analysis' ? ' stats-view-tabs__tab--active' : ''}`}
                  onClick={() => setStatsView('video-analysis')}
                  title={activeProject?.videoAnalysis?.source ? t('videoAnalysisLinkedHint') : undefined}
                >
                  {t('videoAnalysis')}
                  {activeProject?.videoAnalysis?.source ? (
                    <span className="stats-view-tabs__badge" aria-label={t('videoAnalysisLinkedHint')}> ●</span>
                  ) : null}
                </button>
                {hasPointNotes ? (
                  <button
                    type="button"
                    role="tab" disabled={isExportingTab}
                    aria-selected={statsView === 'notes'}
                    className={`stats-view-tabs__tab${statsView === 'notes' ? ' stats-view-tabs__tab--active' : ''}`}
                    onClick={() => setStatsView('notes')}
                  >
                    {t('pointNoteTab')}
                  </button>
                ) : null}
              </div>

              {statsView !== 'video-analysis' ? <TabExportControl
                panelRef={exportPanelRef}
                tabId={statsView}
                title={t(statsViewTitles[statsView])}
                matchLabel={`${homeTeam?.name ?? ''} - ${awayTeam?.name ?? ''}`}
                onBusyChange={setIsExportingTab}
                buildSnapshot={matchStats && SNAPSHOT_TABS.includes(statsView) && (statsView !== 'report' || matchReportInput) ? () => {
                  const { filters, selectedPlayerIds } = useFilterStore.getState();
                  if (statsView === 'trends') {
                    const trends = buildSharedTrendsSnapshot(trendsTeamOptions);
                    if (!trends) throw new Error('No team for the Trends tab');
                    return { trends, filters, selectedPlayerIds: [] };
                  }
                  if (statsView === 'play-by-play') {
                    if (!playByPlayShareRef.current) throw new Error('No play by play on screen');
                    return { playByPlay: playByPlayShareRef.current, filters, selectedPlayerIds: [] };
                  }
                  if (statsView === 'report' && matchReportInput) {
                    // The scoresheet only: no rallies, no events.
                    return { report: buildMatchTabellinoReport(matchReportInput), filters, selectedPlayerIds: [] };
                  }
                  return buildStatsSnapshot(matchStats, { filters, selectedPlayerIds, scopeToPlayers: statsView === 'player-performance' });
                } : undefined}
                onExportPdf={statsView === 'report' && matchReportInput ? handleExportPdf : undefined}
              /> : null}
              <StatsCaptureContext.Provider value={isExportingTab}><div ref={exportPanelRef}>
              {statsView === 'play-by-play' ? (
                <div className="stats-view-tabs__panel analysis-page__report-panel" role="tabpanel">
                  {homeTeam && awayTeam && matchStats ? <PlayByPlayPanel key={activeProject.metadata.id} homeTeam={homeTeam} awayTeam={awayTeam} stats={matchStats} eventLog={activeProject.events} metadata={activeProject.metadata} shareRef={playByPlayShareRef} /> : null}
                </div>
              ) : statsView === 'report' ? (
                <div
                  className="stats-view-tabs__panel analysis-page__report-panel"
                  role="tabpanel"
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
              ) : statsView === 'zone-analysis' && matchStats ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <ZoneAnalysisPanel
                    stats={matchStats}
                    codeTables={getMatchCodeTables(activeProject)}
                    videoSecondsOf={zoneVideoSecondsOf}
                    onPlayVideo={(seconds) => {
                      setVideoSeekSeconds(Math.max(0, seconds - (activeProject.videoAnalysis?.paddingBeforeSeconds ?? 0)));
                      setStatsView('video-analysis');
                    }}
                  />
                </div>
              ) : statsView === 'cross-rotation' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <CrossRotationAnalysisPanel stats={matchStats} />
                </div>
              ) : statsView === 'trends' && trendsEnabled ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <TrendsPanel similarityFocus={similarityFocus} teamOptions={trendsTeamOptions} />
                </div>
              ) : statsView === 'video-analysis' ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <VideoAnalysisPanel project={activeProject} initialSeekSeconds={videoSeekSeconds} onInitialSeekHandled={() => setVideoSeekSeconds(null)} />
                </div>
              ) : statsView === 'notes' && hasPointNotes ? (
                <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
                  <PointNotesPanel project={activeProject} />
                </div>
              ) : null}
              {['report', 'team-performance', 'player-performance', 'trends'].includes(statsView) ? <EfficiencyNote /> : null}
              </div></StatsCaptureContext.Provider>
            </>
          ) : (
            <div className="analysis-page__placeholder">
              <p className="analysis-page__placeholder-copy">{t('noActiveProject')}</p>
              {/* Statistics open from a match: send the user where matches are listed. */}
              <p className="analysis-page__placeholder-copy">{t('analysisPickMatchHint')}</p>
              <Link to="/load-data" className="btn-primary">{t('loadData')}</Link>
            </div>
          )}
        </AppPageLayout>
      </div>
    </main>
  );
}
