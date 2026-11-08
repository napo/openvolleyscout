import { SelectableTable } from '@src/components/SelectableTable';
import { TeamPlayByPlayPanel } from './TeamPlayByPlayPanel';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { matchRepository } from '@src/infrastructure/repositories';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { TeamPerformanceDashboard } from '@src/features/analytics/dashboard/TeamPerformanceDashboard';
import { PlayerPerformanceDashboard } from '@src/features/analytics/dashboard/PlayerPerformanceDashboard';
import { SideOutStudyPanel } from '@src/features/analytics/sideout/SideOutStudyPanel';
import { MultiVideoAnalysisPanel } from '@src/features/analysis/video/MultiVideoAnalysisPanel';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { buildAggregatedTeamMatchStats, type MatchEntry } from '../model/aggregated-stats';
import { getFocusTeamSide, filterMatchesForTeam } from '../model/team-match-filter';
import { TrendsPanel } from '@src/features/analytics/trends/TrendsPanel';
import { useIsAnyTrendsFeatureEnabled } from '@src/app/store/experimental-features-store';
import '@src/features/scouting/scouting-screen.css';
import './team-analysis-page.css';
import { formatDisplayDate } from '@src/lib/utils/local-date';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';

type AnalysisTab = 'play-by-play' | 'team-performance' | 'player-performance' | 'sideout-study' | 'trends' | 'video-analysis';

interface TeamNavState {
  teamId?: string;
  teamName?: string;
}

