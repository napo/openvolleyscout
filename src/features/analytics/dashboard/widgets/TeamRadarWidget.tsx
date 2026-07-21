import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { createDefaultFilters } from '../filters/dashboard-filters';
import { getFilteredRalliesForSituation, getFilteredTeamStats } from '../selectors/dashboard-selectors';
import { computeSituationMetrics } from '../situation/situation-metrics';
import { RadarComparisonChart } from '../../radar/RadarComparisonChart';
import { computeRadarValuesFromSkillStats, DEFAULT_RADAR_AXIS_IDS, type RadarAxisId } from '../../radar/model/radar-metrics';
import type { RadarSeries, RadarScaleMode } from '../../radar/model/radar-normalization';

export interface TeamRadarWidgetProps {
  stats: MatchStats;
  filters?: DashboardFilters;
}

// Only `filters.set` is honored here: efficiency/side-out/break-point rates
// lose their meaning if decomposed by a single skill/evaluation/rotation
// filter, so those are intentionally ignored (unlike the other widgets).
export function TeamRadarWidget({ stats, filters }: TeamRadarWidgetProps) {
  const { t } = useTranslation();
  const [axisIds, setAxisIds] = useState<RadarAxisId[]>([...DEFAULT_RADAR_AXIS_IDS]);
  const [scaleMode, setScaleMode] = useState<RadarScaleMode>('fixed');

  const setFilter = filters?.set ?? 'all';

  const rallies = useMemo(
    () => getFilteredRalliesForSituation(stats, { set: setFilter }),
    [stats, setFilter],
  );

  const situationMetrics = useMemo(
    () => computeSituationMetrics(rallies, stats.teamStats.home.teamName, stats.teamStats.away.teamName),
    [rallies, stats.teamStats.home.teamName, stats.teamStats.away.teamName],
  );

  const series = useMemo<RadarSeries[]>(() => (['home', 'away'] as const).map((teamSide) => {
    const filteredTeamStats = getFilteredTeamStats(stats, { ...createDefaultFilters(), set: setFilter }, teamSide);
    const values = computeRadarValuesFromSkillStats(
      {
        serve: filteredTeamStats.skillStats.serve,
        receive: filteredTeamStats.skillStats.receive,
        attack: filteredTeamStats.skillStats.attack,
      },
      situationMetrics[teamSide].sideOut.pointPct,
      situationMetrics[teamSide].breakPoint.pointPct,
      undefined,
      situationMetrics[teamSide].firstBallSideOut.pointPct,
      situationMetrics[teamSide].firstBallPlay.pointPct,
      situationMetrics[teamSide].attackAfterDigKill.pointPct,
    );
    return { seriesId: teamSide, label: filteredTeamStats.teamName, values };
  }), [stats, setFilter, situationMetrics]);

  return (
    <div className="perf-dashboard__section">
      <RadarComparisonChart
        title={t('radarChartTitleTeam')}
        series={series}
        axisIds={axisIds}
        onAxisIdsChange={setAxisIds}
        scaleMode={scaleMode}
        onScaleModeChange={setScaleMode}
      />
    </div>
  );
}
