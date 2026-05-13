import { useMemo } from 'react';
import type { TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import type { MatchStats, PlayerStats, RallyStats } from '../model';
import { safeDivide } from '../model';
import './set-stats-infographic.css';

interface CompletedSetScore {
  homeScore: number;
  awayScore: number;
}

interface SetStatsInfographicProps {
  setNumber: number;
  homeTeam: Team;
  awayTeam: Team;
  setStats: MatchStats;
  homePlayerStats: PlayerStats[];
  awayPlayerStats: PlayerStats[];
  completedSetScore: CompletedSetScore;
  rallyStats?: RallyStats[];
}

type NumericValue = number | null;

type KpiCard = {
  id: string;
  label: string;
  values: Record<TeamSide, NumericValue>;
  formatter: (value: NumericValue) => string;
  maxValue?: number;
  show: boolean;
};

type TeamMetricRow = {
  id: string;
  label: string;
  values: Record<TeamSide, number>;
};

type AttackPoint = {
  id: string;
  teamSide: TeamSide;
  playerName: string;
  attempts: number;
  points: number;
  errors: number;
  efficiency: number;
};

type ProgressionPoint = {
  rallyNumber: number;
  homeScore: number;
  awayScore: number;
};

const TEAM_SIDES = ['home', 'away'] as const;
const CHART_WIDTH = 360;
const CHART_HEIGHT = 220;
const CHART_PADDING = {
  top: 20,
  right: 22,
  bottom: 36,
  left: 44,
};
const PROGRESSION_WIDTH = 420;
const PROGRESSION_HEIGHT = 150;
const PROGRESSION_PADDING = {
  top: 16,
  right: 18,
  bottom: 26,
  left: 34,
};

function getTeamName(team: Team, fallback: string): string {
  return team.name.trim() || fallback;
}

function formatPercentValue(value: NumericValue, notAvailable: string): string {
  return value === null ? notAvailable : `${(value * 100).toFixed(1)}%`;
}

function formatNumberValue(value: NumericValue, notAvailable: string): string {
  return value === null ? notAvailable : String(value);
}

function getBarWidth(value: NumericValue, maxValue: number): string {
  if (value === null || maxValue <= 0) {
    return '0%';
  }

  return `${Math.max(0, Math.min(100, (value / maxValue) * 100))}%`;
}

function getPlayerReceptionPositive(player: PlayerStats): number | null {
  return safeDivide(player.receive.perfect + player.receive.positive, player.receive.total);
}

function getDisplayedPlayers(players: PlayerStats[]): PlayerStats[] {
  return players
    .filter((player) => (
      player.totalTouches > 0
      || player.points > 0
      || player.errors > 0
      || player.attackPoints > 0
      || player.aces > 0
      || player.blockPoints > 0
    ))
    .sort((left, right) => {
      const leftJerseyNumber = Number(left.jerseyNumber);
      const rightJerseyNumber = Number(right.jerseyNumber);
      const jerseySort = Number.isFinite(leftJerseyNumber) && Number.isFinite(rightJerseyNumber)
        ? leftJerseyNumber - rightJerseyNumber
        : String(left.jerseyNumber).localeCompare(String(right.jerseyNumber));

      return (
        right.points - left.points
        || right.attackPoints - left.attackPoints
        || right.aces - left.aces
        || right.blockPoints - left.blockPoints
        || left.errors - right.errors
        || jerseySort
      );
    });
}

function buildAttackPoints(players: PlayerStats[]): AttackPoint[] {
  return players
    .map((player) => ({
      id: player.playerId,
      teamSide: player.teamSide,
      playerName: player.playerName,
      attempts: player.attack.total,
      points: player.attackPoints,
      errors: player.attackErrors,
      efficiency: safeDivide(
        player.attackPoints - player.attackErrors - player.attackBlocked,
        player.attack.total,
      ),
    }))
    .filter((point): point is AttackPoint => point.attempts > 0 && point.efficiency !== null);
}

function getAttackPointCoordinates(point: AttackPoint, maxAttempts: number) {
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const clampedEfficiency = Math.max(-1, Math.min(1, point.efficiency));

  return {
    x: CHART_PADDING.left + (point.attempts / maxAttempts) * plotWidth,
    y: CHART_PADDING.top + ((1 - clampedEfficiency) / 2) * plotHeight,
  };
}

function buildProgression(rallies: RallyStats[]): ProgressionPoint[] {
  let homeScore = 0;
  let awayScore = 0;
  const points: ProgressionPoint[] = [{ rallyNumber: 0, homeScore, awayScore }];

  rallies
    .filter((rally) => Boolean(rally.pointWinner))
    .forEach((rally) => {
      if (rally.pointWinner === 'home') {
        homeScore += 1;
      } else if (rally.pointWinner === 'away') {
        awayScore += 1;
      }

      points.push({
        rallyNumber: rally.rallyNumber,
        homeScore,
        awayScore,
      });
    });

  return points.length > 1 ? points : [];
}

function getProgressionPointCoordinates(point: ProgressionPoint, index: number, pointCount: number, maxScore: number, teamSide: TeamSide) {
  const plotWidth = PROGRESSION_WIDTH - PROGRESSION_PADDING.left - PROGRESSION_PADDING.right;
  const plotHeight = PROGRESSION_HEIGHT - PROGRESSION_PADDING.top - PROGRESSION_PADDING.bottom;
  const score = teamSide === 'home' ? point.homeScore : point.awayScore;
  const denominator = Math.max(1, pointCount - 1);

  return {
    x: PROGRESSION_PADDING.left + (index / denominator) * plotWidth,
    y: PROGRESSION_PADDING.top + (1 - score / Math.max(1, maxScore)) * plotHeight,
  };
}

function buildStepPath(points: ProgressionPoint[], teamSide: TeamSide, maxScore: number): string {
  return points.reduce((path, point, index) => {
    const coordinates = getProgressionPointCoordinates(point, index, points.length, maxScore, teamSide);
    if (index === 0) {
      return `M ${coordinates.x} ${coordinates.y}`;
    }

    return `${path} H ${coordinates.x} V ${coordinates.y}`;
  }, '');
}

export function SetStatsInfographic({
  setNumber,
  homeTeam,
  awayTeam,
  setStats,
  homePlayerStats,
  awayPlayerStats,
  completedSetScore,
  rallyStats,
}: SetStatsInfographicProps) {
  const { t } = useTranslation();
  const notAvailable = t('notAvailable');
  const teamNames: Record<TeamSide, string> = {
    home: getTeamName(homeTeam, t('home')),
    away: getTeamName(awayTeam, t('away')),
  };
  const teamQuickStats = setStats.quickStats.teams;
  const teamStats = setStats.teamStats;
  const players = useMemo(
    () => getDisplayedPlayers([...homePlayerStats, ...awayPlayerStats]),
    [awayPlayerStats, homePlayerStats],
  );
  const showPlayerReception = players.some((player) => player.receive.total > 0);
  const attackPoints = useMemo(
    () => buildAttackPoints(players),
    [players],
  );
  const maxAttackAttempts = Math.max(1, ...attackPoints.map((point) => point.attempts));
  const pointSkillRows: TeamMetricRow[] = [
    {
      id: 'attack',
      label: t('attack'),
      values: {
        home: teamStats.home.attackPoints,
        away: teamStats.away.attackPoints,
      },
    },
    {
      id: 'aces',
      label: t('aces'),
      values: {
        home: teamStats.home.aces,
        away: teamStats.away.aces,
      },
    },
    {
      id: 'block',
      label: t('blockPoints'),
      values: {
        home: teamStats.home.blockPoints,
        away: teamStats.away.blockPoints,
      },
    },
    {
      id: 'opponent-errors',
      label: t('opponentErrors'),
      values: {
        home: teamStats.away.errors,
        away: teamStats.home.errors,
      },
    },
  ];
  const maxPointSkillValue = Math.max(1, ...pointSkillRows.flatMap((row) => TEAM_SIDES.map((teamSide) => row.values[teamSide])));
  const receptionQuality = TEAM_SIDES.map((teamSide) => ({
    teamSide,
    positive: teamQuickStats[teamSide].reception.efficiency,
    perfect: teamQuickStats[teamSide].reception.perfectPercentage,
  }));
  const hasReceptionQuality = receptionQuality.some((row) => row.positive !== null || row.perfect !== null);
  const errorRows: TeamMetricRow[] = [
    {
      id: 'attack-errors',
      label: t('attackErrors'),
      values: {
        home: teamStats.home.attackErrors,
        away: teamStats.away.attackErrors,
      },
    },
    {
      id: 'serve-errors',
      label: t('serveErrors'),
      values: {
        home: teamStats.home.serveErrors,
        away: teamStats.away.serveErrors,
      },
    },
    {
      id: 'reception-errors',
      label: t('receptionErrors'),
      values: {
        home: teamStats.home.receptionErrors,
        away: teamStats.away.receptionErrors,
      },
    },
    {
      id: 'block-errors',
      label: t('blockErrors'),
      values: {
        home: teamStats.home.block.errors,
        away: teamStats.away.block.errors,
      },
    },
  ];
  const maxErrorValue = Math.max(1, ...errorRows.flatMap((row) => TEAM_SIDES.map((teamSide) => row.values[teamSide])));
  const setRallies = useMemo(
    () => (rallyStats ?? setStats.rallyStats).filter((rally) => rally.setNumber === setNumber),
    [rallyStats, setNumber, setStats.rallyStats],
  );
  const progression = useMemo(
    () => buildProgression(setRallies),
    [setRallies],
  );
  const progressionMaxScore = Math.max(
    1,
    completedSetScore.homeScore,
    completedSetScore.awayScore,
    ...progression.map((point) => Math.max(point.homeScore, point.awayScore)),
  );
  const kpiCards: KpiCard[] = [
    {
      id: 'total-points',
      label: t('totalPoints'),
      values: {
        home: completedSetScore.homeScore,
        away: completedSetScore.awayScore,
      },
      formatter: (value) => formatNumberValue(value, notAvailable),
      show: true,
    },
    {
      id: 'attack-points',
      label: t('attackPoints'),
      values: {
        home: teamStats.home.attackPoints,
        away: teamStats.away.attackPoints,
      },
      formatter: (value) => formatNumberValue(value, notAvailable),
      show: true,
    },
    {
      id: 'aces',
      label: t('aces'),
      values: {
        home: teamStats.home.aces,
        away: teamStats.away.aces,
      },
      formatter: (value) => formatNumberValue(value, notAvailable),
      show: true,
    },
    {
      id: 'block-points',
      label: t('blockPoints'),
      values: {
        home: teamStats.home.blockPoints,
        away: teamStats.away.blockPoints,
      },
      formatter: (value) => formatNumberValue(value, notAvailable),
      show: true,
    },
    {
      id: 'total-errors',
      label: t('totalErrors'),
      values: {
        home: teamStats.home.errors,
        away: teamStats.away.errors,
      },
      formatter: (value) => formatNumberValue(value, notAvailable),
      show: true,
    },
    {
      id: 'reception-positive',
      label: t('receptionPositive'),
      values: {
        home: teamQuickStats.home.reception.efficiency,
        away: teamQuickStats.away.reception.efficiency,
      },
      formatter: (value) => formatPercentValue(value, notAvailable),
      maxValue: 1,
      show: teamQuickStats.home.reception.efficiency !== null || teamQuickStats.away.reception.efficiency !== null,
    },
    {
      id: 'reception-perfect',
      label: t('receptionPerfect'),
      values: {
        home: teamQuickStats.home.reception.perfectPercentage,
        away: teamQuickStats.away.reception.perfectPercentage,
      },
      formatter: (value) => formatPercentValue(value, notAvailable),
      maxValue: 1,
      show: teamQuickStats.home.reception.perfectPercentage !== null || teamQuickStats.away.reception.perfectPercentage !== null,
    },
    {
      id: 'side-out',
      label: t('sideOut'),
      values: {
        home: setStats.sideOutStats.home.sideOutPercentage,
        away: setStats.sideOutStats.away.sideOutPercentage,
      },
      formatter: (value) => formatPercentValue(value, notAvailable),
      maxValue: 1,
      show: setStats.sideOutStats.home.sideOutPercentage !== null || setStats.sideOutStats.away.sideOutPercentage !== null,
    },
    {
      id: 'break-point',
      label: t('breakPoint'),
      values: {
        home: setStats.breakPointStats.home.breakPointPercentage,
        away: setStats.breakPointStats.away.breakPointPercentage,
      },
      formatter: (value) => formatPercentValue(value, notAvailable),
      maxValue: 1,
      show: setStats.breakPointStats.home.breakPointPercentage !== null || setStats.breakPointStats.away.breakPointPercentage !== null,
    },
  ];
  const displayedKpis = kpiCards.filter((card) => card.show);

  return (
    <section className="set-stats-infographic" aria-labelledby="set-stats-infographic-title">
      <header className="set-stats-infographic__header">
        <div>
          <span className="scouting-config__section-kicker">{t('setLabel', { setNumber })}</span>
          <h3 id="set-stats-infographic-title" className="set-stats-infographic__title">
            {t('setStatistics')}
          </h3>
        </div>

        <div className="set-stats-infographic__score" aria-label={t('setScore')}>
          <span>{teamNames.home}</span>
          <strong>{completedSetScore.homeScore} : {completedSetScore.awayScore}</strong>
          <span>{teamNames.away}</span>
        </div>
      </header>

      <div className="set-stats-infographic__kpi-grid" aria-label={t('teamQuickStats')}>
        {displayedKpis.map((card) => {
          const maxValue = card.maxValue ?? Math.max(1, ...TEAM_SIDES.map((teamSide) => card.values[teamSide] ?? 0));

          return (
            <article key={card.id} className="set-stats-infographic__kpi-card">
              <h4 className="set-stats-infographic__kpi-title">{card.label}</h4>
              <div className="set-stats-infographic__kpi-values">
                {TEAM_SIDES.map((teamSide) => (
                  <div key={teamSide} className={`set-stats-infographic__kpi-team set-stats-infographic__team--${teamSide}`}>
                    <span className="set-stats-infographic__team-name">{teamNames[teamSide]}</span>
                    <strong>{card.formatter(card.values[teamSide])}</strong>
                    <span className="set-stats-infographic__mini-bar" aria-hidden="true">
                      <span style={{ width: getBarWidth(card.values[teamSide], maxValue) }} />
                    </span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <div className="set-stats-infographic__dashboard-grid">
        <section className="set-stats-infographic__panel set-stats-infographic__panel--wide" aria-labelledby="player-ranking-title">
          <header className="set-stats-infographic__panel-header">
            <h4 id="player-ranking-title" className="set-stats-infographic__panel-title">{t('playerRanking')}</h4>
          </header>
          {players.length > 0 ? (
            <div className="set-stats-infographic__table-wrap">
              <table className="set-stats-infographic__table">
                <thead>
                  <tr>
                    <th scope="col">{t('team')}</th>
                    <th scope="col">{t('jerseyNumber')}</th>
                    <th scope="col">{t('player')}</th>
                    <th scope="col">{t('points')}</th>
                    <th scope="col">{t('attackPoints')}</th>
                    <th scope="col">{t('aces')}</th>
                    <th scope="col">{t('blockPoints')}</th>
                    <th scope="col">{t('errors')}</th>
                    {showPlayerReception ? <th scope="col">{t('receptionPositive')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.playerId}>
                      <td>{teamNames[player.teamSide]}</td>
                      <td>{player.jerseyNumber}</td>
                      <th scope="row">{player.playerName}</th>
                      <td>{player.points}</td>
                      <td>{player.attackPoints}</td>
                      <td>{player.aces}</td>
                      <td>{player.blockPoints}</td>
                      <td>{player.errors}</td>
                      {showPlayerReception ? (
                        <td>{formatPercentValue(getPlayerReceptionPositive(player), notAvailable)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="set-stats-infographic__empty">{notAvailable}</p>
          )}
        </section>

        {attackPoints.length > 0 ? (
          <section className="set-stats-infographic__panel" aria-labelledby="attack-efficiency-title">
            <header className="set-stats-infographic__panel-header">
              <h4 id="attack-efficiency-title" className="set-stats-infographic__panel-title">{t('attackEfficiency')}</h4>
            </header>
            <svg className="set-stats-infographic__attack-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-labelledby="attack-efficiency-title">
              <line
                className="set-stats-infographic__axis"
                x1={CHART_PADDING.left}
                y1={CHART_HEIGHT - CHART_PADDING.bottom}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
              />
              <line
                className="set-stats-infographic__axis"
                x1={CHART_PADDING.left}
                y1={CHART_PADDING.top}
                x2={CHART_PADDING.left}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
              />
              <line
                className="set-stats-infographic__zero-line"
                x1={CHART_PADDING.left}
                y1={CHART_PADDING.top + (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom) / 2}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y2={CHART_PADDING.top + (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom) / 2}
              />
              <text className="set-stats-infographic__axis-label" x={CHART_WIDTH / 2} y={CHART_HEIGHT - 8} textAnchor="middle">
                {t('attempts')}
              </text>
              <text className="set-stats-infographic__axis-label" x={16} y={CHART_HEIGHT / 2} textAnchor="middle" transform={`rotate(-90 16 ${CHART_HEIGHT / 2})`}>
                {t('efficiency')}
              </text>
              <text className="set-stats-infographic__tick-label" x={CHART_PADDING.left - 8} y={CHART_PADDING.top + 4} textAnchor="end">100%</text>
              <text className="set-stats-infographic__tick-label" x={CHART_PADDING.left - 8} y={CHART_PADDING.top + (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom) / 2 + 4} textAnchor="end">0%</text>
              <text className="set-stats-infographic__tick-label" x={CHART_PADDING.left - 8} y={CHART_HEIGHT - CHART_PADDING.bottom + 4} textAnchor="end">-100%</text>
              {attackPoints.map((point, index) => {
                const { x, y } = getAttackPointCoordinates(point, maxAttackAttempts);
                const tooltipX = x > CHART_WIDTH - 130 ? x - 116 : x + 12;
                const tooltipY = y < 54 ? y + 10 : y - 48;
                const tooltip = `${point.playerName}: ${t('attempts')} ${point.attempts}, ${t('points')} ${point.points}, ${t('errors')} ${point.errors}, ${t('efficiency')} ${formatPercentValue(point.efficiency, notAvailable)}`;

                return (
                  <g
                    key={point.id}
                    className={`set-stats-infographic__attack-point set-stats-infographic__attack-point--${point.teamSide}`}
                    tabIndex={0}
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <title>{tooltip}</title>
                    <circle cx={x} cy={y} r="6.5" />
                    <g className="set-stats-infographic__svg-tooltip" transform={`translate(${tooltipX} ${tooltipY})`}>
                      <rect width="108" height="40" rx="6" />
                      <text x="7" y="13">{point.playerName}</text>
                      <text x="7" y="27">{point.attempts} / {point.points} / {point.errors}</text>
                      <text x="7" y="38">{formatPercentValue(point.efficiency, notAvailable)}</text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </section>
        ) : null}

        <section className="set-stats-infographic__panel" aria-labelledby="points-by-skill-title">
          <header className="set-stats-infographic__panel-header">
            <h4 id="points-by-skill-title" className="set-stats-infographic__panel-title">{t('pointsBySkill')}</h4>
          </header>
          <div className="set-stats-infographic__bar-list">
            {pointSkillRows.map((row) => (
              <div key={row.id} className="set-stats-infographic__bar-row">
                <span className="set-stats-infographic__bar-label">{row.label}</span>
                <div className="set-stats-infographic__paired-bars">
                  {TEAM_SIDES.map((teamSide) => {
                    const tooltip = `${teamNames[teamSide]} - ${row.label}: ${row.values[teamSide]}`;

                    return (
                      <button
                        key={teamSide}
                        type="button"
                        className={`set-stats-infographic__bar set-stats-infographic__bar--${teamSide}`}
                        data-tooltip={tooltip}
                        aria-label={tooltip}
                      >
                        <span style={{ width: `${(row.values[teamSide] / maxPointSkillValue) * 100}%` }} />
                        <strong>{row.values[teamSide]}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="set-stats-infographic__panel" aria-labelledby="reception-quality-title">
          <header className="set-stats-infographic__panel-header">
            <h4 id="reception-quality-title" className="set-stats-infographic__panel-title">{t('receptionQuality')}</h4>
          </header>
          {hasReceptionQuality ? (
            <div className="set-stats-infographic__quality-list">
              {receptionQuality.map((row) => (
                <article key={row.teamSide} className={`set-stats-infographic__quality-card set-stats-infographic__team--${row.teamSide}`}>
                  <h5>{teamNames[row.teamSide]}</h5>
                  <div className="set-stats-infographic__quality-meter">
                    <span>{t('receptionPositive')}</span>
                    <button
                      type="button"
                      data-tooltip={`${teamNames[row.teamSide]} - ${t('receptionPositive')}: ${formatPercentValue(row.positive, notAvailable)}`}
                      aria-label={`${teamNames[row.teamSide]} - ${t('receptionPositive')}: ${formatPercentValue(row.positive, notAvailable)}`}
                    >
                      <span style={{ width: getBarWidth(row.positive, 1) }} />
                    </button>
                    <strong>{formatPercentValue(row.positive, notAvailable)}</strong>
                  </div>
                  <div className="set-stats-infographic__quality-meter">
                    <span>{t('receptionPerfect')}</span>
                    <button
                      type="button"
                      data-tooltip={`${teamNames[row.teamSide]} - ${t('receptionPerfect')}: ${formatPercentValue(row.perfect, notAvailable)}`}
                      aria-label={`${teamNames[row.teamSide]} - ${t('receptionPerfect')}: ${formatPercentValue(row.perfect, notAvailable)}`}
                    >
                      <span style={{ width: getBarWidth(row.perfect, 1) }} />
                    </button>
                    <strong>{formatPercentValue(row.perfect, notAvailable)}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="set-stats-infographic__empty">{notAvailable}</p>
          )}
        </section>

        <section className="set-stats-infographic__panel" aria-labelledby="error-distribution-title">
          <header className="set-stats-infographic__panel-header">
            <h4 id="error-distribution-title" className="set-stats-infographic__panel-title">{t('errorDistribution')}</h4>
          </header>
          <div className="set-stats-infographic__bar-list">
            {errorRows.map((row) => (
              <div key={row.id} className="set-stats-infographic__bar-row">
                <span className="set-stats-infographic__bar-label">{row.label}</span>
                <div className="set-stats-infographic__paired-bars">
                  {TEAM_SIDES.map((teamSide) => {
                    const tooltip = `${teamNames[teamSide]} - ${row.label}: ${row.values[teamSide]}`;

                    return (
                      <button
                        key={teamSide}
                        type="button"
                        className={`set-stats-infographic__bar set-stats-infographic__bar--${teamSide}`}
                        data-tooltip={tooltip}
                        aria-label={tooltip}
                      >
                        <span style={{ width: `${(row.values[teamSide] / maxErrorValue) * 100}%` }} />
                        <strong>{row.values[teamSide]}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {progression.length > 0 ? (
          <section className="set-stats-infographic__panel set-stats-infographic__panel--wide" aria-labelledby="set-progression-title">
            <header className="set-stats-infographic__panel-header">
              <h4 id="set-progression-title" className="set-stats-infographic__panel-title">{t('setProgression')}</h4>
            </header>
            <svg className="set-stats-infographic__progression-chart" viewBox={`0 0 ${PROGRESSION_WIDTH} ${PROGRESSION_HEIGHT}`} role="img" aria-labelledby="set-progression-title">
              <line
                className="set-stats-infographic__axis"
                x1={PROGRESSION_PADDING.left}
                y1={PROGRESSION_HEIGHT - PROGRESSION_PADDING.bottom}
                x2={PROGRESSION_WIDTH - PROGRESSION_PADDING.right}
                y2={PROGRESSION_HEIGHT - PROGRESSION_PADDING.bottom}
              />
              <line
                className="set-stats-infographic__axis"
                x1={PROGRESSION_PADDING.left}
                y1={PROGRESSION_PADDING.top}
                x2={PROGRESSION_PADDING.left}
                y2={PROGRESSION_HEIGHT - PROGRESSION_PADDING.bottom}
              />
              {TEAM_SIDES.map((teamSide) => (
                <path
                  key={teamSide}
                  className={`set-stats-infographic__progression-line set-stats-infographic__progression-line--${teamSide}`}
                  d={buildStepPath(progression, teamSide, progressionMaxScore)}
                  pathLength={1}
                />
              ))}
              {progression.slice(1).map((point, index) => TEAM_SIDES.map((teamSide) => {
                const coordinates = getProgressionPointCoordinates(point, index + 1, progression.length, progressionMaxScore, teamSide);
                const tooltip = `${t('rallyNumber')} ${point.rallyNumber}: ${teamNames.home} ${point.homeScore} - ${teamNames.away} ${point.awayScore}`;

                return (
                  <g
                    key={`${point.rallyNumber}-${teamSide}`}
                    className={`set-stats-infographic__progression-point set-stats-infographic__progression-point--${teamSide}`}
                    tabIndex={0}
                  >
                    <title>{tooltip}</title>
                    <circle cx={coordinates.x} cy={coordinates.y} r="4" />
                  </g>
                );
              }))}
              <text className="set-stats-infographic__axis-label" x={PROGRESSION_WIDTH / 2} y={PROGRESSION_HEIGHT - 5} textAnchor="middle">
                {t('rallySequence')}
              </text>
            </svg>
          </section>
        ) : null}
      </div>
    </section>
  );
}
