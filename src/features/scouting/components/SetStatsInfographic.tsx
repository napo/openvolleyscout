import { useMemo } from 'react';
import type { TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { MatchStats, RallyStats } from '../model';
import { PlayerStatsByTeamTables } from './PlayerStatsByTeamTables';
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
  efficiencyPercent: number;
};

type ProgressionPoint = {
  step: number;
  rallyNumber: number;
  homeScore: number;
  awayScore: number;
};

type AttackTooltipLabels = {
  attempts: string;
  points: string;
  errors: string;
  efficiency: string;
};

const TEAM_SIDES = ['home', 'away'] as const;
const EMPTY_VALUE = '-';
const CHART_COLORS: Record<TeamSide | 'accent' | 'grid' | 'text', string> = {
  home: 'var(--color-primary)',
  away: 'var(--color-secondary)',
  accent: 'var(--color-accent)',
  grid: 'var(--set-stats-line-color)',
  text: 'var(--color-text-secondary)',
};

function getTeamName(team: Team, fallback: string): string {
  return team.name.trim() || fallback;
}

function formatPercentValue(value: NumericValue, notAvailable = EMPTY_VALUE): string {
  return value === null ? notAvailable : `${(value * 100).toFixed(1)}%`;
}

function formatPercentNumber(value: number | null, notAvailable = EMPTY_VALUE): string {
  return value === null ? notAvailable : `${value.toFixed(1)}%`;
}

function formatNumberValue(value: NumericValue, notAvailable = EMPTY_VALUE): string {
  return value === null ? notAvailable : String(value);
}

function formatChartValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  return String(value);
}

function getBarWidth(value: NumericValue, maxValue: number): string {
  if (value === null || maxValue <= 0) {
    return '0%';
  }

  return `${Math.max(0, Math.min(100, (value / maxValue) * 100))}%`;
}

function buildAttackPoints(players: MatchStats['quickStats']['players']): AttackPoint[] {
  return players.flatMap((player) => {
    if (player.attack.attempts <= 0 || player.attack.efficiency === null) {
      return [];
    }

    return [{
      id: player.playerId,
      teamSide: player.teamSide,
      playerName: player.playerName,
      attempts: player.attack.attempts,
      points: player.attack.points,
      errors: player.attack.errors,
      efficiency: player.attack.efficiency,
      efficiencyPercent: player.attack.efficiency * 100,
    }];
  });
}

function buildProgression(rallies: RallyStats[], completedSetScore: CompletedSetScore): ProgressionPoint[] {
  let homeScore = 0;
  let awayScore = 0;
  const points: ProgressionPoint[] = [{ step: 0, rallyNumber: 0, homeScore, awayScore }];

  rallies
    .filter((rally) => Boolean(rally.pointWinner))
    .forEach((rally) => {
      if (rally.pointWinner === 'home') {
        homeScore += 1;
      } else if (rally.pointWinner === 'away') {
        awayScore += 1;
      }

      points.push({
        step: points.length,
        rallyNumber: rally.rallyNumber,
        homeScore,
        awayScore,
      });
    });

  const finalPoint = points.at(-1);
  if (
    points.length <= 1
    || !finalPoint
    || finalPoint.homeScore !== completedSetScore.homeScore
    || finalPoint.awayScore !== completedSetScore.awayScore
  ) {
    return [];
  }

  return points;
}

function hasAnyValue(rows: TeamMetricRow[]): boolean {
  return rows.some((row) => TEAM_SIDES.some((teamSide) => row.values[teamSide] > 0));
}

function AttackTooltip({
  active,
  payload,
  labels,
}: {
  active?: boolean;
  payload?: Array<{ payload?: AttackPoint }>;
  labels: AttackTooltipLabels;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }

  return (
    <div className="set-stats-infographic__tooltip">
      <strong>{point.playerName}</strong>
      <span>{`${labels.attempts}: ${point.attempts}`}</span>
      <span>{`${labels.points}: ${point.points}`}</span>
      <span>{`${labels.errors}: ${point.errors}`}</span>
      <span>{`${labels.efficiency}: ${formatPercentValue(point.efficiency)}`}</span>
    </div>
  );
}

