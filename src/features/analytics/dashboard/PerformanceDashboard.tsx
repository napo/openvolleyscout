import { useMemo,  useEffect } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from './filters/dashboard-filters';
import {
  
  getActiveFilterCount,
  hasPlayerFilter,
  PLAYER_ROLES,
  TOUCH_PHASES } from './filters/dashboard-filters';
import type { TouchPhase } from './filters/dashboard-filters';
import { PlayerAutocomplete } from './filters/PlayerAutocomplete';
import { EvaluationFilter } from './filters/EvaluationFilter';
import {
  getAvailablePlayers,
  getAvailableSets,
  getSelectedPlayer,
  getFilteredTouches,
  pickRallyContextFilters,
  computeFilteredPlayerStats,
} from './selectors/dashboard-selectors';
import { useAdvancedFilters } from '../stores/filter-selectors';
import { useFilterActions } from '../stores/filter-selectors';
import { TeamEvaluationDistributionWidget } from './widgets/TeamEvaluationDistributionWidget';
import { PlayerEvaluationDistributionWidget } from './widgets/PlayerEvaluationDistributionWidget';
import { TeamEfficiencyWidget } from './widgets/TeamEfficiencyWidget';
import { PlayerEfficiencyWidget } from './widgets/PlayerEfficiencyWidget';
import { TeamPointsErrorsWidget } from './widgets/TeamPointsErrorsWidget';
import { PlayerPointsErrorsWidget } from './widgets/PlayerPointsErrorsWidget';
import { PlayerAnalyticsWidget } from './widgets/PlayerAnalyticsWidget';
import { SituationMetricsWidget } from './widgets/SituationMetricsWidget';
import { HeatmapWidget } from '../heatmaps';
import { RallyContextFilterControls } from './filters/RallyContextFilterControls';
import './performance-dashboard.css';

const PHASE_I18N_KEYS: Record<TouchPhase, string> = {
  break_point: 'rallyPhaseBreakPoint',
  point: 'rallyPhasePoint',
  transition_break_point: 'rallyPhaseTransitionBreakPoint',
  transition_point: 'rallyPhaseTransitionPoint',
};

type DashboardSection = 'team-performance' | 'player-performance';

interface FilterBarProps {
  filters: DashboardFilters;
  stats: MatchStats;
  showTeam?: boolean;
  showRole?: boolean;
  showSource?: boolean;
  showPlayer?: boolean;
}

function FilterBar({ filters, stats, showTeam = true, showRole = true, showSource = true, showPlayer = true }: FilterBarProps) {
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
      {showTeam && (
        <div className="perf-dashboard__filter-group">
          <label className="perf-dashboard__filter-label" htmlFor="dash-filter-team">
            {t('filterTeam')}
          </label>
          <select
            id="dash-filter-team"
            className="perf-dashboard__filter-select"
            value={filters.team}
            onChange={(e) => {
              updateFilter('team', e.target.value as DashboardFilters['team']);
              updateFilter('player', 'all');
            }}
          >
            <option value="all">{t('allTeams')}</option>
            <option value="home">{homeTeamName}</option>
            <option value="away">{awayTeamName}</option>
          </select>
        </div>
      )}

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

      {showPlayer && (
        <PlayerAutocomplete
          // @ts-expect-error - PlayerOption is compatible with PlayerStats for display
          players={players.filter((p) => filters.team === 'all' || p.teamSide === filters.team)}
          selectedPlayerId={filters.player}
          onChange={(playerId) => updateFilter('player', playerId)}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
      )}

      {showRole && (
        <div className="perf-dashboard__filter-group">
          <label className="perf-dashboard__filter-label" htmlFor="dash-filter-role">
            {t('filterRole')}
          </label>
          <select
            id="dash-filter-role"
            className="perf-dashboard__filter-select"
            value={filters.role}
            onChange={(e) => updateFilter('role', e.target.value as DashboardFilters['role'])}
          >
            <option value="all">{t('allRoles')}</option>
            {PLAYER_ROLES.map((role) => (
              <option key={role} value={role}>{t(role as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>
      )}

      {showSource && (
        <div className="perf-dashboard__filter-group">
          <label className="perf-dashboard__filter-label" htmlFor="dash-filter-source">
            {t('filterSource')}
          </label>
          <select
            id="dash-filter-source"
            className="perf-dashboard__filter-select"
            value={filters.source}
            onChange={(e) => updateFilter('source', e.target.value as DashboardFilters['source'])}
          >
            <option value="all">{t('allSources')}</option>
            <option value="explicit">{t('explicitTouches')}</option>
            <option value="inferred">{t('inferredTouches')}</option>
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
          {TOUCH_PHASES.map((phase) => (
            <option key={phase} value={phase}>
              {t(PHASE_I18N_KEYS[phase] as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </div>

      <EvaluationFilter
        selectedEvaluations={filters.evaluations}
        onChange={(evaluations) => updateFilter('evaluations', evaluations)}
      />

      <RallyContextFilterControls filters={filters} stats={stats} />

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

interface PerformanceDashboardProps {
  stats: MatchStats;
  section?: DashboardSection;
}

export function PerformanceDashboard({ stats, section: initialSection = 'team-performance' }: PerformanceDashboardProps) {
  const { t } = useTranslation();
  const filters = useAdvancedFilters() as DashboardFilters;
  const { updateFilter } = useFilterActions();
  // Reset player filter when entering team-performance section
  useEffect(() => {
    if (initialSection === 'team-performance' && filters.player !== 'all') {
      updateFilter('player', 'all');
    }
  }, [initialSection, filters.player, updateFilter]);

  const selectedPlayer = useMemo(
    () => (hasPlayerFilter(filters) ? getSelectedPlayer(stats, filters.player) : null),
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
      ...pickRallyContextFilters(filters),
    });
    return computeFilteredPlayerStats(selectedPlayer, touches);
  }, [selectedPlayer, filters, stats]);

  return (
    <div className="perf-dashboard" aria-label={t('performanceDashboard')}>
      <header className="perf-dashboard__header">
        <h2 className="perf-dashboard__title">{initialSection === 'team-performance' ? t('performanceTeams') : t('performancePlayer')}</h2>
      </header>

      {initialSection === 'team-performance' ? (
        // ========== SEZIONE PRESTAZIONI SQUADRE ==========
        <div key="team-performance">
          {(() => {
            // Clean filters for team-performance section (remove player filter)
            const teamFilters = { ...filters, player: 'all' };
            return (
              <>
                <SituationMetricsWidget stats={stats} filters={teamFilters} />

                <FilterBar
                  filters={teamFilters}
                  stats={stats}
                  showTeam={false}
                  showRole={false}
                  showSource={false}
                  showPlayer={false}
                />

                <TeamEvaluationDistributionWidget stats={stats} filters={teamFilters} />

                <TeamEfficiencyWidget stats={stats} filters={teamFilters} />

                <TeamPointsErrorsWidget stats={stats} filters={teamFilters} />
              </>
            );
          })()}
        </div>
      ) : initialSection === 'player-performance' ? (
        // ========== SEZIONE PRESTAZIONI ATLETA ==========
        <div key="player-performance">
          <FilterBar
            filters={filters}
            stats={stats}
            showTeam={true}
            showRole={false}
            showSource={false}
            showPlayer={true}
          />

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
      ) : null}
    </div>
  );
}
