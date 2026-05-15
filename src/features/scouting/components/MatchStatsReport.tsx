import { useTranslation } from '@src/i18n';
import type { MatchStats, TeamStats, TrackedSkill } from '../model';
import { PlayerStatsByTeamTables } from './PlayerStatsByTeamTables';

interface MatchStatsReportProps {
  stats: MatchStats;
}

const TEAM_ROWS = ['away', 'home'] as const;
const ALL_SKILL_COLUMNS: TrackedSkill[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];

function TeamStatsTable({ stats }: { stats: MatchStats }) {
  const { t } = useTranslation();

  return (
    <div className="match-stats-report__table-wrap">
      <table className="match-stats-report__table">
        <thead>
          <tr>
            <th scope="col">{t('team')}</th>
            <th scope="col">{t('totalTouches')}</th>
            <th scope="col">{t('points')}</th>
            <th scope="col">{t('errors')}</th>
            <th scope="col">{t('aces')}</th>
            <th scope="col">{t('attackPoints')}</th>
            <th scope="col">{t('blockPoints')}</th>
            <th scope="col">{t('serveErrors')}</th>
            <th scope="col">{t('receptionErrors')}</th>
            <th scope="col">{t('perfect')}</th>
            <th scope="col">{t('positive')}</th>
            <th scope="col">{t('negative')}</th>
            <th scope="col">{t('neutral')}</th>
          </tr>
        </thead>
        <tbody>
          {TEAM_ROWS.map((teamSide) => {
            const teamStats: TeamStats = stats.teamStats[teamSide];
            const perfect = ALL_SKILL_COLUMNS.reduce((total, skill) => total + teamStats[skill].perfect, 0);
            const positive = ALL_SKILL_COLUMNS.reduce((total, skill) => total + teamStats[skill].positive, 0);
            const negative = ALL_SKILL_COLUMNS.reduce((total, skill) => total + teamStats[skill].minus, 0);
            const neutral = ALL_SKILL_COLUMNS.reduce((total, skill) => total + teamStats[skill].neutral, 0);

            return (
              <tr key={teamSide}>
                <th scope="row">{teamStats.teamName}</th>
                <td>{teamStats.totalTouches}</td>
                <td>{teamStats.points}</td>
                <td>{teamStats.errors}</td>
                <td>{teamStats.aces}</td>
                <td>{teamStats.attackPoints}</td>
                <td>{teamStats.blockPoints}</td>
                <td>{teamStats.serveErrors}</td>
                <td>{teamStats.receptionErrors}</td>
                <td>{perfect}</td>
                <td>{positive}</td>
                <td>{negative}</td>
                <td>{neutral}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MatchStatsReport({ stats }: MatchStatsReportProps) {
  const { t } = useTranslation();

  return (
    <section className="scouting-stage-panel match-stats-report" aria-labelledby="match-stats-report-title">
      <header className="match-stats-report__header">
        <div>
          <span className="scouting-config__section-kicker">{t('matchReport')}</span>
          <h3 id="match-stats-report-title" className="match-stats-report__title">{t('matchReport')}</h3>
        </div>

        <div className="match-stats-report__score">
          <span>{t('finalMatchResult')}</span>
          <strong>
            {stats.setsWon.home} : {stats.setsWon.away}
          </strong>
        </div>
      </header>

      {stats.setStats.length > 0 ? (
        <div className="match-stats-report__set-scores" aria-label={t('setScore')}>
          {stats.setStats.map((setStats) => (
            <span key={setStats.setNumber} className="match-stats-report__set-score">
              {t('setLabel', { setNumber: setStats.setNumber })}: {setStats.homeScore} : {setStats.awayScore}
            </span>
          ))}
        </div>
      ) : null}

      <section className="match-stats-report__section" aria-labelledby="team-stats-title">
        <h4 id="team-stats-title" className="match-stats-report__section-title">{t('teamStats')}</h4>
        <TeamStatsTable stats={stats} />
      </section>

      <section className="match-stats-report__section" aria-labelledby="player-stats-title">
        <h4 id="player-stats-title" className="match-stats-report__section-title">{t('playerStats')}</h4>
        <PlayerStatsByTeamTables stats={stats} />
      </section>
    </section>
  );
}
