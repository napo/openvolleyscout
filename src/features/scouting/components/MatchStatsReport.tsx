import { useTranslation, type TranslationKey } from '@src/i18n';
import type { MatchStats, PlayerStats, TeamStats, TrackedSkill } from '../model';

interface MatchStatsReportProps {
  stats: MatchStats;
}

const TEAM_ROWS = ['away', 'home'] as const;
const ALL_SKILL_COLUMNS: TrackedSkill[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];
const PLAYER_SKILL_COLUMNS: TrackedSkill[] = ['serve', 'receive', 'attack', 'block'];

const SKILL_LABEL_KEYS: Record<TrackedSkill, TranslationKey> = {
  serve: 'serve',
  receive: 'receive',
  set: 'set',
  attack: 'attack',
  block: 'block',
  dig: 'dig',
  freeball: 'freeball',
  cover: 'cover',
};

function getTeamDisplayName(stats: MatchStats, teamSide: 'away' | 'home') {
  return stats.teamStats[teamSide].teamName;
}

function getPlayerTeamName(stats: MatchStats, player: PlayerStats) {
  return getTeamDisplayName(stats, player.teamSide);
}

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

function PlayerStatsTable({ stats }: { stats: MatchStats }) {
  const { t } = useTranslation();

  return (
    <div className="match-stats-report__table-wrap">
      <table className="match-stats-report__table match-stats-report__table--players">
        <thead>
          <tr>
            <th scope="col">{t('team')}</th>
            <th scope="col">{t('player')}</th>
            <th scope="col">{t('totalTouches')}</th>
            <th scope="col">{t('points')}</th>
            <th scope="col">{t('errors')}</th>
            {PLAYER_SKILL_COLUMNS.map((skill) => (
              <th key={skill} scope="col">{t(SKILL_LABEL_KEYS[skill])}</th>
            ))}
            <th scope="col">{t('aces')}</th>
            <th scope="col">{t('attackPoints')}</th>
            <th scope="col">{t('blockPoints')}</th>
            <th scope="col">{t('serveErrors')}</th>
            <th scope="col">{t('receptionErrors')}</th>
          </tr>
        </thead>
        <tbody>
          {stats.playerStats.map((player) => (
            <tr key={player.playerId}>
              <td>{getPlayerTeamName(stats, player)}</td>
              <th scope="row">
                <span className="match-stats-report__player-number">{player.jerseyNumber}</span>
                {player.playerName}
              </th>
              <td>{player.totalTouches}</td>
              <td>{player.points}</td>
              <td>{player.errors}</td>
              {PLAYER_SKILL_COLUMNS.map((skill) => (
                <td key={skill}>{player[skill].total}</td>
              ))}
              <td>{player.aces}</td>
              <td>{player.attackPoints}</td>
              <td>{player.blockPoints}</td>
              <td>{player.serveErrors}</td>
              <td>{player.receptionErrors}</td>
            </tr>
          ))}
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
            {stats.setsWon.away} : {stats.setsWon.home}
          </strong>
        </div>
      </header>

      {stats.setStats.length > 0 ? (
        <div className="match-stats-report__set-scores" aria-label={t('setScore')}>
          {stats.setStats.map((setStats) => (
            <span key={setStats.setNumber} className="match-stats-report__set-score">
              {t('setLabel', { setNumber: setStats.setNumber })}: {setStats.awayScore} : {setStats.homeScore}
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
        <PlayerStatsTable stats={stats} />
      </section>

      <section className="match-stats-report__section" aria-labelledby="rally-sequence-title">
        <h4 id="rally-sequence-title" className="match-stats-report__section-title">{t('rallySequence')}</h4>
        {stats.rallyStats.length > 0 ? (
          <div className="match-stats-report__rally-list">
            {stats.rallyStats.map((rally) => (
              <article
                key={`${rally.setNumber}-${rally.rallyNumber}`}
                className="match-stats-report__rally"
              >
                <div className="match-stats-report__rally-meta">
                  <span>{t('setLabel', { setNumber: rally.setNumber })}</span>
                  <span>{t('rallyNumber')}: {rally.rallyNumber}</span>
                  {rally.pointWinner ? (
                    <span>{t('points')}: {getTeamDisplayName(stats, rally.pointWinner)}</span>
                  ) : null}
                </div>
                <code className="match-stats-report__rally-code">
                  {rally.dataVolleyCode || rally.terminalReason || t('noEventsYet')}
                </code>
              </article>
            ))}
          </div>
        ) : (
          <p className="match-stats-report__empty">{t('noEventsYet')}</p>
        )}
      </section>
    </section>
  );
}
