import { useTranslation } from '@src/i18n';
import type { MatchStats, PlayerStats } from '@src/features/scouting/model/match-stats';
import {
  computePlayerServeSummary,
  computePlayerReceptionSummary,
  computePlayerAttackSummary,
  computePlayerBlockSummary,
  computePlayerPointConversion,
  formatEfficiencyPct,
  formatCount,
  formatRatio,
  getEfficiencyColor,
} from '../metrics/dashboard-metrics';

function KpiBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="perf-dashboard__kpi">
      <span className="perf-dashboard__kpi-value">{value}</span>
      <span className="perf-dashboard__kpi-label">{label}</span>
      {sub ? <span className="perf-dashboard__kpi-sub">{sub}</span> : null}
    </div>
  );
}

function EffLine({ label, value }: { label: string; value: number | null }) {
  const color = getEfficiencyColor(value);
  return (
    <div className="perf-dashboard__stat-row">
      <span className="perf-dashboard__stat-label">{label}</span>
      <span className="perf-dashboard__stat-value" style={{ color }}>{formatEfficiencyPct(value)}</span>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="perf-dashboard__stat-row">
      <span className="perf-dashboard__stat-label">{label}</span>
      <span className="perf-dashboard__stat-value">{value}</span>
    </div>
  );
}

function PlayerServeSection({ player }: { player: PlayerStats }) {
  const { t } = useTranslation();
  const s = computePlayerServeSummary(player);
  if (s.total === 0) return null;

  return (
    <div className="perf-dashboard__player-section">
      <h5 className="perf-dashboard__player-section-title">{t('serve')}</h5>
      <div className="perf-dashboard__kpi-grid">
        <KpiBlock label={t('total')} value={formatCount(s.total)} />
        <KpiBlock label={t('aces')} value={formatCount(s.aces)} />
        <KpiBlock label={t('serveErrors')} value={formatCount(s.errors)} />
      </div>
      <EffLine label={t('efficiency')} value={s.efficiency} />
    </div>
  );
}

function PlayerReceptionSection({ player }: { player: PlayerStats }) {
  const { t } = useTranslation();
  const r = computePlayerReceptionSummary(player);
  if (r.total === 0) return null;

  return (
    <div className="perf-dashboard__player-section">
      <h5 className="perf-dashboard__player-section-title">{t('reception')}</h5>
      <div className="perf-dashboard__kpi-grid">
        <KpiBlock label={t('total')} value={formatCount(r.total)} />
        <KpiBlock label={t('perfect')} value={formatEfficiencyPct(r.perfectPct)} />
        <KpiBlock label={t('positive')} value={formatEfficiencyPct(r.positivePct)} />
        <KpiBlock label={t('errorsShort')} value={formatEfficiencyPct(r.errorPct)} />
      </div>
      <EffLine label={t('efficiency')} value={r.efficiency} />
    </div>
  );
}

function PlayerAttackSection({ player }: { player: PlayerStats }) {
  const { t } = useTranslation();
  const a = computePlayerAttackSummary(player);
  if (a.total === 0) return null;

  return (
    <div className="perf-dashboard__player-section">
      <h5 className="perf-dashboard__player-section-title">{t('attack')}</h5>
      <div className="perf-dashboard__kpi-grid">
        <KpiBlock label={t('attempts')} value={formatCount(a.total)} />
        <KpiBlock label={t('attackPoints')} value={formatCount(a.points)} />
        <KpiBlock label={t('attackErrors')} value={formatCount(a.errors)} />
        <KpiBlock label={t('blockedShort')} value={formatCount(a.blocked)} />
      </div>
      <StatLine label={t('killShort')} value={formatEfficiencyPct(a.killPct)} />
      <EffLine label={t('efficiency')} value={a.efficiency} />
    </div>
  );
}

function PlayerBlockSection({ player }: { player: PlayerStats }) {
  const { t } = useTranslation();
  const b = computePlayerBlockSummary(player);
  if (b.total === 0) return null;

  return (
    <div className="perf-dashboard__player-section">
      <h5 className="perf-dashboard__player-section-title">{t('block')}</h5>
      <div className="perf-dashboard__kpi-grid">
        <KpiBlock label={t('attempts')} value={formatCount(b.total)} />
        <KpiBlock label={t('blockPoints')} value={formatCount(b.points)} />
      </div>
    </div>
  );
}

