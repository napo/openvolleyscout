import { useEffect } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from './filters/dashboard-filters';
import {
  createDefaultFilters,
  getActiveFilterCount,
  RALLY_PHASES,
} from './filters/dashboard-filters';
import type { RallyPhase } from './filters/dashboard-filters';
import { getAvailableSets } from './selectors/dashboard-selectors';
import { useAdvancedFilters } from '../stores/filter-selectors';
import { useFilterActions } from '../stores/filter-selectors';
import { EvaluationDistributionWidget } from './widgets/EvaluationDistributionWidget';
import { EfficiencyWidget } from './widgets/EfficiencyWidget';
import { PointsErrorsWidget } from './widgets/PointsErrorsWidget';
import { SituationMetricsWidget } from './widgets/SituationMetricsWidget';
import './performance-dashboard.css';

const PHASE_I18N_KEYS: Record<RallyPhase, string> = {
  side_out: 'situationSideOut',
  break_point: 'situationBreakPoint',
  counterattack: 'situationCounterattack',
  transition_attack: 'rallyPhaseTransitionAttack',
  attack_after_receive: 'situationAttackAfterReceive',
  attack_after_dig: 'situationAttackAfterDig',
  freeball: 'situationFreeball',
  unknown: 'rallyPhaseUnknown',
};

interface FilterBarProps {
  filters: DashboardFilters;
  stats: MatchStats;
}

function FilterBar({ filters, stats }: FilterBarProps) {
  const { t } = useTranslation();
  const { updateFilter, resetFilters } = useFilterActions();
  const sets = getAvailableSets(stats);
  const activeCount = getActiveFilterCount(filters);

  const handleReset = () => resetFilters();

  return (
    <div className="perf-dashboard__filters" aria-label={t('dashboardFilters')}>
      {sets.length > 1 && (
        <div className="perf-dashboard__filter-group">
          <label className="perf-dashboard__filter-label" htmlFor="dash-filter-set">
            {t('filterSet')}
          </label>
          <select
            id="dash-filter-set"
            className="perf-dashboard__filter-select"
            value={String(filters.set)}
            onChange={(e) => updateFilter('set', e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">{t('allSets')}</option>
            {sets.map((n) => (
              <option key={n} value={n}>{t('setLabel', { setNumber: n })}</option>
            ))}
          </select>
        </div>
      )}

      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-phase">
          {t('filterRallyPhase')}
        </label>
        <select
          id="dash-filter-phase"
          className="perf-dashboard__filter-select"
          value={filters.rallyPhase}
          onChange={(e) => updateFilter('rallyPhase', e.target.value as DashboardFilters['rallyPhase'])}
        >
          <option value="all">{t('allPhases')}</option>
          {Object.entries(PHASE_I18N_KEYS).map(([phase, key]) => (
            <option key={phase} value={phase}>
              {t(key as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </div>

      {activeCount > 0 && (
        <button
          type="button"
          className="perf-dashboard__filter-reset"
          onClick={handleReset}
          aria-label={t('resetFilters')}
        >
          {t('resetFilters')} ({activeCount})
        </button>
      )}
    </div>
  );
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

      <FilterBar filters={effectiveFilters} stats={stats} />

      <SituationMetricsWidget stats={stats} filters={effectiveFilters} />

      <EvaluationDistributionWidget stats={stats} filters={effectiveFilters} />

      <EfficiencyWidget stats={stats} filters={effectiveFilters} />

      <PointsErrorsWidget stats={stats} filters={effectiveFilters} />
    </div>
  );
}
