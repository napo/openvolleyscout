import { useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats, TrackedSkill } from '@src/features/scouting/model/match-stats';
import { TRACKED_SKILLS } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from './filters/dashboard-filters';
import {
  getActiveFilterCount,
  PLAYER_ROLES,
  RALLY_PHASES,
} from './filters/dashboard-filters';
import type { RallyPhase } from './filters/dashboard-filters';
import { PlayerAutocomplete } from './filters/PlayerAutocomplete';
import { EvaluationFilter } from './filters/EvaluationFilter';
import {
  getAvailablePlayers,
  getAvailableSets,
  getSelectedPlayer,
  getFilteredTouches,
  computeFilteredPlayerStats,
} from './selectors/dashboard-selectors';
import { useAdvancedFilters } from '../stores/filter-selectors';
import { useFilterActions } from '../stores/filter-selectors';
import { PlayerEvaluationDistributionWidget } from './widgets/PlayerEvaluationDistributionWidget';
import { PlayerEfficiencyWidget } from './widgets/PlayerEfficiencyWidget';
import { PlayerPointsErrorsWidget } from './widgets/PlayerPointsErrorsWidget';
import { PlayerAnalyticsWidget } from './widgets/PlayerAnalyticsWidget';
import { SituationMetricsWidget } from './widgets/SituationMetricsWidget';
import { HeatmapWidget } from '../heatmaps';
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
  const players = getAvailablePlayers(stats);
  const activeCount = getActiveFilterCount(filters);

  const homeTeamName = stats.teamStats.home.teamName;
  const awayTeamName = stats.teamStats.away.teamName;

  const handleReset = () => resetFilters();

  return (
    <div className="perf-dashboard__filters" aria-label={t('dashboardFilters')}>
      <PlayerAutocomplete
        // @ts-expect-error - PlayerOption is compatible with PlayerStats for display
        players={players.filter((p) => filters.team === 'all' || p.teamSide === filters.team)}
        selectedPlayerId={filters.player}
        onChange={(playerId) => updateFilter('player', playerId)}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
      />

      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-skill">
          {t('filterSkill')}
        </label>
        <select
          id="dash-filter-skill"
          className="perf-dashboard__filter-select"
          value={filters.skill}
          onChange={(e) => updateFilter('skill', e.target.value as TrackedSkill | 'all')}
        >
          <option value="all">{t('allSkills')}</option>
          {TRACKED_SKILLS.map((skill) => (
            <option key={skill} value={skill}>
              {t(`skill${skill.charAt(0).toUpperCase()}${skill.slice(1)}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </div>

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

      <EvaluationFilter
        selectedEvaluations={filters.evaluations}
        onChange={(evaluations) => updateFilter('evaluations', evaluations)}
      />

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

interface PlayerPerformanceDashboardProps {
  stats: MatchStats;
}

export function PlayerPerformanceDashboard({ stats }: PlayerPerformanceDashboardProps) {
  const { t } = useTranslation();
  const filters = useAdvancedFilters() as DashboardFilters;

  const selectedPlayer = useMemo(
    () => (filters.player !== 'all' ? getSelectedPlayer(stats, filters.player) : null),
    [filters, stats],
  );

  const filteredPlayer = useMemo(() => {
    if (!selectedPlayer) return null;
    const touches = getFilteredTouches(stats, {
      set: filters.set,
      team: selectedPlayer.teamSide,
      source: filters.source,
      rallyPhase: filters.rallyPhase,
      evaluations: filters.evaluations,
    });
    return computeFilteredPlayerStats(selectedPlayer, touches);
  }, [selectedPlayer, filters, stats]);

  return (
    <div className="perf-dashboard" aria-label={t('performancePlayer')}>
      <header className="perf-dashboard__header">
        <h2 className="perf-dashboard__title">
          {t('performancePlayer')}
          {selectedPlayer && ` - #${selectedPlayer.jerseyNumber} ${selectedPlayer.playerName}`}
        </h2>
      </header>

      <FilterBar filters={filters} stats={stats} />

      {!selectedPlayer ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: '#666',
          fontSize: '16px'
        }}>
          {t('selectPlayerMessage') || 'Seleziona un atleta per visualizzare i dati'}
        </div>
      ) : filteredPlayer ? (
        <div>
          <PlayerAnalyticsWidget stats={stats} player={filteredPlayer} />

          <SituationMetricsWidget stats={stats} filters={filters} />

          <PlayerEvaluationDistributionWidget stats={stats} player={filteredPlayer} />

          <PlayerEfficiencyWidget player={filteredPlayer} />

          <PlayerPointsErrorsWidget player={filteredPlayer} />

          <HeatmapWidget stats={stats} filters={filters} />
        </div>
      ) : null}
    </div>
  );
}
