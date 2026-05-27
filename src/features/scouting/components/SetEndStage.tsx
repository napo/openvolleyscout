import { useState } from 'react';
import type { CompletedSetDisplaySummary, MatchStats } from '../model';
import type { Team } from '@src/domain/roster/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { SetLineupSnapshot } from '@src/domain/lineup';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import { SkillEvaluationDashboard } from './SkillEvaluationDashboard';
import { MatchReportTable } from './MatchReportTable';

type StatsView = 'report' | 'charts';

interface SetEndStageProps {
  setSummary: CompletedSetDisplaySummary;
  awayTeam: Team;
  homeTeam: Team;
  setsWon: {
    home: number;
    away: number;
  };
  setStats: MatchStats;
  matchStats: MatchStats;
  metadata?: MatchMetadata | null;
  scoutingConfig: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  lineupSnapshots?: readonly SetLineupSnapshot[];
  canStartNextSet: boolean;
  onStartNextSet: () => void;
  onFinishMatch: () => void;
}

export function SetEndStage({
  setSummary,
  awayTeam,
  homeTeam,
  setsWon,
  setStats,
  matchStats,
  metadata,
  scoutingConfig,
  eventLog,
  completedSets,
  lineupSnapshots,
  canStartNextSet,
  onStartNextSet,
  onFinishMatch,
}: SetEndStageProps) {
  const { t } = useTranslation();
  const [statsView, setStatsView] = useState<StatsView>('report');
  const awayTeamName = awayTeam.name.trim() || t('away');
  const homeTeamName = homeTeam.name.trim() || t('home');
  const winnerTeamName = setSummary.winner === 'home'
    ? homeTeamName
    : setSummary.winner === 'away'
      ? awayTeamName
      : t('notSpecified');

  return (
    <ScoutingStageFrame
      stage="set_end"
      eyebrow={t('setEndEyebrow', { setNumber: setSummary.setNumber })}
      title={t('setEndTitle')}
      description={t('setEndDescription')}
      footer={(
        <div className="scouting-stage__actions">
          {canStartNextSet ? (
            <button type="button" className="btn-primary" onClick={onStartNextSet}>
              {t('nextSetSetup')}
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onFinishMatch}>
            {t('finishMatch')}
          </button>
        </div>
      )}
    >
      <div className="set-end-stage">
        <section className="scouting-stage-panel set-end-stage__hero">
          <span className="scouting-stage__score-label">
            {t('setEndStageLabel', { setNumber: setSummary.setNumber })}
          </span>
          <div className="set-end-stage__winner">
            <h3 className="set-end-stage__winner-title">{winnerTeamName}</h3>
            <p className="set-end-stage__winner-subtitle">{t('setEndWinnerLabel')}</p>
          </div>

          <div className="set-end-stage__scoreboard">
            <div className="set-end-stage__team-block">
              <strong className="set-end-stage__team-name">{homeTeamName}</strong>
              <span className="set-end-stage__team-score">{setSummary.homeScore}</span>
            </div>
            <span className="scouting-stage__score-divider">:</span>
            <div className="set-end-stage__team-block">
              <strong className="set-end-stage__team-name">{awayTeamName}</strong>
              <span className="set-end-stage__team-score">{setSummary.awayScore}</span>
            </div>
          </div>

          <div className="set-end-stage__summary-grid">
            <div className="scouting-stage-stat">
              <span className="scouting-stage-stat__label">{t('setResult')}</span>
              <strong className="scouting-stage-stat__value">
                {setSummary.homeScore} : {setSummary.awayScore}
              </strong>
            </div>
            <div className="scouting-stage-stat">
              <span className="scouting-stage-stat__label">{t('matchScoreBySets')}</span>
              <strong className="scouting-stage-stat__value">
                {setsWon.home} : {setsWon.away}
              </strong>
            </div>
          </div>
        </section>

        <section className="scouting-stage-panel set-end-stage__stats-panel">
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
                completedSets={completedSets}
                stats={matchStats}
                lineupSnapshots={lineupSnapshots}
              />
            </div>
          ) : (
            <div className="stats-view-tabs__panel" role="tabpanel">
              <SkillEvaluationDashboard stats={setStats} />
            </div>
          )}
        </section>
      </div>
    </ScoutingStageFrame>
  );
}
