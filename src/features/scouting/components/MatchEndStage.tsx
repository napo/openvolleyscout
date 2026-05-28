import { useState } from 'react';
import type { CompletedSetDisplaySummary, FormattedMatchResult, MatchStats } from '../model';
import type { Team } from '@src/domain/roster/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { SetLineupSnapshot } from '@src/domain/lineup';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import { useTranslation } from '@src/i18n';
import { PerformanceDashboard } from '@src/features/analytics/dashboard';
import { MatchResultDisplay } from './MatchResultDisplay';
import { MatchReportTable } from './MatchReportTable';
import { ScoutingStageFrame } from './ScoutingStageFrame';

type StatsView = 'report' | 'charts';

interface MatchEndStageProps {
  awayTeam: Team;
  homeTeam: Team;
  awayTeamName: string;
  homeTeamName: string;
  winnerTeamName: string;
  setsWon: {
    home: number;
    away: number;
  };
  completedSets: CompletedSetDisplaySummary[];
  matchStats: MatchStats;
  matchResult: FormattedMatchResult;
  metadata?: MatchMetadata | null;
  scoutingConfig: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  rawCompletedSets: CompletedSetSummary[];
  lineupSnapshots?: readonly SetLineupSnapshot[];
  onOpenAnalysis: () => Promise<void>;
  onBackToMatchSetup: () => void;
}

export function MatchEndStage({
  awayTeam,
  homeTeam,
  awayTeamName,
  homeTeamName,
  winnerTeamName,
  setsWon,
  completedSets,
  matchStats,
  matchResult,
  metadata,
  scoutingConfig,
  eventLog,
  rawCompletedSets,
  lineupSnapshots,
  onOpenAnalysis,
  onBackToMatchSetup,
}: MatchEndStageProps) {
  const { t } = useTranslation();
  const [statsView, setStatsView] = useState<StatsView>('report');

  return (
    <ScoutingStageFrame
      stage="match_end"
      eyebrow={t('matchEndEyebrow')}
      title={t('matchEndTitle')}
      description={t('matchEndDescription')}
      footer={(
        <div className="scouting-stage__actions">
          <button type="button" className="btn-primary" onClick={() => void onOpenAnalysis()}>
            {t('openAnalysis')}
          </button>
          <button type="button" className="btn-secondary" onClick={onBackToMatchSetup}>
            {t('backToMatchSetup')}
          </button>
        </div>
      )}
    >
      <div className="match-end-stage">
        <section className="scouting-stage-panel match-end-stage__result">
          <span className="scouting-stage__score-label">{t('matchWinner')}</span>
          <h3 className="match-end-stage__winner">{winnerTeamName}</h3>

          <div className="match-end-stage__teams">
            <div className="match-end-stage__team">
              <strong>{homeTeamName}</strong>
            </div>
            <div className="match-end-stage__score">
              <span>{setsWon.home}</span>
              <span className="scouting-stage__score-divider">:</span>
              <span>{setsWon.away}</span>
            </div>
            <div className="match-end-stage__team">
              <strong>{awayTeamName}</strong>
            </div>
          </div>

          <div className="match-end-stage__score-summary">
            <div className="scouting-stage-stat">
              <span className="scouting-stage-stat__label">{t('finalResult')}</span>
              <strong className="scouting-stage-stat__value">
                <MatchResultDisplay result={matchResult} goldenSetLabel={t('goldenSet').toLowerCase()} />
              </strong>
            </div>
          </div>
        </section>

        <section className="scouting-stage-panel scouting-stage-panel--scroll match-end-stage__completed-sets">
          <div className="match-end-stage__panel-header">
            <div>
              <span className="scouting-config__section-kicker">{t('completedSetsTitle')}</span>
              <h3 className="match-end-stage__panel-title">{t('completedSetsSummary')}</h3>
            </div>
            <p className="set-end-stage__hint">{t('completedSetsSummaryHint')}</p>
          </div>

          <div className="match-end-stage__set-list">
            {completedSets.map((setSummary) => (
              <article key={setSummary.setNumber} className="match-end-stage__set-card">
                <div>
                  <span className="scouting-stage-stat__label">
                    {t('setLabel', { setNumber: setSummary.setNumber })}
                  </span>
                  <strong className="match-end-stage__set-winner">
                    {setSummary.winner === 'home'
                      ? homeTeamName
                      : setSummary.winner === 'away'
                        ? awayTeamName
                        : t('notSpecified')}
                  </strong>
                </div>
                <div className="match-end-stage__set-score">
                  <span>{setSummary.homeScore}</span>
                  <span className="scouting-stage__score-divider">:</span>
                  <span>{setSummary.awayScore}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="scouting-stage-panel match-end-stage__stats-panel">
          <div className="stats-view-tabs" role="tablist" aria-label={t('matchReport')}>
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
            <div className="stats-view-tabs__panel" role="tabpanel">
              <MatchReportTable
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                metadata={metadata}
                scoutingConfig={scoutingConfig}
                eventLog={eventLog}
                completedSets={rawCompletedSets}
                stats={matchStats}
                lineupSnapshots={lineupSnapshots}
              />
            </div>
          ) : (
            <div className="stats-view-tabs__panel" role="tabpanel">
              <PerformanceDashboard stats={matchStats} />
            </div>
          )}
        </section>
      </div>
    </ScoutingStageFrame>
  );
}
