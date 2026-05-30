import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../../dashboard/filters/dashboard-filters';
import { HEATMAP_SKILLS, type HeatmapWidgetFilters } from '../filters/heatmap-filters';
import { ZoneDensityModePanel } from '../modes/ZoneDensityMode';
import './heatmap.css';

interface HeatmapWidgetProps {
  stats: MatchStats;
  filters: DashboardFilters;
}

export function HeatmapWidget({ stats, filters }: HeatmapWidgetProps) {
  const { t } = useTranslation();

  return (
    <section className="heatmap-widget" aria-label={t('heatmapTitle')}>
      <h3 className="heatmap-widget__title">{t('heatmapTitle')}</h3>

      {/* Zone Density Heatmap */}
      <div className="heatmap-widget__court-wrap">
        <ZoneDensityModePanel stats={stats} skill={filters.skill} filters={filters} />
      </div>
    </section>
  );
}
