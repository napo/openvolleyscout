import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from './filters/dashboard-filters';
import {
  createDefaultFilters,
  getActiveFilterCount,
  hasPlayerFilter,
  PLAYER_ROLES,
  RALLY_PHASES,
} from './filters/dashboard-filters';
import type { RallyPhase } from './filters/dashboard-filters';
import {
  getAvailablePlayers,
  getAvailableSets,
  getSelectedPlayer,
} from './selectors/dashboard-selectors';
import { EvaluationDistributionWidget } from './widgets/EvaluationDistributionWidget';
import { EfficiencyWidget } from './widgets/EfficiencyWidget';
import { PointsErrorsWidget } from './widgets/PointsErrorsWidget';
import { PerformanceBySetWidget } from './widgets/PerformanceBySetWidget';
import { PlayerAnalyticsWidget } from './widgets/PlayerAnalyticsWidget';
import { SituationMetricsWidget } from './widgets/SituationMetricsWidget';
import './performance-dashboard.css';

const ROLE_LABELS: Record<string, string> = {
  setter: 'Setter',
  outside_hitter: 'Outside',
  middle_blocker: 'Middle',
  opposite: 'Opposite',
  libero: 'Libero',
  defensive_specialist: 'DS',
};

const PHASE_LABELS: Record<RallyPhase, string> = {
  side_out: 'Side-out',
  break_point: 'Break point',
  counterattack: 'Counterattack',
  transition_attack: 'Transition',
  attack_after_receive: 'Att. after receive',
  attack_after_dig: 'Att. after dig',
  freeball: 'Freeball',
  unknown: 'Unknown',
};

interface FilterBarProps {
  filters: DashboardFilters;
  stats: MatchStats;
  onChange: (filters: DashboardFilters) => void;
}

function FilterBar({ filters, stats, onChange }: FilterBarProps) {
  const { t } = useTranslation();
  const sets = getAvailableSets(stats);
  const players = getAvailablePlayers(stats);
  const activeCount = getActiveFilterCount(filters);

  const homeTeamName = stats.teamStats.home.teamName;
  const awayTeamName = stats.teamStats.away.teamName;

  const handleReset = () => onChange(createDefaultFilters());

  return (
    <div className="perf-dashboard__filters" aria-label={t('dashboardFilters')}>
      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-team">
          {t('filterTeam')}
        </label>
        <select
          id="dash-filter-team"
          className="perf-dashboard__filter-select"
          value={filters.team}
          onChange={(e) => onChange({ ...filters, team: e.target.value as DashboardFilters['team'], player: 'all' })}
        >
          <option value="all">{t('allTeams')}</option>
          <option value="home">{homeTeamName}</option>
          <option value="away">{awayTeamName}</option>
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
            onChange={(e) => onChange({ ...filters, set: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
          >
            <option value="all">{t('allSets')}</option>
            {sets.map((n) => (
              <option key={n} value={n}>{t('setLabel', { setNumber: n })}</option>
            ))}
          </select>
        </div>
      )}

      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-player">
          {t('filterPlayer')}
        </label>
        <select
          id="dash-filter-player"
          className="perf-dashboard__filter-select"
          value={filters.player}
          onChange={(e) => onChange({ ...filters, player: e.target.value })}
        >
          <option value="all">{t('allPlayers')}</option>
          {players
            .filter((p) => filters.team === 'all' || p.teamSide === filters.team)
            .map((p) => (
              <option key={p.playerId} value={p.playerId}>
                #{p.jerseyNumber} {p.playerName}
              </option>
            ))}
        </select>
      </div>

      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-role">
          {t('filterRole')}
        </label>
        <select
          id="dash-filter-role"
          className="perf-dashboard__filter-select"
          value={filters.role}
          onChange={(e) => onChange({ ...filters, role: e.target.value as DashboardFilters['role'] })}
        >
          <option value="all">{t('allRoles')}</option>
          {PLAYER_ROLES.map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role] ?? role}</option>
          ))}
        </select>
      </div>

      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-source">
          {t('filterSource')}
        </label>
        <select
          id="dash-filter-source"
          className="perf-dashboard__filter-select"
          value={filters.source}
          onChange={(e) => onChange({ ...filters, source: e.target.value as DashboardFilters['source'] })}
        >
          <option value="all">{t('allSources')}</option>
          <option value="explicit">{t('explicitTouches')}</option>
          <option value="inferred">{t('inferredTouches')}</option>
        </select>
      </div>

      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-phase">
          {t('filterRallyPhase')}
        </label>
        <select
          id="dash-filter-phase"
          className="perf-dashboard__filter-select"
          value={filters.rallyPhase}
          onChange={(e) => onChange({ ...filters, rallyPhase: e.target.value as DashboardFilters['rallyPhase'] })}
        >
          <option value="all">{t('allPhases')}</option>
          {RALLY_PHASES.map((phase) => (
            <option key={phase} value={phase}>{PHASE_LABELS[phase]}</option>
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

interface PerformanceDashboardProps {
  stats: MatchStats;
}

export function PerformanceDashboard({ stats }: PerformanceDashboardProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<DashboardFilters>(createDefaultFilters);

  const selectedPlayer = useMemo(
    () => (hasPlayerFilter(filters) ? getSelectedPlayer(stats, filters.player) : null),
    [filters, stats],
  );

  return (
    <div className="perf-dashboard" aria-label={t('performanceDashboard')}>
      <header className="perf-dashboard__header">
        <h2 className="perf-dashboard__title">{t('performanceDashboard')}</h2>
      </header>

      <FilterBar filters={filters} stats={stats} onChange={setFilters} />

      {selectedPlayer ? (
        <PlayerAnalyticsWidget stats={stats} player={selectedPlayer} />
      ) : null}

      <SituationMetricsWidget stats={stats} filters={filters} />

      <EvaluationDistributionWidget stats={stats} filters={filters} />

      <EfficiencyWidget stats={stats} filters={filters} />

      <PointsErrorsWidget stats={stats} filters={filters} />

      {stats.setStats.length > 0 ? (
        <PerformanceBySetWidget stats={stats} />
      ) : null}
    </div>
  );
}
