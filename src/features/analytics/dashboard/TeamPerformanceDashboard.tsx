import { useEffect } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from './filters/dashboard-filters';
import { useAdvancedFilters } from '../stores/filter-selectors';
import { useFilterActions } from '../stores/filter-selectors';
import { EvaluationDistributionWidget } from './widgets/EvaluationDistributionWidget';
import { EfficiencyWidget } from './widgets/EfficiencyWidget';
import { PointsErrorsWidget } from './widgets/PointsErrorsWidget';
import { SituationMetricsWidget } from './widgets/SituationMetricsWidget';
import { TeamRadarWidget } from './widgets/TeamRadarWidget';
import { DashboardFilterPanel } from './filters/DashboardFilterPanel';
import './performance-dashboard.css';

interface FilterBarProps {
  filters: DashboardFilters;
  stats: MatchStats;
  /** The team is fixed by the page, not chosen by the user: it is not an active filter. */
  lockedTeam?: 'home' | 'away';
}

function FilterBar({ filters, stats, lockedTeam }: FilterBarProps) {
  return <DashboardFilterPanel filters={filters} stats={stats} lockedTeam={lockedTeam} />;
}


interface TeamPerformanceDashboardProps {
  stats: MatchStats;
  /** Restrict the dashboard to a single team: no opponent data, no comparison. */
  lockedTeam?: 'home' | 'away';
}

export function TeamPerformanceDashboard({ stats, lockedTeam }: TeamPerformanceDashboardProps) {
  const { t } = useTranslation();
  const filters = useAdvancedFilters() as DashboardFilters;
  const { updateFilter, setSavedPlayer } = useFilterActions();

  // Save current player and reset when entering team-performance section
  useEffect(() => {
    if (filters.player !== 'all') {
      setSavedPlayer(filters.player);
      updateFilter('player', 'all');
    }
  }, []);

  const effectiveFilters: DashboardFilters = lockedTeam ? { ...filters, team: lockedTeam } : filters;

  return (
    <div className="perf-dashboard" aria-label={t('performanceTeams')}>
      <header className="perf-dashboard__header">
        <h2 className="perf-dashboard__title">{t('performanceTeams')}</h2>
      </header>

      <FilterBar filters={effectiveFilters} stats={stats} lockedTeam={lockedTeam} />

      <SituationMetricsWidget stats={stats} filters={effectiveFilters} />

      <EvaluationDistributionWidget stats={stats} filters={effectiveFilters} />

      <EfficiencyWidget stats={stats} filters={effectiveFilters} />

      <PointsErrorsWidget stats={stats} filters={effectiveFilters} />

      <TeamRadarWidget stats={stats} filters={effectiveFilters} />
    </div>
  );
}
