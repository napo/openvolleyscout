import type { CompletedSetDisplaySummary } from '../model';
import type { MatchStats } from '../model';
import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import { MatchStatsQuickReport } from './MatchStatsQuickReport';

interface SetEndStageProps {
  setSummary: CompletedSetDisplaySummary;
  awayTeamName: string;
  homeTeamName: string;
  setsWon: {
    home: number;
    away: number;
  };
  setStats: MatchStats;
  canStartNextSet: boolean;
  onStartNextSet: () => void;
  onFinishMatch: () => void;
}

export function SetEndStage({
  setSummary,
  awayTeamName,
  homeTeamName,
  setsWon,
  setStats,
  canStartNextSet,
  onStartNextSet,
  onFinishMatch,
}: SetEndStageProps) {
  const { t } = useTranslation();
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
              <strong className="set-end-stage__team-name">{awayTeamName}</strong>
              <span className="set-end-stage__team-score">{setSummary.awayScore}</span>
            </div>
            <span className="scouting-stage__score-divider">:</span>
            <div className="set-end-stage__team-block">
              <strong className="set-end-stage__team-name">{homeTeamName}</strong>
              <span className="set-end-stage__team-score">{setSummary.homeScore}</span>
            </div>
          </div>

          <div className="set-end-stage__summary-grid">
            <div className="scouting-stage-stat">
              <span className="scouting-stage-stat__label">{t('setResult')}</span>
              <strong className="scouting-stage-stat__value">
                {setSummary.awayScore} : {setSummary.homeScore}
              </strong>
            </div>
            <div className="scouting-stage-stat">
              <span className="scouting-stage-stat__label">{t('matchScoreBySets')}</span>
              <strong className="scouting-stage-stat__value">
                {setsWon.away} : {setsWon.home}
              </strong>
            </div>
          </div>
        </section>

        <MatchStatsQuickReport
          stats={setStats}
          eyebrow={t('setLabel', { setNumber: setSummary.setNumber })}
          title={t('setStatistics')}
          scoreLabel={t('setScore')}
          score={{ away: setSummary.awayScore, home: setSummary.homeScore }}
        />

        <section className="scouting-stage-panel set-end-stage__rallies" aria-labelledby="set-rally-sequence-title">
          <header className="set-end-stage__aside-header">
            <span className="scouting-config__section-kicker">{t('quickStatsReport')}</span>
            <h3 id="set-rally-sequence-title" className="set-end-stage__aside-title">
              {t('rallySequence')}
            </h3>
          </header>

          {setStats.rallyStats.length > 0 ? (
            <div className="match-stats-report__rally-list">
              {setStats.rallyStats.map((rally) => (
                <article key={`${rally.setNumber}-${rally.rallyNumber}`} className="match-stats-report__rally">
                  <div className="match-stats-report__rally-meta">
                    <span>{t('setLabel', { setNumber: rally.setNumber })}</span>
                    <span>{t('rallyNumber')}: {rally.rallyNumber}</span>
                  </div>
                  <code className="match-stats-report__rally-code">
                    {rally.dataVolleyCode || rally.terminalReason || t('noEventsYet')}
                  </code>
                </article>
              ))}
            </div>
          ) : (
            <p className="set-end-stage__hint">{t('noEventsYet')}</p>
          )}
        </section>
      </div>
    </ScoutingStageFrame>
  );
}
