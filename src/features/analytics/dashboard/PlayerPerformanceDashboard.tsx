import { formatPlayerLabel } from '@src/domain/roster/helpers';
import { useEffect, useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchStats, PlayerStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from './filters/dashboard-filters';
import { PlayerMultiAutocomplete } from './filters/PlayerMultiAutocomplete';
import {
  getAvailablePlayers,
  resolveSelectedPlayers,
  getFilteredTouches,
  pickRallyContextFilters,
  computeFilteredPlayerStats,
} from './selectors/dashboard-selectors';
import { useAdvancedFilters } from '../stores/filter-selectors';
import { useFilterActions } from '../stores/filter-selectors';
import { useSavedPlayer, useSelectedPlayerIds } from '../stores/filter-selectors';
import { PlayerEvaluationDistributionWidget } from './widgets/PlayerEvaluationDistributionWidget';
import { PlayerEfficiencyWidget } from './widgets/PlayerEfficiencyWidget';
import { PlayerPointsErrorsWidget } from './widgets/PlayerPointsErrorsWidget';
import { PlayerAnalyticsWidget } from './widgets/PlayerAnalyticsWidget';
import { PlayerSituationMetricsWidget } from './widgets/PlayerSituationMetricsWidget';
import { PlayerRadarWidget } from './widgets/PlayerRadarWidget';
import { HeatmapWidget } from '../heatmaps';
import { DashboardFilterPanel } from './filters/DashboardFilterPanel';
import './performance-dashboard.css';

interface FilterBarProps {
  filters: DashboardFilters;
  stats: MatchStats;
  selectedPlayerIds: string[];
  onSelectedPlayersChange: (playerIds: string[]) => void;
  /** The team is fixed by the page, not chosen by the user: it is not an active filter. */
  lockedTeam?: 'home' | 'away';
  readOnlyPlayers?: boolean;
}

function FilterBar({ filters, stats, selectedPlayerIds, onSelectedPlayersChange, lockedTeam, readOnlyPlayers }: FilterBarProps) {
  const players = getAvailablePlayers(stats);
  return (
    <DashboardFilterPanel
      filters={filters}
      stats={stats}
      lockedTeam={lockedTeam}
      showSkill
      showEvaluations
      playerPicker={readOnlyPlayers ? null : (
        <PlayerMultiAutocomplete
          players={lockedTeam ? players.filter((p) => p.teamSide === lockedTeam) : players}
          selectedPlayerIds={selectedPlayerIds}
          onChange={onSelectedPlayersChange}
          homeTeamName={stats.teamStats.home.teamName}
          awayTeamName={stats.teamStats.away.teamName}
        />
      )}
    />
  );
}


interface PlayerPerformanceDashboardProps {
  stats: MatchStats;
  /** Restrict player selection and data to a single team. */
  lockedTeam?: 'home' | 'away';
  /** Shared view: the athletes were chosen by whoever shared the page, so the picker is hidden. */
  readOnlyPlayers?: boolean;
}

/** The full set of widgets for one athlete, filtered by the page filters. */
function PlayerPerformanceBlock({ stats, player, filters }: { stats: MatchStats; player: PlayerStats; filters: DashboardFilters }) {
  const { t } = useTranslation();
  const playerFilters = useMemo<DashboardFilters>(() => ({ ...filters, player: player.playerId }), [filters, player.playerId]);
  const filteredPlayer = useMemo(() => {
    const touches = getFilteredTouches(stats, {
      set: filters.set,
      team: player.teamSide,
      source: filters.source,
      rallyPhase: filters.rallyPhase,
      evaluations: filters.evaluations,
      ...pickRallyContextFilters(filters),
    });
    return computeFilteredPlayerStats(player, touches);
  }, [player, filters, stats]);

  if (!filteredPlayer) return null;
  return (
    <section className="perf-dashboard__player-block" aria-label={`${t('performancePlayer')} - ${formatPlayerLabel(player.jerseyNumber, player.playerName)}`}>
      <h3 className="perf-dashboard__player-block-title">{formatPlayerLabel(player.jerseyNumber, player.playerName)}</h3>

      <PlayerAnalyticsWidget stats={stats} player={filteredPlayer} />

      <PlayerRadarWidget stats={stats} player={filteredPlayer} filters={playerFilters} />

      <PlayerSituationMetricsWidget stats={stats} filters={playerFilters} player={filteredPlayer} />

      <PlayerEvaluationDistributionWidget stats={stats} player={filteredPlayer} />

      <PlayerEfficiencyWidget player={filteredPlayer} />

      <PlayerPointsErrorsWidget player={filteredPlayer} />

      <HeatmapWidget stats={stats} filters={playerFilters} />
    </section>
  );
}

export function PlayerPerformanceDashboard({ stats, lockedTeam, readOnlyPlayers }: PlayerPerformanceDashboardProps) {
  const { t } = useTranslation();
  const storeFilters = useAdvancedFilters() as DashboardFilters;
  const filters: DashboardFilters = lockedTeam ? { ...storeFilters, team: lockedTeam } : storeFilters;
  const savedPlayer = useSavedPlayer();
  const storedPlayerIds = useSelectedPlayerIds();
  const { updateFilter, setSelectedPlayerIds } = useFilterActions();

  // Athletes picked on this page; falls back to the single athlete chosen elsewhere (or saved).
  const selectedPlayerIds = useMemo(
    () => (storedPlayerIds.length > 0 ? storedPlayerIds : filters.player !== 'all' ? [filters.player] : []),
    [storedPlayerIds, filters.player],
  );

  // `filters.player` keeps the first pick so the other dashboards stay consistent.
  const handleSelectedPlayersChange = (playerIds: string[]) => {
    setSelectedPlayerIds(playerIds);
    updateFilter('player', playerIds[0] ?? 'all');
  };

  // Restore saved player when entering player-performance section
  useEffect(() => {
    if (filters.player === 'all' && savedPlayer && savedPlayer !== 'all') {
      updateFilter('player', savedPlayer);
    }
  }, []);

  const selectedPlayers = useMemo(
    () => resolveSelectedPlayers(stats, selectedPlayerIds, lockedTeam),
    [stats, selectedPlayerIds, lockedTeam],
  );

  return (
    <div className="perf-dashboard" aria-label={t('performancePlayer')}>
      <header className="perf-dashboard__header">
        <h2 className="perf-dashboard__title">
          {t('performancePlayer')}
          {selectedPlayers.length === 1 && ` - ${formatPlayerLabel(selectedPlayers[0].jerseyNumber, selectedPlayers[0].playerName)}`}
        </h2>
      </header>

      <FilterBar
        filters={filters}
        stats={stats}
        selectedPlayerIds={selectedPlayerIds}
        onSelectedPlayersChange={handleSelectedPlayersChange}
        lockedTeam={lockedTeam}
        readOnlyPlayers={readOnlyPlayers}
      />

      {selectedPlayers.length === 0 ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: '#666',
          fontSize: '16px'
        }}>
          {t('selectPlayerMessage') || 'Seleziona un atleta per visualizzare i dati'}
        </div>
      ) : (
        <div>
          {selectedPlayers.map((player) => (
            <PlayerPerformanceBlock key={player.playerId} stats={stats} player={player} filters={filters} />
          ))}
        </div>
      )}
    </div>
  );
}
