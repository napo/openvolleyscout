import { useTranslation, type TranslationKey } from '@src/i18n';
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchStats } from '../model';

interface MatchStatsQuickReportProps {
  stats: MatchStats;
}

type QuickStatsValue = number | string;

type QuickStatsRow = {
  id: string;
  labelKey: TranslationKey;
  values: Record<TeamSide, QuickStatsValue>;
  rates?: Record<TeamSide, number | null>;
};

const TEAM_SIDES = ['away', 'home'] as const;

export function toPercentage(value: number | null): string {
  return value === null ? '-' : `${(value * 100).toFixed(1)}%`;
}

export function formatEfficiency(value: number | null): string {
  return toPercentage(value);
}

function getOtherTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'away' ? 'home' : 'away';
}

function getRateTone(row: QuickStatsRow, teamSide: TeamSide): 'good' | 'poor' | 'neutral' {
  if (!row.rates) {
    return 'neutral';
  }

  const rate = row.rates[teamSide];
  const otherRate = row.rates[getOtherTeamSide(teamSide)];
  if (rate === null || otherRate === null || rate === otherRate) {
    return 'neutral';
  }

  return rate > otherRate ? 'good' : 'poor';
}

function QuickStatsSkillTable({
  titleKey,
  rows,
  stats,
}: {
  titleKey: TranslationKey;
  rows: QuickStatsRow[];
  stats: MatchStats;
}) {
  const { t } = useTranslation();
  const teams = stats.quickStats.teams;

  return (
    <article className="match-stats-quick-report__skill">
      <h4 className="match-stats-quick-report__skill-title">{t(titleKey)}</h4>
      <div className="match-stats-quick-report__table-wrap">
        <table className="match-stats-quick-report__table">
          <thead>
            <tr>
              <th scope="col">{t('teamStats')}</th>
              {TEAM_SIDES.map((teamSide) => (
                <th key={teamSide} scope="col">{teams[teamSide].teamName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{t(row.labelKey)}</th>
                {TEAM_SIDES.map((teamSide) => {
                  const tone = getRateTone(row, teamSide);

                  return (
                    <td key={teamSide}>
                      <span className={`match-stats-quick-report__value match-stats-quick-report__value--${tone}`}>
                        {row.values[teamSide]}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PlayerQuickStatsTable({ stats }: { stats: MatchStats }) {
  const { t } = useTranslation();

  return (
    <div className="match-stats-quick-report__table-wrap">
      <table className="match-stats-quick-report__table match-stats-quick-report__table--players">
        <thead>
          <tr>
            <th scope="col">{t('team')}</th>
            <th scope="col">{t('jerseyNumber')}</th>
            <th scope="col">{t('player')}</th>
            <th scope="col">{t('totalPoints')}</th>
            <th scope="col">{t('attackPoints')}</th>
            <th scope="col">{t('blockPoints')}</th>
            <th scope="col">{t('aces')}</th>
            <th scope="col">{t('errors')}</th>
            <th scope="col">{t('attackEfficiency')}</th>
          </tr>
        </thead>
        <tbody>
          {stats.quickStats.players.map((player) => (
            <tr key={player.playerId}>
              <td>{stats.quickStats.teams[player.teamSide].teamName}</td>
              <td>{player.jerseyNumber}</td>
              <th scope="row">{player.playerName}</th>
              <td>{player.totalPoints}</td>
              <td>{player.attackPoints}</td>
              <td>{player.blockPoints}</td>
              <td>{player.aces}</td>
              <td>{player.errors}</td>
              <td>{formatEfficiency(player.attack.efficiency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatchStatsQuickReport({ stats }: MatchStatsQuickReportProps) {
  const { t } = useTranslation();
  const teams = stats.quickStats.teams;

  const serveRows: QuickStatsRow[] = [
    {
      id: 'serve-total',
      labelKey: 'total',
      values: {
        away: teams.away.serve.total,
        home: teams.home.serve.total,
      },
    },
    {
      id: 'serve-aces',
      labelKey: 'aces',
      values: {
        away: teams.away.serve.aces,
        home: teams.home.serve.aces,
      },
    },
    {
      id: 'serve-errors',
      labelKey: 'errors',
      values: {
        away: teams.away.serve.errors,
        home: teams.home.serve.errors,
      },
    },
    {
      id: 'serve-efficiency',
      labelKey: 'efficiency',
      values: {
        away: formatEfficiency(teams.away.serve.efficiency),
        home: formatEfficiency(teams.home.serve.efficiency),
      },
      rates: {
        away: teams.away.serve.efficiency,
        home: teams.home.serve.efficiency,
      },
    },
  ];

  const receptionRows: QuickStatsRow[] = [
    {
      id: 'reception-total',
      labelKey: 'total',
      values: {
        away: teams.away.reception.total,
        home: teams.home.reception.total,
      },
    },
    {
      id: 'reception-perfect',
      labelKey: 'perfect',
      values: {
        away: teams.away.reception.perfect,
        home: teams.home.reception.perfect,
      },
    },
    {
      id: 'reception-positive',
      labelKey: 'positive',
      values: {
        away: teams.away.reception.positive,
        home: teams.home.reception.positive,
      },
    },
    {
      id: 'reception-negative',
      labelKey: 'negative',
      values: {
        away: teams.away.reception.negative,
        home: teams.home.reception.negative,
      },
    },
    {
      id: 'reception-errors',
      labelKey: 'errors',
      values: {
        away: teams.away.reception.errors,
        home: teams.home.reception.errors,
      },
    },
    {
      id: 'reception-efficiency',
      labelKey: 'efficiency',
      values: {
        away: formatEfficiency(teams.away.reception.efficiency),
        home: formatEfficiency(teams.home.reception.efficiency),
      },
      rates: {
        away: teams.away.reception.efficiency,
        home: teams.home.reception.efficiency,
      },
    },
    {
      id: 'reception-perfect-percentage',
      labelKey: 'perfectPercentage',
      values: {
        away: toPercentage(teams.away.reception.perfectPercentage),
        home: toPercentage(teams.home.reception.perfectPercentage),
      },
      rates: {
        away: teams.away.reception.perfectPercentage,
        home: teams.home.reception.perfectPercentage,
      },
    },
  ];

  const attackRows: QuickStatsRow[] = [
    {
      id: 'attack-attempts',
      labelKey: 'attempts',
      values: {
        away: teams.away.attack.attempts,
        home: teams.home.attack.attempts,
      },
    },
    {
      id: 'attack-points',
      labelKey: 'points',
      values: {
        away: teams.away.attack.points,
        home: teams.home.attack.points,
      },
    },
    {
      id: 'attack-errors',
      labelKey: 'errors',
      values: {
        away: teams.away.attack.errors,
        home: teams.home.attack.errors,
      },
    },
    {
      id: 'attack-blocked',
      labelKey: 'blocked',
      values: {
        away: teams.away.attack.blocked,
        home: teams.home.attack.blocked,
      },
    },
    {
      id: 'attack-efficiency',
      labelKey: 'efficiency',
      values: {
        away: formatEfficiency(teams.away.attack.efficiency),
        home: formatEfficiency(teams.home.attack.efficiency),
      },
      rates: {
        away: teams.away.attack.efficiency,
        home: teams.home.attack.efficiency,
      },
    },
    {
      id: 'attack-kill-percentage',
      labelKey: 'killPercentage',
      values: {
        away: toPercentage(teams.away.attack.killPercentage),
        home: toPercentage(teams.home.attack.killPercentage),
      },
      rates: {
        away: teams.away.attack.killPercentage,
        home: teams.home.attack.killPercentage,
      },
    },
  ];

  const blockRows: QuickStatsRow[] = [
    {
      id: 'block-attempts',
      labelKey: 'attempts',
      values: {
        away: teams.away.block.attempts,
        home: teams.home.block.attempts,
      },
    },
    {
      id: 'block-points',
      labelKey: 'blockPoints',
      values: {
        away: teams.away.block.points,
        home: teams.home.block.points,
      },
    },
    {
      id: 'block-opponent-attacks',
      labelKey: 'opponentAttacks',
      values: {
        away: teams.away.block.opponentAttackAttempts,
        home: teams.home.block.opponentAttackAttempts,
      },
    },
    {
      id: 'block-efficiency',
      labelKey: 'efficiency',
      values: {
        away: formatEfficiency(teams.away.block.efficiency),
        home: formatEfficiency(teams.home.block.efficiency),
      },
      rates: {
        away: teams.away.block.efficiency,
        home: teams.home.block.efficiency,
      },
    },
  ];

  return (
    <section className="scouting-stage-panel match-stats-quick-report" aria-labelledby="match-stats-quick-report-title">
      <header className="match-stats-quick-report__header">
        <div>
          <span className="scouting-config__section-kicker">{t('quickStatsTitle')}</span>
          <h3 id="match-stats-quick-report-title" className="match-stats-quick-report__title">
            {t('quickStatsReport')}
          </h3>
        </div>

        <div className="match-stats-quick-report__score" aria-label={t('finalScore')}>
          <span>{teams.away.teamName}</span>
          <strong>{stats.setsWon.away} : {stats.setsWon.home}</strong>
          <span>{teams.home.teamName}</span>
        </div>
      </header>

      {stats.setStats.length > 0 ? (
        <div className="match-stats-quick-report__set-scores" aria-label={t('setScore')}>
          {stats.setStats.map((setStats) => (
            <span key={setStats.setNumber} className="match-stats-quick-report__set-score">
              {t('setLabel', { setNumber: setStats.setNumber })}: {setStats.awayScore} : {setStats.homeScore}
            </span>
          ))}
        </div>
      ) : null}

      <section className="match-stats-quick-report__section" aria-labelledby="team-quick-stats-title">
        <h4 id="team-quick-stats-title" className="match-stats-quick-report__section-title">
          {t('teamQuickStats')}
        </h4>
        <div className="match-stats-quick-report__grid">
          <QuickStatsSkillTable titleKey="serve" rows={serveRows} stats={stats} />
          <QuickStatsSkillTable titleKey="receive" rows={receptionRows} stats={stats} />
          <QuickStatsSkillTable titleKey="attack" rows={attackRows} stats={stats} />
          <QuickStatsSkillTable titleKey="block" rows={blockRows} stats={stats} />
        </div>
      </section>

      <section className="match-stats-quick-report__section" aria-labelledby="player-quick-stats-title">
        <h4 id="player-quick-stats-title" className="match-stats-quick-report__section-title">
          {t('playerStats')}
        </h4>
        <PlayerQuickStatsTable stats={stats} />
      </section>
    </section>
  );
}
