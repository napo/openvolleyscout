import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats, PlayerStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { getFilteredRalliesForSituation, getTeamPlayerStats } from '../selectors/dashboard-selectors';
import { RadarComparisonChart } from '../../radar/RadarComparisonChart';
import {
  computePlayerRadarValues,
  computeTeamRadarValues,
  DEFAULT_RADAR_AXIS_IDS,
  type RadarAxisId,
} from '../../radar/model/radar-metrics';
import type { RadarSeries, RadarScaleMode } from '../../radar/model/radar-normalization';

export interface PlayerRadarWidgetProps {
  stats: MatchStats;
  player: PlayerStats;
  filters?: DashboardFilters;
}

// Always compares the focus player against their own team; teammates can be
// added as extra overlay series. Only `filters.set` is honored (mirrors
// TeamRadarWidget).
export function PlayerRadarWidget({ stats, player, filters }: PlayerRadarWidgetProps) {
  const { t } = useTranslation();
  const [axisIds, setAxisIds] = useState<RadarAxisId[]>([...DEFAULT_RADAR_AXIS_IDS]);
  const [scaleMode, setScaleMode] = useState<RadarScaleMode>('fixed');
  const [overlayPlayerIds, setOverlayPlayerIds] = useState<Set<string>>(new Set());

  const setFilter = filters?.set ?? 'all';

  const rallies = useMemo(
    () => getFilteredRalliesForSituation(stats, { set: setFilter }),
    [stats, setFilter],
  );

  const teammates = useMemo(
    () => getTeamPlayerStats(stats, player.teamSide).filter((p) => p.playerId !== player.playerId),
    [stats, player.teamSide, player.playerId],
  );

  const toggleOverlay = (playerId: string) => {
    setOverlayPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const series = useMemo<RadarSeries[]>(() => {
    const team: RadarSeries = {
      seriesId: `team:${player.teamSide}`,
      label: stats.teamStats[player.teamSide].teamName,
      values: computeTeamRadarValues(stats, player.teamSide, rallies),
    };
    const focus: RadarSeries = {
      seriesId: player.playerId,
      label: `#${player.jerseyNumber} ${player.playerName}`,
      values: computePlayerRadarValues(stats, player, rallies),
    };
    const overlays = teammates
      .filter((p) => overlayPlayerIds.has(p.playerId))
      .map((p) => ({
        seriesId: p.playerId,
        label: `#${p.jerseyNumber} ${p.playerName}`,
        values: computePlayerRadarValues(stats, p, rallies),
      }));
    return [team, focus, ...overlays];
  }, [stats, player, rallies, teammates, overlayPlayerIds]);

  return (
    <div className="perf-dashboard__section">
      {teammates.length > 0 && (
        <div className="radar-chart__axis-picker" role="group" aria-label={t('radarAddPlayer')}>
          {teammates.map((p) => (
            <label key={p.playerId} className="radar-chart__axis-option">
              <input
                type="checkbox"
                checked={overlayPlayerIds.has(p.playerId)}
                onChange={() => toggleOverlay(p.playerId)}
              />
              {`#${p.jerseyNumber} ${p.playerName}`}
            </label>
          ))}
        </div>
      )}
      <RadarComparisonChart
        title={t('radarChartTitlePlayer')}
        series={series}
        axisIds={axisIds}
        onAxisIdsChange={setAxisIds}
        scaleMode={scaleMode}
        onScaleModeChange={setScaleMode}
      />
    </div>
  );
}
