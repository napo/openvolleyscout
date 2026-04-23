import { useState } from 'react';
import type { CompletedSetDisplaySummary } from '../model';
import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';

interface SetEndStageProps {
  setSummary: CompletedSetDisplaySummary;
  awayTeamName: string;
  homeTeamName: string;
  setsWon: {
    home: number;
    away: number;
  };
  quickStats: {
    rallyCount: number;
    touchCount: number;
    setScore: {
      home: number;
      away: number;
    };
    setsWon: {
      home: number;
      away: number;
    };
    winningTeamName: string;
  };
  onStartNextSet: () => void;
  onFinishMatch: () => void;
}

export function SetEndStage({
  setSummary,
  awayTeamName,
  homeTeamName,
  setsWon,
  quickStats,
  onStartNextSet,
  onFinishMatch,
}: SetEndStageProps) {
  const { t } = useTranslation();
  const [isQuickStatsVisible, setIsQuickStatsVisible] = useState(false);
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
      bodyClassName="scouting-stage__body--static"
      footer={(
        <div className="scouting-stage__actions">
          <button type="button" className="btn-primary" onClick={onStartNextSet}>
            {t('startNextSet')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsQuickStatsVisible((current) => !current)}
          >
            {isQuickStatsVisible ? t('hideQuickStats') : t('viewQuickStats')}
          </button>
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
              <span className="match-end-stage__team-role">{t('away')}</span>
              <strong className="set-end-stage__team-name">{awayTeamName}</strong>
              <span className="set-end-stage__team-score">{setSummary.awayScore}</span>
            </div>
            <span className="scouting-stage__score-divider">:</span>
            <div className="set-end-stage__team-block">
              <span className="match-end-stage__team-role">{t('home')}</span>
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

        <section className="scouting-stage-panel scouting-stage-panel--scroll set-end-stage__aside">
          <div className="set-end-stage__aside-header">
            <div>
              <span className="scouting-config__section-kicker">{t('quickStatsTitle')}</span>
              <h3 className="set-end-stage__aside-title">{t('setEndQuickStatsTitle')}</h3>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsQuickStatsVisible((current) => !current)}
            >
              {isQuickStatsVisible ? t('hideQuickStats') : t('viewQuickStats')}
            </button>
          </div>

          {isQuickStatsVisible ? (
            <div className="set-end-stage__stats">
              <div className="scouting-stage-stat">
                <span className="scouting-stage-stat__label">{t('matchScoreBySets')}</span>
                <strong className="scouting-stage-stat__value">
                  {quickStats.setsWon.away} : {quickStats.setsWon.home}
                </strong>
              </div>
              <div className="scouting-stage-stat">
                <span className="scouting-stage-stat__label">{t('currentSetScore')}</span>
                <strong className="scouting-stage-stat__value">
                  {quickStats.setScore.away} : {quickStats.setScore.home}
                </strong>
              </div>
              <div className="scouting-stage-stat">
                <span className="scouting-stage-stat__label">{t('quickStatRallies')}</span>
                <strong className="scouting-stage-stat__value">{quickStats.rallyCount}</strong>
              </div>
              <div className="scouting-stage-stat">
                <span className="scouting-stage-stat__label">{t('quickStatTouches')}</span>
                <strong className="scouting-stage-stat__value">{quickStats.touchCount}</strong>
              </div>
              <div className="scouting-stage-stat">
                <span className="scouting-stage-stat__label">{t('setWinner')}</span>
                <strong className="scouting-stage-stat__value">{quickStats.winningTeamName}</strong>
              </div>
            </div>
          ) : (
            <p className="set-end-stage__hint">{t('setEndQuickStatsHint')}</p>
          )}
        </section>
      </div>
    </ScoutingStageFrame>
  );
}
