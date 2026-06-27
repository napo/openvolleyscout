import type { TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { getTeamsToShow, getFilteredTeamStats, getSelectedPlayer } from '../selectors/dashboard-selectors';
import {
  computeEfficiencyFromTeamStats,
  computeEfficiencyFromFilteredTeamStats,
  formatEfficiencyPct,
  formatCount,
  getEfficiencyColor,
  type EfficiencyMetrics,
} from '../metrics/dashboard-metrics';

function EfficiencyBar({ value }: { value: number | null }) {
  if (value === null) return <span className="perf-dashboard__eff-bar-empty">—</span>;
  const greenPct = Math.max(0, Math.min(100, value * 100));
  const tooltip = formatEfficiencyPct(value);
  return (
    <div className="perf-dashboard__eff-bar perf-dashboard__eff-bar--bicolor" title={tooltip}>
      <div
        className="perf-dashboard__eff-bar-fill perf-dashboard__eff-bar-fill--green"
        style={{ width: `${greenPct}%` }}
      />
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
  playerName,
}: {
  teamSide: TeamSide;
  metrics: EfficiencyMetrics;
  teamName: string;
  playerName?: string;
}) {
  const { t } = useTranslation();
  const title = playerName ? `${teamName} - ${playerName}` : teamName;

  return (
    <div className="perf-dashboard__eff-team">
      <h4 className="perf-dashboard__eff-team-title">{title}</h4>

      <div className="perf-dashboard__eff-section">
        <div className="perf-dashboard__eff-section-header">
          <span>{t('serve')}</span>
          <span className="perf-dashboard__eff-total">{formatCount(metrics.serveTotal)}</span>
        </div>
        <StatRow label={t('aces')} value={formatCount(metrics.serveAces)} />
        <StatRow label={t('serveErrors')} value={formatCount(metrics.serveErrors)} />
        <div className="perf-dashboard__eff-row-bar">
          <span>{t('efficiency')} <strong>{formatEfficiencyPct(metrics.serveEfficiency)}</strong></span>
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
          <span>{t('efficiency')} <strong>{formatEfficiencyPct(metrics.receptionEfficiency)}</strong></span>
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
          <span>{t('efficiency')} <strong>{formatEfficiencyPct(metrics.attackEfficiency)}</strong></span>
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
          <span>{t('efficiency')} <strong>{formatEfficiencyPct(metrics.blockEfficiency)}</strong></span>
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
  const teamsToShow = getTeamsToShow(stats, filters);
  const selectedPlayer = filters.player !== 'all' ? getSelectedPlayer(stats, filters.player) : null;
  const needsFiltered =
    filters.set !== 'all'
    || filters.source !== 'all'
    || filters.rallyPhase !== 'all'
    || filters.player !== 'all'
    || filters.role !== 'all';

  return (
    <section className="perf-dashboard__section" aria-label={t('efficiencyTitle')}>
      <h3 className="perf-dashboard__section-title">{t('efficiencyTitle')}</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: teamsToShow.length === 2 ? '1fr 1fr' : '1fr',
        gap: '20px',
      }}>
        {teamsToShow.map((teamSide) => {
          const opponentSide = teamSide === 'home' ? 'away' : 'home';
          let metrics: EfficiencyMetrics;
          let teamName: string;
          if (needsFiltered) {
            const filtered = getFilteredTeamStats(stats, filters, teamSide);
            const opponentFiltered = getFilteredTeamStats(stats, filters, opponentSide);
            teamName = filtered.teamName;
            metrics = computeEfficiencyFromFilteredTeamStats(filtered, opponentFiltered.skillStats.attack.total);
          } else {
            metrics = computeEfficiencyFromTeamStats(stats, teamSide);
            teamName = stats.teamStats[teamSide].teamName;
          }
          const playerName = selectedPlayer ? `#${selectedPlayer.jerseyNumber} ${selectedPlayer.playerName}` : undefined;
          return (
            <TeamEfficiency
              key={teamSide}
              teamSide={teamSide}
              metrics={metrics}
              teamName={teamName}
              playerName={playerName}
            />
          );
        })}
      </div>
    </section>
  );
}
