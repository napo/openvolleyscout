import type { CompletedSetDisplaySummary } from '../model';
import type { MatchStats } from '../model';
import type { Team } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import { SetStatsInfographic } from './SetStatsInfographic';

interface SetEndStageProps {
  setSummary: CompletedSetDisplaySummary;
  awayTeam: Team;
  homeTeam: Team;
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
  awayTeam,
  homeTeam,
  setsWon,
  setStats,
  canStartNextSet,
  onStartNextSet,
  onFinishMatch,
}: SetEndStageProps) {
  const { t } = useTranslation();
  const awayTeamName = awayTeam.name.trim() || t('away');
  const homeTeamName = homeTeam.name.trim() || t('home');
  const winnerTeamName = setSummary.winner === 'home'
    ? homeTeamName
    : setSummary.winner === 'away'
      ? awayTeamName
      : t('notSpecified');
  const homePlayerStats = setStats.playerStats.filter((player) => player.teamSide === 'home');
  const awayPlayerStats = setStats.playerStats.filter((player) => player.teamSide === 'away');

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

        <SetStatsInfographic
          setNumber={setSummary.setNumber}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          setStats={setStats}
          homePlayerStats={homePlayerStats}
          awayPlayerStats={awayPlayerStats}
          completedSetScore={{
            homeScore: setSummary.homeScore,
            awayScore: setSummary.awayScore,
          }}
          rallyStats={setStats.rallyStats}
        />
      </div>
    </ScoutingStageFrame>
  );
}