export function SetStatsInfographic({
  setNumber,
  homeTeam,
  awayTeam,
  setStats,
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
  const attackPoints = useMemo(
    () => buildAttackPoints(setStats.quickStats.players),
    [setStats.quickStats.players],
  );
  const homeAttackPoints = attackPoints.filter((point) => point.teamSide === 'home');
  const awayAttackPoints = attackPoints.filter((point) => point.teamSide === 'away');
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
  const receptionQuality = TEAM_SIDES.map((teamSide) => ({
    team: teamNames[teamSide],
    positive: teamQuickStats[teamSide].reception.efficiency === null
      ? null
      : teamQuickStats[teamSide].reception.efficiency * 100,
    perfect: teamQuickStats[teamSide].reception.perfectPercentage === null
      ? null
      : teamQuickStats[teamSide].reception.perfectPercentage * 100,
  }));
  const hasReceptionQuality = receptionQuality.some((row) => row.positive !== null || row.perfect !== null);
  const setRallies = useMemo(
    () => (rallyStats ?? setStats.rallyStats).filter((rally) => rally.setNumber === setNumber),
    [rallyStats, setNumber, setStats.rallyStats],
  );
  const progression = useMemo(
    () => buildProgression(setRallies, completedSetScore),
    [completedSetScore, setRallies],
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
        {hasAnyValue(pointSkillRows) ? (
          <section className="set-stats-infographic__panel" aria-labelledby="points-by-skill-title">
            <header className="set-stats-infographic__panel-header">
              <h4 id="points-by-skill-title" className="set-stats-infographic__panel-title">{t('pointsBySkill')}</h4>
            </header>
            <div className="set-stats-infographic__chart set-stats-infographic__chart--standard">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pointSkillRows} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={CHART_COLORS.text} />
                  <YAxis allowDecimals={false} stroke={CHART_COLORS.text} />
                  <Tooltip
                    formatter={(value, name) => [
                      formatChartValue(value),
                      String(name),
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="values.home" name={teamNames.home} fill={CHART_COLORS.home} radius={[4, 4, 0, 0]} isAnimationActive />
                  <Bar dataKey="values.away" name={teamNames.away} fill={CHART_COLORS.away} radius={[4, 4, 0, 0]} isAnimationActive />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {hasReceptionQuality ? (
          <section className="set-stats-infographic__panel" aria-labelledby="reception-quality-title">
            <header className="set-stats-infographic__panel-header">
              <h4 id="reception-quality-title" className="set-stats-infographic__panel-title">{t('receptionQuality')}</h4>
            </header>
            <div className="set-stats-infographic__chart set-stats-infographic__chart--standard">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={receptionQuality} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="team" stroke={CHART_COLORS.text} />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} stroke={CHART_COLORS.text} />
                  <Tooltip formatter={(value, name) => [formatPercentNumber(typeof value === 'number' ? value : null), String(name)]} />
                  <Legend />
                  <Bar dataKey="positive" name={t('receptionPositive')} fill={CHART_COLORS.home} radius={[4, 4, 0, 0]} isAnimationActive />
                  <Bar dataKey="perfect" name={t('receptionPerfect')} fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} isAnimationActive />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {attackPoints.length > 0 ? (
          <section className="set-stats-infographic__panel" aria-labelledby="attack-efficiency-title">
            <header className="set-stats-infographic__panel-header">
              <h4 id="attack-efficiency-title" className="set-stats-infographic__panel-title">{t('attackEfficiency')}</h4>
            </header>
            <div className="set-stats-infographic__chart set-stats-infographic__chart--standard">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 14, right: 14, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} />
                  <XAxis type="number" dataKey="attempts" name={t('attempts')} allowDecimals={false} stroke={CHART_COLORS.text} />
                  <YAxis type="number" dataKey="efficiencyPercent" name={t('efficiency')} domain={[-100, 100]} tickFormatter={(value) => `${value}%`} stroke={CHART_COLORS.text} />
                  <ZAxis range={[72, 72]} />
                  <Tooltip
                    content={(
                      <AttackTooltip
                        labels={{
                          attempts: t('attempts'),
                          points: t('points'),
                          errors: t('errors'),
                          efficiency: t('efficiency'),
                        }}
                      />
                    )}
                  />
                  <Legend />
                  <Scatter name={teamNames.home} data={homeAttackPoints} fill={CHART_COLORS.home} isAnimationActive />
                  <Scatter name={teamNames.away} data={awayAttackPoints} fill={CHART_COLORS.away} isAnimationActive />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {progression.length > 0 ? (
          <section className="set-stats-infographic__panel" aria-labelledby="set-progression-title">
            <header className="set-stats-infographic__panel-header">
              <h4 id="set-progression-title" className="set-stats-infographic__panel-title">{t('setProgression')}</h4>
            </header>
            <div className="set-stats-infographic__chart set-stats-infographic__chart--standard">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progression} margin={{ top: 14, right: 14, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="step" allowDecimals={false} stroke={CHART_COLORS.text} />
                  <YAxis allowDecimals={false} stroke={CHART_COLORS.text} />
                  <Tooltip
                    labelFormatter={(label) => `${t('rallyNumber')}: ${label}`}
                    formatter={(value, name) => [
                      formatChartValue(value),
                      String(name),
                    ]}
                  />
                  <Legend />
                  <Line type="stepAfter" dataKey="homeScore" name={teamNames.home} stroke={CHART_COLORS.home} strokeWidth={3} dot={false} isAnimationActive />
                  <Line type="stepAfter" dataKey="awayScore" name={teamNames.away} stroke={CHART_COLORS.away} strokeWidth={3} dot={false} isAnimationActive />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        <PlayerStatsByTeamTables
          stats={setStats}
          className="set-stats-infographic__panel set-stats-infographic__panel--wide"
        />
      </div>
    </section>
  );
}
