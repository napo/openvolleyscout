import { useTranslation } from '@src/i18n';
import type { PlayerStats } from '@src/features/scouting/model/match-stats';
import {
  computeEfficiencyFromFilteredTeamStats,
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

function PlayerEfficiencySection({
  metrics,
  playerName,
}: {
  metrics: EfficiencyMetrics;
  playerName: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="perf-dashboard__eff-team">
      <h4 className="perf-dashboard__eff-team-title">{playerName}</h4>

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

export function PlayerEfficiencyWidget({
  player,
}: {
  player: PlayerStats;
}) {
  const { t } = useTranslation();

  if (!player?.skillStats) {
    return (
      <section className="perf-dashboard__section" aria-label={t('efficiencyTitle')}>
        <h3 className="perf-dashboard__section-title">{t('efficiencyTitle')}</h3>
        <p className="perf-dashboard__empty">{t('noChartData')}</p>
      </section>
    );
  }

  const playerName = `${player.playerName} - #${player.jerseyNumber}`;

  // Convert player stats to EfficiencyMetrics format
  const metrics: EfficiencyMetrics = {
    serveTotal: player.skillStats.serve.total,
    serveAces: player.skillStats.serve.hash,
    serveErrors: player.skillStats.serve.equal,
    serveEfficiency: (player.skillStats.serve.hash - player.skillStats.serve.equal) / Math.max(1, player.skillStats.serve.total),

    receptionTotal: player.skillStats.receive.total,
    receptionPerfectPct: (player.skillStats.receive.hash / Math.max(1, player.skillStats.receive.total)).toFixed(1) + '%',
    receptionPositivePct: ((player.skillStats.receive.hash + player.skillStats.receive.plus) / Math.max(1, player.skillStats.receive.total)).toFixed(1) + '%',
    receptionErrors: player.skillStats.receive.equal,
    receptionEfficiency: (player.skillStats.receive.hash + player.skillStats.receive.plus - player.skillStats.receive.equal - player.skillStats.receive.minus) / Math.max(1, player.skillStats.receive.total),

    attackAttempts: player.skillStats.attack.total,
    attackPoints: player.skillStats.attack.hash,
    attackErrors: player.skillStats.attack.equal,
    attackBlocked: player.skillStats.attack.slash,
    attackKillPct: (player.skillStats.attack.hash / Math.max(1, player.skillStats.attack.total)).toFixed(1) + '%',
    attackEfficiency: (player.skillStats.attack.hash - player.skillStats.attack.equal) / Math.max(1, player.skillStats.attack.total),

    blockAttempts: player.skillStats.block.total,
    blockPoints: player.skillStats.block.hash,
    blockEfficiency: player.skillStats.block.hash / Math.max(1, player.skillStats.block.total),
  };

  return (
    <section className="perf-dashboard__section" aria-label={t('efficiencyTitle')}>
      <h3 className="perf-dashboard__section-title">{t('efficiencyTitle')}</h3>
      <PlayerEfficiencySection metrics={metrics} playerName={playerName} />
    </section>
  );
}
