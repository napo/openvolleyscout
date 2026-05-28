import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../../dashboard/filters/dashboard-filters';
import {
  createDefaultHeatmapFilters,
  HEATMAP_SKILLS,
  type HeatmapWidgetFilters,
} from '../filters/heatmap-filters';
import { getHeatmapSelectionResult } from '../selectors/heatmap-selectors';
import {
  buildDensityGrid,
  type HeatmapDensityGrid,
  type HeatmapEvent,
} from '../aggregation/heatmap-aggregation';
import { HeatmapCourtSvg } from '../rendering/HeatmapCourtSvg';
import './heatmap.css';

interface HeatmapWidgetProps {
  stats: MatchStats;
  filters: Pick<DashboardFilters, 'team' | 'set' | 'rallyPhase'>;
}

const SKILL_LABELS: Record<string, string> = {
  all: 'All',
  serve: 'Serve',
  receive: 'Reception',
  attack: 'Attack',
  block: 'Block',
  dig: 'Dig',
  freeball: 'Freeball',
};

const MODE_LABELS: Record<string, string> = {
  density: 'Density',
  point: 'Points',
  direction: 'Direction',
};

const ENDPOINT_LABELS: Record<string, string> = {
  end: 'Landing',
  start: 'Origin',
};

export function HeatmapWidget({ stats, filters }: HeatmapWidgetProps) {
  const { t } = useTranslation();
  const [heatFilters, setHeatFilters] = useState<HeatmapWidgetFilters>(createDefaultHeatmapFilters);
  const [hoveredCell, setHoveredCell] = useState<HeatmapDensityGrid['cells'][number] | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<HeatmapEvent | null>(null);

  const { events, totalTouches, inferredCount, coverageRate } = useMemo(
    () => getHeatmapSelectionResult(stats, filters, heatFilters.skill),
    [stats, filters, heatFilters.skill],
  );

  const grid = useMemo(
    () => heatFilters.mode === 'density'
      ? buildDensityGrid(events, heatFilters.endpoint === 'end')
      : null,
    [events, heatFilters.mode, heatFilters.endpoint],
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
            <option value="all">{SKILL_LABELS['all']}</option>
            {HEATMAP_SKILLS.map((s) => (
              <option key={s} value={s}>{SKILL_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>

        <div className="heatmap-widget__toolbar-group">
          <span className="heatmap-widget__toolbar-label">{t('heatmapMode')}</span>
          <div className="heatmap-widget__mode-buttons" role="group" aria-label={t('heatmapMode')}>
            {(['density', 'point', 'direction'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`heatmap-widget__mode-btn${heatFilters.mode === mode ? ' heatmap-widget__mode-btn--active' : ''}`}
                onClick={() => setHeatFilters((f) => ({ ...f, mode }))}
                aria-pressed={heatFilters.mode === mode}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        {heatFilters.mode !== 'direction' && (
          <div className="heatmap-widget__toolbar-group">
            <span className="heatmap-widget__toolbar-label">{t('heatmapEndpoint')}</span>
            <div className="heatmap-widget__mode-buttons" role="group" aria-label={t('heatmapEndpoint')}>
              {(['end', 'start'] as const).map((ep) => (
                <button
                  key={ep}
                  type="button"
                  className={`heatmap-widget__mode-btn${heatFilters.endpoint === ep ? ' heatmap-widget__mode-btn--active' : ''}`}
                  onClick={() => setHeatFilters((f) => ({ ...f, endpoint: ep }))}
                  aria-pressed={heatFilters.endpoint === ep}
                >
                  {ENDPOINT_LABELS[ep]}
                </button>
              ))}
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
            grid={grid ?? undefined}
            endpoint={heatFilters.endpoint}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
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
