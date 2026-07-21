import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import type { MatchProject } from '@src/domain/match/types';
import { matchRepository } from '@src/infrastructure/repositories';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { buildMatchStats } from '@src/features/scouting/model/match-stats';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { TeamPerformanceDashboard } from '@src/features/analytics/dashboard/TeamPerformanceDashboard';
import { PlayerPerformanceDashboard } from '@src/features/analytics/dashboard/PlayerPerformanceDashboard';
import { SideOutStudyPanel } from '@src/features/analytics/sideout/SideOutStudyPanel';
import { MultiVideoAnalysisPanel } from '@src/features/analysis/video/MultiVideoAnalysisPanel';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { buildAggregatedTeamMatchStats, type MatchEntry } from '../model/aggregated-stats';
import { getFocusTeamSide, filterMatchesForTeam } from '../model/team-match-filter';
import { TrendsPanel } from '@src/features/analytics/trends/TrendsPanel';
import '@src/features/scouting/scouting-screen.css';
import './team-analysis-page.css';

type AnalysisTab = 'team-performance' | 'player-performance' | 'sideout-study' | 'trends' | 'video-analysis';

interface TeamNavState {
  teamId?: string;
  teamName?: string;
}

function formatMatchLabel(project: MatchProject): string {
  const date = project.metadata.playedAt?.slice(0, 10) ?? '';
  const competition = project.metadata.competition ?? '';
  return [date, competition].filter(Boolean).join(' · ');
}

export function TeamAnalysisPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { teamId, teamName } = (location.state ?? {}) as TeamNavState;

  const [phase, setPhase] = useState<'select' | 'analyze'>('select');
  const [allMatches, setAllMatches] = useState<MatchProject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('team-performance');
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
        setSelectedIds(new Set(filtered.map((p) => p.metadata.id)));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [teamId, teamName, navigate]);

  const toggleMatch = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(allMatches.map((p) => p.metadata.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleAnalyze = () => {
    const selected = allMatches.filter((p) => selectedIds.has(p.metadata.id));
    if (selected.length === 0) return;

    const entries: MatchEntry[] = selected.map((project) => {
      const homeTeam = getMatchTeamSnapshot(project, 'home');
      const awayTeam = getMatchTeamSnapshot(project, 'away');
      const completedSets = mergeCompletedSets(
        project.scoutingSession?.completedSets,
        getCompletedSetsFromEvents(project.events),
      );
      const stats = buildMatchStats({
        homeTeam,
        awayTeam,
        eventLog: project.events,
        completedSets,
        currentRallyTouches: project.scoutingSession?.currentRallyTouches ?? [],
      });
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
          <div className="team-analysis-match-list__controls">
            <label className="team-analysis-match-list__select-all">
              <input
                type="checkbox"
                checked={matchCount === allMatches.length && allMatches.length > 0}
                ref={(el) => {
                  if (el) el.indeterminate = matchCount > 0 && matchCount < allMatches.length;
                }}
                onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
              />
              <span>{t('selectAll', { defaultValue: 'Select all' })}</span>
            </label>
            <span className="team-analysis-match-list__count">
              {matchCount > 0 && matchCount < allMatches.length
                ? `${matchCount} / ${allMatches.length} ${t('matchesAvailable', { defaultValue: 'matches' })}`
                : `${allMatches.length} ${t('matchesAvailable', { defaultValue: 'matches' })}`}
            </span>
          </div>

          {allMatches.map((project) => {
            const focusSide = getFocusTeamSide(project, teamId, teamName);
            const oppTeam = focusSide === 'home' ? project.awayTeam.name : project.homeTeam.name;
            const result = formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet').toLowerCase() });
            const isSelected = selectedIds.has(project.metadata.id);
            return (
              <button
                key={project.metadata.id}
                type="button"
                className={`team-analysis-match-item${isSelected ? ' is-selected' : ''}`}
                onClick={() => toggleMatch(project.metadata.id)}
              >
                <div className="team-analysis-match-item__check">
                  {isSelected ? '✓' : ''}
                </div>
                <div className="team-analysis-match-item__body">
                  <div className="team-analysis-match-item__title">
                    {t('vs')} {oppTeam}
                  </div>
                  <div className="team-analysis-match-item__meta">
                    {formatMatchLabel(project)}
                    {project.metadata.venue ? ` · ${project.metadata.venue}` : ''}
                  </div>
                </div>
                <span className={`team-analysis-match-item__side-badge team-analysis-match-item__side-badge--${focusSide}`}>
                  {focusSide === 'home'
                    ? t('homeTeam', { defaultValue: 'Home' })
                    : t('awayTeam', { defaultValue: 'Away' })}
                </span>
                <span className={`team-analysis-match-item__video-badge${project.videoAnalysis?.source ? ' has-video' : ''}`}>
                  {project.videoAnalysis?.source
                    ? t('videoPresent')
                    : t('videoMissing')}
                </span>
                {result.hasResult ? (
                  <div className="team-analysis-match-item__result">
                    <MatchResultDisplay
                      result={result}
                      goldenSetLabel={t('goldenSet').toLowerCase()}
                    />
                  </div>
                ) : null}
              </button>
            );
          })}

          <div className="team-analysis-match-list__footer">
            <button
              type="button"
              className="btn-primary"
              disabled={matchCount === 0}
              onClick={handleAnalyze}
            >
              {matchCount > 0
                ? t('analyzeSelectedMatches', { count: matchCount, defaultValue: `Analyse ${matchCount} match(es)` })
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
            ['player-performance', t('performancePlayer')],
            ['sideout-study', t('sideOutStudy')],
            ['trends', t('trendsTitle')],
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

      {activeTab === 'team-performance' ? (
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
      ) : activeTab === 'trends' ? (
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
