import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../../dashboard/filters/dashboard-filters';
import {
  createDefaultHeatmapFilters,
  HEATMAP_SKILLS,
  type HeatmapWidgetFilters,
} from '../filters/heatmap-filters';
import {
  getHeatmapSelectionResult,
  getHeatmapSelectionResultForTeam,
} from '../selectors/heatmap-selectors';
import {
  buildDensityGrid,
  type HeatmapDensityGrid,
  type HeatmapEvent,
} from '../aggregation/heatmap-aggregation';
import { HeatmapCourtSvg } from '../rendering/HeatmapCourtSvg';
import './heatmap.css';

interface HeatmapWidgetProps {
  stats: MatchStats;
  filters: DashboardFilters;
}

export function HeatmapWidget({ stats, filters }: HeatmapWidgetProps) {
  const { t } = useTranslation();
  const [heatFilters, setHeatFilters] = useState<HeatmapWidgetFilters>(createDefaultHeatmapFilters);
  const [hoveredCell, setHoveredCell] = useState<HeatmapDensityGrid['cells'][number] | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<HeatmapEvent | null>(null);

  const showBothTeams = filters.team === 'all' && heatFilters.mode !== 'direction';
  const singleTeam = filters.team !== 'all' ? filters.team : undefined;

  // Combined events (all teams) for direction mode and diagnostics
  const { events, totalTouches, inferredCount, coverageRate } = useMemo(
    () => getHeatmapSelectionResult(stats, filters, heatFilters.skill),
    [stats, filters, heatFilters.skill],
  );

  // Per-team events for half-court mode
  const homeResult = useMemo(
    () => showBothTeams
      ? getHeatmapSelectionResultForTeam(stats, filters, heatFilters.skill, 'home')
      : null,
    [stats, filters, heatFilters.skill, showBothTeams],
  );

  const awayResult = useMemo(
    () => showBothTeams
      ? getHeatmapSelectionResultForTeam(stats, filters, heatFilters.skill, 'away')
      : null,
    [stats, filters, heatFilters.skill, showBothTeams],
  );

  // Single-team events for single half-court mode
  const singleTeamEvents = useMemo(() => {
    if (showBothTeams || !singleTeam) return events;
    return events.filter((ev) => ev.teamSide === singleTeam);
  }, [events, showBothTeams, singleTeam]);

  // Density grids
  const useEndPoint = heatFilters.endpoint === 'end';
  const homeGrid = useMemo(
    () => heatFilters.mode === 'density' && homeResult
      ? buildDensityGrid(homeResult.events, useEndPoint)
      : null,
    [homeResult, heatFilters.mode, useEndPoint],
  );
  const awayGrid = useMemo(
    () => heatFilters.mode === 'density' && awayResult
      ? buildDensityGrid(awayResult.events, useEndPoint)
      : null,
    [awayResult, heatFilters.mode, useEndPoint],
  );
  const singleGrid = useMemo(
    () => heatFilters.mode === 'density' && !showBothTeams
      ? buildDensityGrid(singleTeamEvents, useEndPoint)
      : null,
    [singleTeamEvents, heatFilters.mode, useEndPoint, showBothTeams],
  );

  const homeLabel = stats.teamStats.home.teamName;
  const awayLabel = stats.teamStats.away.teamName;
  const lowCoverageWarning = totalTouches > 0 && coverageRate < 0.5;

  return (
    <section className="heatmap-widget" aria-label={t('heatmapTitle')}>
      <h3 className="heatmap-widget__title">{t('heatmapTitle')}</h3>

      {/* Toolbar */}
      <div className="heatmap-widget__toolbar">
        <div className="heatmap-widget__toolbar-group">
          <label className="heatmap-widget__toolbar-label" htmlFor="heatmap-skill">
            {t('heatmapSkillFilter')}
          </label>
          <select
            id="heatmap-skill"
            className="heatmap-widget__toolbar-select"
            value={heatFilters.skill}
            onChange={(e) => setHeatFilters((f) => ({ ...f, skill: e.target.value as HeatmapWidgetFilters['skill'] }))}
          >
            <option value="all">{t('heatmapSkillAll')}</option>
            {HEATMAP_SKILLS.map((s) => (
              <option key={s} value={s}>{t(`skill${s.charAt(0).toUpperCase()}${s.slice(1)}` as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>

        <div className="heatmap-widget__toolbar-group">
          <span className="heatmap-widget__toolbar-label">{t('heatmapMode')}</span>
          <div className="heatmap-widget__mode-buttons" role="group" aria-label={t('heatmapMode')}>
            {(['density', 'point', 'direction'] as const).map((mode) => {
              const labelKey = mode === 'density'
                ? 'heatmapModeDensity'
                : mode === 'point'
                  ? 'heatmapModePoints'
                  : 'heatmapModeDirection';
              return (
                <button
                  key={mode}
                  type="button"
                  className={`heatmap-widget__mode-btn${heatFilters.mode === mode ? ' heatmap-widget__mode-btn--active' : ''}`}
                  onClick={() => setHeatFilters((f) => ({ ...f, mode }))}
                  aria-pressed={heatFilters.mode === mode}
                >
                  {t(labelKey as Parameters<typeof t>[0])}
                </button>
              );
            })}
          </div>
        </div>

        {heatFilters.mode !== 'direction' && (
          <div className="heatmap-widget__toolbar-group">
            <span className="heatmap-widget__toolbar-label">{t('heatmapEndpoint')}</span>
            <div className="heatmap-widget__mode-buttons" role="group" aria-label={t('heatmapEndpoint')}>
              {(['end', 'start'] as const).map((ep) => {
                const labelKey = ep === 'end' ? 'heatmapEndpointLanding' : 'heatmapEndpointOrigin';
                return (
                  <button
                    key={ep}
                    type="button"
                    className={`heatmap-widget__mode-btn${heatFilters.endpoint === ep ? ' heatmap-widget__mode-btn--active' : ''}`}
                    onClick={() => setHeatFilters((f) => ({ ...f, endpoint: ep }))}
                    aria-pressed={heatFilters.endpoint === ep}
                  >
                    {t(labelKey as Parameters<typeof t>[0])}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Court */}
      <div className="heatmap-widget__court-wrap">
        {totalTouches === 0 ? (
          <div className="heatmap-widget__empty">{t('heatmapNoData')}</div>
        ) : (
          <HeatmapCourtSvg
            mode={heatFilters.mode}
            events={events}
            homeEvents={homeResult?.events ?? singleTeamEvents.filter((e) => e.teamSide === 'home')}
            awayEvents={awayResult?.events ?? singleTeamEvents.filter((e) => e.teamSide === 'away')}
            grid={singleGrid ?? undefined}
            homeGrid={homeGrid ?? undefined}
            awayGrid={awayGrid ?? undefined}
            endpoint={heatFilters.endpoint}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            showBothTeams={showBothTeams}
            teamSide={singleTeam}
            hoveredCell={hoveredCell}
            hoveredEvent={hoveredEvent}
            onCellHover={setHoveredCell}
            onEventHover={setHoveredEvent}
          />
        )}
      </div>

      {/* Diagnostics */}
      <div className="heatmap-widget__diagnostics">
        {totalTouches > 0 && (
          <span className="heatmap-widget__diag-item">
            {t('heatmapDataCoverage', { covered: String(events.length), total: String(totalTouches) })}
          </span>
        )}
        {inferredCount > 0 && (
          <span className="heatmap-widget__diag-item heatmap-widget__diag-item--inferred">
            {t('heatmapInferredCount', { count: String(inferredCount) })}
          </span>
        )}
        {lowCoverageWarning && (
          <span className="heatmap-widget__diag-item heatmap-widget__diag-item--warn">
            {t('heatmapLowCoverage')}
          </span>
        )}
      </div>
    </section>
  );
}
