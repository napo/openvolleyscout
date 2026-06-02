import { useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { getFilteredRalliesForSituation, getSelectedPlayer } from '../selectors/dashboard-selectors';
import {
  computeSituationMetrics,
  computeSetPhaseTrend,
  type PhaseEfficiencyMetrics,
  type TeamSituationMetrics,
} from '../situation/situation-metrics';
import { safeDivide } from '@src/features/scouting/model/match-stats';

function formatPct(value: number | null): string {
  if (value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) return '-';
  return value.toFixed(1);
}

function pctColor(value: number | null): string {
  if (value === null) return 'var(--color-text-secondary)';
  if (value >= 0.55) return '#16a34a';
  if (value >= 0.45) return '#22c55e';
  if (value >= 0.35) return '#eab308';
  if (value >= 0.25) return '#f97316';
  return '#dc2626';
}

interface PhaseTileProps {
  label: string;
  home: PhaseEfficiencyMetrics;
  away: PhaseEfficiencyMetrics;
  homeTeamName: string;
  awayTeamName: string;
}

function PhaseTile({ label, home, away, homeTeamName, awayTeamName }: PhaseTileProps) {
  const hasData = home.attempts > 0 || away.attempts > 0;

  return (
    <div className="perf-dashboard__sit-tile">
      <div className="perf-dashboard__sit-tile-header">{label}</div>
      {hasData ? (
        <div className="perf-dashboard__sit-tile-rows">
          {[{ m: home, name: homeTeamName }, { m: away, name: awayTeamName }].map(({ m, name }) => (
            <div key={name} className="perf-dashboard__sit-tile-row">
              <span className="perf-dashboard__sit-tile-team">{name}</span>
              <div className="perf-dashboard__sit-tile-bar-wrap">
                <div
                  className="perf-dashboard__sit-tile-bar"
                  style={{
                    width: m.pointPct !== null ? `${Math.min(m.pointPct * 100, 100)}%` : '0%',
                    backgroundColor: pctColor(m.pointPct),
                  }}
                />
              </div>
              <span
                className="perf-dashboard__sit-tile-pct"
                style={{ color: pctColor(m.pointPct) }}
              >
                {formatPct(m.pointPct)}
              </span>
              <span className="perf-dashboard__sit-tile-counts">
                {m.pointsWon}/{m.attempts}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="perf-dashboard__empty">-</p>
      )}
    </div>
  );
}

interface UnknownBannerProps {
  count: number;
}

function UnknownBanner({ count }: UnknownBannerProps) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div className="perf-dashboard__sit-unknown">
      {t('situationUnknownRallies', { count })}
    </div>
  );
}

interface TeamTrendTableProps {
  metrics: TeamSituationMetrics;
  rallies: ReturnType<typeof computeSetPhaseTrend>;
}

function TeamTrendTable({ metrics, rallies }: TeamTrendTableProps) {
  const { t } = useTranslation();
  if (rallies.length === 0) return null;

  return (
    <div className="perf-dashboard__sit-trend-wrap">
      <table className="perf-dashboard__sit-trend-table">
        <thead>
          <tr>
            <th>{t('setLabel', { setNumber: '' }).trim()}</th>
            <th>{t('sideOutPercentShort')}</th>
            <th>{t('breakPointPercentShort')}</th>
          </tr>
        </thead>
        <tbody>
          {rallies.map((row) => (
            <tr key={row.setNumber}>
              <td>{row.setNumber}</td>
              <td style={{ color: pctColor(row.sideOutPct) }}>
                {formatPct(row.sideOutPct)}
                <span className="perf-dashboard__sit-trend-sub">
                  {' '}({row.sideOutWins}/{row.sideOutAttempts})
                </span>
              </td>
              <td style={{ color: pctColor(row.breakPointPct) }}>
                {formatPct(row.breakPointPct)}
                <span className="perf-dashboard__sit-trend-sub">
                  {' '}({row.breakPointWins}/{row.breakPointAttempts})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SituationMetricsWidgetProps {
  stats: MatchStats;
  filters: DashboardFilters;
}

export function SituationMetricsWidget({ stats, filters }: SituationMetricsWidgetProps) {
  const { t } = useTranslation();

  const rallies = useMemo(
    () => getFilteredRalliesForSituation(stats, { set: filters.set, rallyPhase: filters.rallyPhase }),
    [stats, filters.set, filters.rallyPhase],
  );

  const metrics = useMemo(
    () => computeSituationMetrics(
      rallies,
      stats.teamStats.home.teamName,
      stats.teamStats.away.teamName,
    ),
    [rallies, stats.teamStats.home.teamName, stats.teamStats.away.teamName],
  );

  const homeTrend = useMemo(
    () => computeSetPhaseTrend(rallies, 'home'),
    [rallies],
  );

  const awayTrend = useMemo(
    () => computeSetPhaseTrend(rallies, 'away'),
    [rallies],
  );

  const selectedPlayer = filters.player !== 'all' ? getSelectedPlayer(stats, filters.player) : null;
  const playerSuffix = selectedPlayer ? ` - #${selectedPlayer.jerseyNumber} ${selectedPlayer.playerName}` : '';
  const homeTeamName = stats.teamStats.home.teamName + playerSuffix;
  const awayTeamName = stats.teamStats.away.teamName + playerSuffix;
  const unknownCount = Math.max(metrics.home.unknownCount, metrics.away.unknownCount);

  const servesPerPoint = useMemo(() => ({
    home: safeDivide(stats.teamStats.home.serve.total, stats.breakPointStats.home.breakPointWins),
    away: safeDivide(stats.teamStats.away.serve.total, stats.breakPointStats.away.breakPointWins),
  }), [stats]);

  const receptionsPerPoint = useMemo(() => ({
    home: safeDivide(stats.teamStats.home.receive.total, stats.sideOutStats.home.sideOutWins),
    away: safeDivide(stats.teamStats.away.receive.total, stats.sideOutStats.away.sideOutWins),
  }), [stats]);

  return (
    <div className="perf-dashboard__section">
      <h3 className="perf-dashboard__section-title">{t('situationAnalytics')}</h3>

      <UnknownBanner count={unknownCount} />

      <div className="perf-dashboard__sit-grid">
        <PhaseTile
          label={t('situationSideOut')}
          home={metrics.home.sideOut}
          away={metrics.away.sideOut}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
        <PhaseTile
          label={t('situationBreakPoint')}
          home={metrics.home.breakPoint}
          away={metrics.away.breakPoint}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
        <PhaseTile
          label={t('situationCounterattack')}
          home={metrics.home.counterattack}
          away={metrics.away.counterattack}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
        <PhaseTile
          label={t('situationAttackAfterReceive')}
          home={metrics.home.attackAfterReceive}
          away={metrics.away.attackAfterReceive}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
        <PhaseTile
          label={t('situationAttackAfterDig')}
          home={metrics.home.attackAfterDig}
          away={metrics.away.attackAfterDig}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
        <PhaseTile
          label={t('situationFreeball')}
          home={metrics.home.freeball}
          away={metrics.away.freeball}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
      </div>

      <div className="perf-dashboard__sit-efficiency-ratios">
        <div className="perf-dashboard__sit-tile">
          <div className="perf-dashboard__sit-tile-header">{t('receptionsPerPointLabel')}</div>
          <div className="perf-dashboard__sit-tile-rows">
            <div className="perf-dashboard__sit-tile-row">
              <span className="perf-dashboard__sit-tile-team">{homeTeamName}</span>
              <span className="perf-dashboard__sit-tile-ratio">{formatRatio(receptionsPerPoint.home)}</span>
            </div>
            <div className="perf-dashboard__sit-tile-row">
              <span className="perf-dashboard__sit-tile-team">{awayTeamName}</span>
              <span className="perf-dashboard__sit-tile-ratio">{formatRatio(receptionsPerPoint.away)}</span>
            </div>
          </div>
        </div>
        <div className="perf-dashboard__sit-tile">
          <div className="perf-dashboard__sit-tile-header">{t('servesPerPointLabel')}</div>
          <div className="perf-dashboard__sit-tile-rows">
            <div className="perf-dashboard__sit-tile-row">
              <span className="perf-dashboard__sit-tile-team">{homeTeamName}</span>
              <span className="perf-dashboard__sit-tile-ratio">{formatRatio(servesPerPoint.home)}</span>
            </div>
            <div className="perf-dashboard__sit-tile-row">
              <span className="perf-dashboard__sit-tile-team">{awayTeamName}</span>
              <span className="perf-dashboard__sit-tile-ratio">{formatRatio(servesPerPoint.away)}</span>
            </div>
          </div>
        </div>
      </div>

      {rallies.some((r) => r.setNumber) && stats.setStats.length > 1 && (
        <div className="perf-dashboard__sit-trends">
          <div className="perf-dashboard__sit-trend-team">
            <h4 className="perf-dashboard__team-section-title">{homeTeamName}</h4>
            <TeamTrendTable metrics={metrics.home} rallies={homeTrend} />
          </div>
          <div className="perf-dashboard__sit-trend-team">
            <h4 className="perf-dashboard__team-section-title">{awayTeamName}</h4>
            <TeamTrendTable metrics={metrics.away} rallies={awayTrend} />
          </div>
        </div>
      )}
    </div>
  );
}
