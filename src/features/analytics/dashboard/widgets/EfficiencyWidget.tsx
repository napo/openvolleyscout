import type { TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { getTeamsToShow } from '../selectors/dashboard-selectors';
import {
  computeEfficiencyFromTeamStats,
  formatEfficiencyPct,
  formatCount,
  getEfficiencyColor,
  type EfficiencyMetrics,
} from '../metrics/dashboard-metrics';

function EfficiencyBar({ value }: { value: number | null }) {
  if (value === null) return <span className="perf-dashboard__eff-bar-empty">—</span>;
  const pct = Math.max(0, Math.min(1, (value + 1) / 2));
  const color = getEfficiencyColor(value);
  return (
    <div className="perf-dashboard__eff-bar">
      <div
        className="perf-dashboard__eff-bar-fill"
        style={{ width: `${pct * 100}%`, background: color }}
      />
      <span className="perf-dashboard__eff-bar-label" style={{ color }}>
        {formatEfficiencyPct(value)}
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="perf-dashboard__stat-row">
      <span className="perf-dashboard__stat-label">{label}</span>
      <span className="perf-dashboard__stat-value">{value}</span>
    </div>
  );
}

function TeamEfficiency({
  teamSide,
  metrics,
  teamName,
}: {
  teamSide: TeamSide;
  metrics: EfficiencyMetrics;
  teamName: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="perf-dashboard__eff-team">
      <h4 className="perf-dashboard__eff-team-title">{teamName}</h4>

      <div className="perf-dashboard__eff-section">
        <div className="perf-dashboard__eff-section-header">
          <span>{t('serve')}</span>
          <span className="perf-dashboard__eff-total">{formatCount(metrics.serveTotal)}</span>
        </div>
        <StatRow label={t('aces')} value={formatCount(metrics.serveAces)} />
        <StatRow label={t('serveErrors')} value={formatCount(metrics.serveErrors)} />
        <div className="perf-dashboard__eff-row-bar">
          <span>{t('efficiency')}</span>
          <EfficiencyBar value={metrics.serveEfficiency} />
        </div>
      </div>

      <div className="perf-dashboard__eff-section">
        <div className="perf-dashboard__eff-section-header">
          <span>{t('reception')}</span>
          <span className="perf-dashboard__eff-total">{formatCount(metrics.receptionTotal)}</span>
        </div>
        <StatRow label={t('perfect')} value={formatEfficiencyPct(metrics.receptionPerfectPct)} />
        <StatRow label={t('positive')} value={formatEfficiencyPct(metrics.receptionPositivePct)} />
        <StatRow label={t('receptionErrors')} value={formatCount(metrics.receptionErrors)} />
        <div className="perf-dashboard__eff-row-bar">
          <span>{t('efficiency')}</span>
          <EfficiencyBar value={metrics.receptionEfficiency} />
        </div>
      </div>

      <div className="perf-dashboard__eff-section">
        <div className="perf-dashboard__eff-section-header">
          <span>{t('attack')}</span>
          <span className="perf-dashboard__eff-total">{formatCount(metrics.attackAttempts)}</span>
        </div>
        <StatRow label={t('attackPoints')} value={formatCount(metrics.attackPoints)} />
        <StatRow label={t('attackErrors')} value={formatCount(metrics.attackErrors)} />
        <StatRow label={t('blockedShort')} value={formatCount(metrics.attackBlocked)} />
        <StatRow label={t('killShort')} value={formatEfficiencyPct(metrics.attackKillPct)} />
        <div className="perf-dashboard__eff-row-bar">
          <span>{t('efficiency')}</span>
          <EfficiencyBar value={metrics.attackEfficiency} />
        </div>
      </div>

      <div className="perf-dashboard__eff-section">
        <div className="perf-dashboard__eff-section-header">
          <span>{t('block')}</span>
          <span className="perf-dashboard__eff-total">{formatCount(metrics.blockAttempts)}</span>
        </div>
        <StatRow label={t('blockPoints')} value={formatCount(metrics.blockPoints)} />
        <div className="perf-dashboard__eff-row-bar">
          <span>{t('efficiency')}</span>
          <EfficiencyBar value={metrics.blockEfficiency} />
        </div>
      </div>
    </div>
  );
}

export function EfficiencyWidget({
  stats,
  filters,
}: {
  stats: MatchStats;
  filters: DashboardFilters;
}) {
  const { t } = useTranslation();
  const teamsToShow = getTeamsToShow(filters);

  return (
    <section className="perf-dashboard__section" aria-label={t('efficiencyTitle')}>
      <h3 className="perf-dashboard__section-title">{t('efficiencyTitle')}</h3>
      <div className="perf-dashboard__eff-grid">
        {teamsToShow.map((teamSide) => {
          const metrics = computeEfficiencyFromTeamStats(stats, teamSide);
          const teamName = stats.teamStats[teamSide].teamName;
          return (
            <TeamEfficiency
              key={teamSide}
              teamSide={teamSide}
              metrics={metrics}
              teamName={teamName}
            />
          );
        })}
      </div>
    </section>
  );
}