export function TeamAnalysisPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { teamId, teamName } = (location.state ?? {}) as TeamNavState;

  const trendsEnabled = useIsAnyTrendsFeatureEnabled();
  const [phase, setPhase] = useState<'select' | 'analyze'>('select');
  const [allMatches, setAllMatches] = useState<MatchProject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('team-performance');

  useEffect(() => {
    if (!trendsEnabled && activeTab === 'trends') {
      setActiveTab('team-performance');
    }
  }, [trendsEnabled, activeTab]);
  const [selectedMatches, setSelectedMatches] = useState<MatchProject[]>([]);
  const [aggregatedStats, setAggregatedStats] = useState<MatchStats | null>(null);

  useEffect(() => {
    if (!teamId && !teamName) {
      navigate('/teams');
      return;
    }
    void (async () => {
      try {
        const all = await matchRepository.list();
        const filtered = filterMatchesForTeam(all, teamId, teamName);
        filtered.sort((a, b) => {
          const da = a.metadata.playedAt ?? '';
          const db = b.metadata.playedAt ?? '';
          return db.localeCompare(da);
        });
        setAllMatches(filtered);
        // Matches without any played set would only dilute the figures: not preselected.
        setSelectedIds(new Set(filtered
          .filter((p) => formatProjectMatchResult(p, { goldenSetLabel: '' }).hasResult)
          .map((p) => p.metadata.id)));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [teamId, teamName, navigate]);


  const handleAnalyze = () => {
    const selected = allMatches.filter((p) => selectedIds.has(p.metadata.id));
    if (selected.length === 0) return;

    const entries: MatchEntry[] = selected.map((project) => {
      const stats = buildProjectMatchStats(project);
      return { stats, focusTeamSide: getFocusTeamSide(project, teamId, teamName) };
    });

    const opponentLabel = t('allOpponents', { defaultValue: 'All opponents' });
    const agg = buildAggregatedTeamMatchStats(entries, teamName ?? '?', opponentLabel);
    setAggregatedStats(agg);
    setSelectedMatches(selected);
    setActiveTab('team-performance');
    setPhase('analyze');
  };

  const handleBack = () => {
    setPhase('select');
    setAggregatedStats(null);
  };

  const matchCount = selectedIds.size;

  // ── Phase: select ──────────────────────────────────────────

  const matchSelectionPhase = (
    <AppPageLayout
      className="app-page-card team-analysis-page__layout"
      headerClassName="app-page-card__header"
      contentClassName="app-page-card__content"
      header={(
        <div className="app-page-card__header-copy">
          <h1 className="app-page-card__title">
            {t('teamDataStudy', { defaultValue: 'Team data study' })}
            {teamName ? `: ${teamName}` : ''}
          </h1>
          <p className="app-page-card__description">
            {t('selectMatchesForAnalysis', { defaultValue: 'Select matches to analyse' })}
          </p>
        </div>
      )}
    >
      {isLoading ? (
        <p className="load-data-page__loading">{t('loading')}</p>
      ) : allMatches.length === 0 ? (
        <div className="team-analysis-match-list__empty">
          {t('noMatchesForTeam', { defaultValue: 'No matches found for this team.' })}
        </div>
      ) : (
        <div className="team-analysis-match-list">
          <SelectableTable
            label={t('matchesAvailable', { defaultValue: 'matches' })}
            items={allMatches}
            getId={(project) => project.metadata.id}
            selectedIds={selectedIds}
            onChange={(ids) => setSelectedIds(new Set(ids))}
            emptyText={t('analyseSelectAtLeastOne', { defaultValue: 'Select at least one match' })}
            columns={[
              { key: 'opponent', label: t('tableColumnOpponent'), text: (project) => {
                const focusSide = getFocusTeamSide(project, teamId, teamName);
                return `${t('vs')} ${focusSide === 'home' ? project.awayTeam.name : project.homeTeam.name}`;
              } },
              { key: 'date', label: t('pickerColumnDate'), text: (project) => formatDisplayDate(project.metadata.playedAt) || '–' },
              { key: 'competition', label: t('competition'), text: (project) => [project.metadata.competition, project.metadata.season].filter(Boolean).join(' · ') || '–' },
              { key: 'side', label: t('tableColumnSide'), text: (project) => (getFocusTeamSide(project, teamId, teamName) === 'home'
                ? t('homeTeam', { defaultValue: 'Home' }) : t('awayTeam', { defaultValue: 'Away' })) },
              { key: 'result', label: t('pickerColumnResult'), text: (project) => formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet').toLowerCase() }).text || '–' },
              { key: 'video', label: t('videoAnalysis'), text: (project) => (project.videoAnalysis?.source ? t('pickerVideoLinked') : t('pickerVideoNone')) },
            ]}
          />

          <div className="team-analysis-match-list__footer">
            <button
              type="button"
              className="btn-primary"
              disabled={matchCount === 0}
              onClick={handleAnalyze}
            >
              {matchCount > 0
                ? t('analyzeSelectedMatches', { count: matchCount, defaultValue: `Analyse selected matches: ${matchCount}` })
                : t('analyseSelectAtLeastOne', { defaultValue: 'Select at least one match' })}
            </button>
          </div>
        </div>
      )}
    </AppPageLayout>
  );

  // ── Phase: analyze ─────────────────────────────────────────

  const similarityFocus = useMemo(() => {
    if (!aggregatedStats) return undefined;
    const teamIds = teamId ? [teamId] : [];
    const playerIds = aggregatedStats.playerStats
      .filter((p) => p.teamSide === 'home')
      .map((p) => p.playerId);
    return { teamIds, playerIds };
  }, [aggregatedStats, teamId]);

  const analysisPhase = aggregatedStats ? (
    <AppPageLayout
      className="app-page-card team-analysis-page__layout"
      headerClassName="app-page-card__header"
      contentClassName="app-page-card__content analysis-page__content"
      header={(
        <div className="team-analysis-header">
          <button
            type="button"
            className="team-analysis-header__back-btn"
            onClick={handleBack}
          >
            ← {t('changeMatchSelection', { defaultValue: 'Change selection' })}
          </button>
          <div className="team-analysis-header__info">
            <div className="team-analysis-header__title">
              {teamName ?? t('teamDataStudy', { defaultValue: 'Team data study' })}
            </div>
            <div className="team-analysis-header__subtitle">
              {selectedMatches.length} {t('matchesSelected', { defaultValue: 'matches selected' })}
            </div>
          </div>
        </div>
      )}
    >
      <div className="stats-view-tabs analysis-page__stats-tabs" role="tablist">
        {(
          [
            ['team-performance', t('performanceTeams')],
            ['play-by-play', t('pbpTitle')],
            ['player-performance', t('performancePlayer')],
            ['sideout-study', t('sideOutStudy')],
            ...(trendsEnabled ? [['trends', t('trendsTitle')] as [AnalysisTab, string]] : []),
            ['video-analysis', t('videoAnalysis')],
          ] as [AnalysisTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`stats-view-tabs__tab${activeTab === tab ? ' stats-view-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'play-by-play' ? (
        <div className="stats-view-tabs__panel analysis-page__report-panel" role="tabpanel">
          <TeamPlayByPlayPanel projects={selectedMatches} focusTeamId={teamId} focusTeamName={teamName} />
        </div>
      ) : activeTab === 'team-performance' ? (
        <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
          <TeamPerformanceDashboard stats={aggregatedStats} lockedTeam="home" />
        </div>
      ) : activeTab === 'player-performance' ? (
        <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
          <PlayerPerformanceDashboard stats={aggregatedStats} lockedTeam="home" />
        </div>
      ) : activeTab === 'sideout-study' ? (
        <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
          <SideOutStudyPanel stats={aggregatedStats} lockedTeam="home" />
        </div>
      ) : activeTab === 'trends' && trendsEnabled ? (
        <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
          <TrendsPanel
            similarityFocus={similarityFocus}
            teamOptions={[
              {
                key: teamId ?? teamName ?? 'focus',
                label: teamName ?? t('teamDataStudy', { defaultValue: 'Team data study' }),
                teamRef: { teamId, teamName },
                matches: selectedMatches,
              },
            ]}
          />
        </div>
      ) : activeTab === 'video-analysis' ? (
        <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
          <MultiVideoAnalysisPanel
            projects={selectedMatches}
            focusTeamId={teamId}
            focusTeamName={teamName}
          />
        </div>
      ) : null}
    </AppPageLayout>
  ) : null;

  return (
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--wide">
        {phase === 'select' ? matchSelectionPhase : analysisPhase}
      </div>
    </main>
  );
}
