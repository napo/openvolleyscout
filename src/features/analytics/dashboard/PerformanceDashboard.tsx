import { useMemo,  useEffect } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from './filters/dashboard-filters';
import { hasPlayerFilter } from './filters/dashboard-filters';
import { PlayerAutocomplete } from './filters/PlayerAutocomplete';
import {
  getAvailablePlayers,
  getSelectedPlayer,
  getFilteredTouches,
  pickRallyContextFilters,
  computeFilteredPlayerStats,
} from './selectors/dashboard-selectors';
import { useAdvancedFilters } from '../stores/filter-selectors';
import { useFilterActions } from '../stores/filter-selectors';
import { EvaluationDistributionWidget } from './widgets/EvaluationDistributionWidget';
import { PlayerEvaluationDistributionWidget } from './widgets/PlayerEvaluationDistributionWidget';
import { EfficiencyWidget } from './widgets/EfficiencyWidget';
import { PlayerEfficiencyWidget } from './widgets/PlayerEfficiencyWidget';
import { PointsErrorsWidget } from './widgets/PointsErrorsWidget';
import { PlayerPointsErrorsWidget } from './widgets/PlayerPointsErrorsWidget';
import { PlayerAnalyticsWidget } from './widgets/PlayerAnalyticsWidget';
import { SituationMetricsWidget } from './widgets/SituationMetricsWidget';
import { HeatmapWidget } from '../heatmaps';
import { DashboardFilterPanel } from './filters/DashboardFilterPanel';
import './performance-dashboard.css';

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
  const { updateFilter } = useFilterActions();
  const players = getAvailablePlayers(stats);
  return (
    <DashboardFilterPanel
      filters={filters}
      stats={stats}
      showTeam={showTeam}
      showRole={showRole}
      showSource={showSource}
      showEvaluations
      playerPicker={showPlayer ? (
        <PlayerAutocomplete
          // @ts-expect-error - PlayerOption is compatible with PlayerStats for display
          players={players.filter((p) => filters.team === 'all' || p.teamSide === filters.team)}
          selectedPlayerId={filters.player}
          onChange={(playerId) => updateFilter('player', playerId)}
          homeTeamName={stats.teamStats.home.teamName}
          awayTeamName={stats.teamStats.away.teamName}
        />
      ) : null}
    />
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
            const bothTeamsFilters = { ...teamFilters, team: 'all' as const, role: 'all' as const };
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

                {/* The team, athlete and role filters are not offered here: both teams are always shown. */}
                <EvaluationDistributionWidget stats={stats} filters={bothTeamsFilters} />

                <EfficiencyWidget stats={stats} filters={bothTeamsFilters} />

                <PointsErrorsWidget stats={stats} filters={bothTeamsFilters} />
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