function PlayerPointConversionSection({
  player,
  conversion,
}: {
  player: PlayerStats;
  conversion: { servesPerPoint: number | null; receptionsPerPoint: number | null };
}) {
  const { t } = useTranslation();
  const rows: Array<{ key: string; label: string; value: string }> = [];
  if (player.receive.total > 0) {
    rows.push({
      key: 'receptions',
      label: t('receptionsPerPointLabel'),
      value: formatRatio(conversion.receptionsPerPoint),
    });
  }
  if (player.serve.total > 0) {
    rows.push({
      key: 'serves',
      label: t('servesPerPointLabel'),
      value: formatRatio(conversion.servesPerPoint),
    });
  }
  if (rows.length === 0) return null;

  return (
    <div className="perf-dashboard__player-section">
      <h5 className="perf-dashboard__player-section-title">{t('mediaServeReception')}</h5>
      {rows.map((row) => (
        <StatLine key={row.key} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

function PlayerVsTeam({
  player,
  stats,
}: {
  player: PlayerStats;
  stats: MatchStats;
}) {
  const { t } = useTranslation();
  const teamStats = stats.teamStats[player.teamSide];
  const teamPlayers = stats.playerStats.filter(
    (p) => p.teamSide === player.teamSide && !p.playerId.startsWith('__'),
  );

  const metrics: Array<{ label: string; playerVal: number; teamVal: number }> = [
    { label: t('aces'), playerVal: player.aces, teamVal: teamStats.aces },
    { label: t('attackPoints'), playerVal: player.attackPoints, teamVal: teamStats.attackPoints },
    { label: t('blockPoints'), playerVal: player.blockPoints, teamVal: teamStats.blockPoints },
    { label: t('serveErrors'), playerVal: player.serveErrors, teamVal: teamStats.serveErrors },
    { label: t('receptionErrors'), playerVal: player.receptionErrors, teamVal: teamStats.receptionErrors },
    { label: t('attackErrors'), playerVal: player.attackErrors, teamVal: teamStats.attackErrors },
  ].filter((m) => m.teamVal > 0);

  if (metrics.length === 0) return null;

  const teamSize = teamPlayers.length;

  return (
    <div className="perf-dashboard__player-section">
      <h5 className="perf-dashboard__player-section-title">{t('playerComparison')}</h5>
      <div className="perf-dashboard__comparison-note">
        <div>{t('playerContributionFor')}</div>
        <div className="perf-dashboard__comparison-team-name">{teamStats.teamName}</div>
      </div>
      <div className="perf-dashboard__comparison-grid">
        {metrics.map((m) => {
          const teamAvg = teamSize > 0 ? m.teamVal / teamSize : 0;
          const pctOfTeam = m.teamVal > 0 ? (m.playerVal / m.teamVal) * 100 : 0;
          return (
            <div key={m.label} className="perf-dashboard__comparison-row">
              <span className="perf-dashboard__comparison-label">{m.label}</span>
              <span className="perf-dashboard__comparison-player">{m.playerVal}</span>
              <span className="perf-dashboard__comparison-team">
                {t('totalShort')}: {m.teamVal} ({pctOfTeam.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlayerAnalyticsWidget({
  stats,
  player,
}: {
  stats: MatchStats;
  player: PlayerStats;
}) {
  const { t } = useTranslation();
  const teamName = stats.teamStats[player.teamSide].teamName;
  const roleName = player.role ? t(player.role as Parameters<typeof t>[0]) : null;
  const conversion = computePlayerPointConversion(stats, player);

  return (
    <section className="perf-dashboard__section perf-dashboard__player-analytics" aria-label={t('playerAnalytics')}>
      <header className="perf-dashboard__player-header">
        <div className="perf-dashboard__player-identity">
          <span className="perf-dashboard__player-number">#{player.jerseyNumber}</span>
          <div>
            <h3 className="perf-dashboard__player-name">{player.playerName}</h3>
            <div className="perf-dashboard__player-meta">
              <span>{teamName}</span>
              {roleName ? <span className="perf-dashboard__player-role">{roleName}</span> : null}
            </div>
          </div>
        </div>
        <div className="perf-dashboard__player-totals">
          <KpiBlock label={t('points')} value={formatCount(player.points)} />
          <KpiBlock label={t('errors')} value={formatCount(player.errors)} />
          <KpiBlock label={t('totalTouches')} value={formatCount(player.totalTouches)} />
        </div>
      </header>

      <div className="perf-dashboard__player-sections">
        <PlayerServeSection player={player} />
        <PlayerReceptionSection player={player} />
        <PlayerAttackSection player={player} />
        <PlayerBlockSection player={player} />
        <PlayerPointConversionSection player={player} conversion={conversion} />
        <PlayerVsTeam player={player} stats={stats} />
      </div>
    </section>
  );
}
