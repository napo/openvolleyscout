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

  if (!player?.serve) {
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
    serveTotal: player.serve.total,
    serveAces: player.serve.hash,
    serveErrors: player.serve.equal,
    serveEfficiency: (player.serve.hash - player.serve.equal) / Math.max(1, player.serve.total),

    receptionTotal: player.receive.total,
    receptionPerfectPct: parseFloat((player.receive.hash / Math.max(1, player.receive.total)).toFixed(1)),
    receptionPositivePct: parseFloat(((player.receive.hash + player.receive.plus) / Math.max(1, player.receive.total)).toFixed(1)),
    receptionErrors: player.receive.equal,
    receptionEfficiency: (player.receive.hash + player.receive.plus - player.receive.equal - player.receive.minus) / Math.max(1, player.receive.total),

    attackAttempts: player.attack.total,
    attackPoints: player.attack.hash,
    attackErrors: player.attack.equal,
    attackBlocked: player.attack.slash,
    attackKillPct: parseFloat((player.attack.hash / Math.max(1, player.attack.total)).toFixed(1)),
    attackEfficiency: (player.attack.hash - player.attack.equal) / Math.max(1, player.attack.total),

    blockAttempts: player.block.total,
    blockPoints: player.block.hash,
    blockEfficiency: player.block.hash / Math.max(1, player.block.total),
  };

  return (
    <section className="perf-dashboard__section" aria-label={t('efficiencyTitle')}>
      <h3 className="perf-dashboard__section-title">{t('efficiencyTitle')}</h3>
      <PlayerEfficiencySection metrics={metrics} playerName={playerName} />
    </section>
  );
}
