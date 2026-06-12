import { useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats, PlayerStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { getFilteredRalliesForSituation } from '../selectors/dashboard-selectors';
import {
  computeSituationMetrics,
  computePlayerSituationContribution,
  computeSetPhaseTrend,
  computeSetPlayerPoints,
  type PhaseEfficiencyMetrics,
  type PhaseContribution,
} from '../situation/situation-metrics';

const PLAYER_BAR_COLOR = '#6366f1';

function formatPct(value: number | null): string {
  if (value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function pctColor(value: number | null): string {
  if (value === null) return 'var(--color-text-secondary)';
  if (value >= 0.55) return '#16a34a';
  if (value >= 0.45) return '#22c55e';
  if (value >= 0.35) return '#eab308';
  if (value >= 0.25) return '#f97316';
  return '#dc2626';
}

interface PlayerPhaseTileProps {
  label: string;
  team: PhaseEfficiencyMetrics;
  contribution: PhaseContribution;
  teamName: string;
  playerName: string;
}

function PlayerPhaseTile({ label, team, contribution, teamName, playerName }: PlayerPhaseTileProps) {
  const hasData = team.attempts > 0;

  return (
    <div className="perf-dashboard__sit-tile">
      <div className="perf-dashboard__sit-tile-header">{label}</div>
      {hasData ? (
        <div className="perf-dashboard__sit-tile-rows">
          <div className="perf-dashboard__sit-tile-row">
            <span className="perf-dashboard__sit-tile-team">{teamName}</span>
            <div className="perf-dashboard__sit-tile-bar-wrap">
              <div
                className="perf-dashboard__sit-tile-bar"
                style={{
                  width: team.pointPct !== null ? `${Math.min(team.pointPct * 100, 100)}%` : '0%',
                  backgroundColor: pctColor(team.pointPct),
                }}
              />
            </div>
            <span
              className="perf-dashboard__sit-tile-pct"
              style={{ color: pctColor(team.pointPct) }}
            >
              {formatPct(team.pointPct)}
            </span>
            <span className="perf-dashboard__sit-tile-counts">
              {team.pointsWon}/{team.attempts}
            </span>
          </div>
          <div className="perf-dashboard__sit-tile-row">
            <span className="perf-dashboard__sit-tile-team">{playerName}</span>
            <div className="perf-dashboard__sit-tile-bar-wrap">
              <div
                className="perf-dashboard__sit-tile-bar"
                style={{
                  width: contribution.playerShare !== null
                    ? `${Math.min(contribution.playerShare * 100, 100)}%`
                    : '0%',
                  backgroundColor: PLAYER_BAR_COLOR,
                }}
              />
            </div>
            <span
              className="perf-dashboard__sit-tile-pct"
              style={{ color: PLAYER_BAR_COLOR }}
            >
              {formatPct(contribution.playerShare)}
            </span>
            <span className="perf-dashboard__sit-tile-counts">
              {contribution.playerPoints}/{contribution.teamPointsWon}
            </span>
          </div>
        </div>
      ) : (
        <p className="perf-dashboard__empty">-</p>
      )}
    </div>
  );
}

interface PlayerSituationMetricsWidgetProps {
  stats: MatchStats;
  filters: DashboardFilters;
  player: PlayerStats;
}

export function PlayerSituationMetricsWidget({ stats, filters, player }: PlayerSituationMetricsWidgetProps) {
  const { t } = useTranslation();

  const rallies = useMemo(
    () => getFilteredRalliesForSituation(stats, { set: filters.set, rallyPhase: filters.rallyPhase }),
    [stats, filters.set, filters.rallyPhase],
  );

  const teamMetrics = useMemo(
    () => computeSituationMetrics(
      rallies,
      stats.teamStats.home.teamName,
      stats.teamStats.away.teamName,
    )[player.teamSide],
    [rallies, stats.teamStats.home.teamName, stats.teamStats.away.teamName, player.teamSide],
  );

  const contribution = useMemo(
    () => computePlayerSituationContribution(rallies, player.teamSide, player.playerId),
    [rallies, player.teamSide, player.playerId],
  );

  const trend = useMemo(
    () => computeSetPhaseTrend(rallies, player.teamSide),
    [rallies, player.teamSide],
  );

  const setPlayerPoints = useMemo(
    () => computeSetPlayerPoints(rallies, player.teamSide, player.playerId),
    [rallies, player.teamSide, player.playerId],
  );

  const teamName = stats.teamStats[player.teamSide].teamName;
  const playerName = `#${player.jerseyNumber} ${player.playerName}`;

  const tiles: Array<{ key: string; label: string; team: PhaseEfficiencyMetrics; contribution: PhaseContribution }> = [
    { key: 'sideOut', label: t('situationSideOut'), team: teamMetrics.sideOut, contribution: contribution.sideOut },
    { key: 'breakPoint', label: t('situationBreakPoint'), team: teamMetrics.breakPoint, contribution: contribution.breakPoint },
    { key: 'counterattack', label: t('situationCounterattack'), team: teamMetrics.counterattack, contribution: contribution.counterattack },
    { key: 'attackAfterReceive', label: t('situationAttackAfterReceive'), team: teamMetrics.attackAfterReceive, contribution: contribution.attackAfterReceive },
    { key: 'attackAfterDig', label: t('situationAttackAfterDig'), team: teamMetrics.attackAfterDig, contribution: contribution.attackAfterDig },
    { key: 'freeball', label: t('situationFreeball'), team: teamMetrics.freeball, contribution: contribution.freeball },
  ];

  return (
    <div className="perf-dashboard__section">
      <h3 className="perf-dashboard__section-title">{t('situationAnalytics')}</h3>

      <p className="perf-dashboard__sit-note">{t('situationPlayerContributionNote')}</p>

      {teamMetrics.unknownCount > 0 && (
        <div className="perf-dashboard__sit-unknown">
          {t('situationUnknownRallies', { count: teamMetrics.unknownCount })}
        </div>
      )}

      <div className="perf-dashboard__sit-grid">
        {tiles.map((tile) => (
          <PlayerPhaseTile
            key={tile.key}
            label={tile.label}
            team={tile.team}
            contribution={tile.contribution}
            teamName={teamName}
            playerName={playerName}
          />
        ))}
      </div>

      {trend.length > 1 && (
        <div className="perf-dashboard__sit-trends">
          <div className="perf-dashboard__sit-trend-team">
            <h4 className="perf-dashboard__team-section-title">{teamName}</h4>
            <div className="perf-dashboard__sit-trend-wrap">
              <table className="perf-dashboard__sit-trend-table">
                <thead>
                  <tr>
                    <th>{t('setLabel', { setNumber: '' }).trim()}</th>
                    <th>{t('sideOutPercentShort')}</th>
                    <th>{t('breakPointPercentShort')}</th>
                    <th>{t('situationPlayerPointsShort')}</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((row) => (
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
                      <td style={{ color: PLAYER_BAR_COLOR }}>
                        {setPlayerPoints[row.setNumber] ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
