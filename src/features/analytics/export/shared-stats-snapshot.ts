// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchStats, RallyStats } from '@src/features/scouting/model/match-stats';
import type { AdvancedFilters } from '../filters/advanced-filters';
import type { MatchTabellinoReport } from '@src/features/scouting/model/match-report';
import { isTrendsSnapshot, type TrendsSnapshot, type TrendsViewSubTab } from '../trends/trends-data-source';
import type { RadarAxisId } from '../radar/model/radar-metrics';

/** Trends tab: precomputed results for the selected team, plus the choices on screen. */
export interface SharedTrendsSnapshot extends TrendsSnapshot {
  teamLabel: string;
  subTab: TrendsViewSubTab;
  seasonAxis: RadarAxisId;
  priorityPlayerIds: string[];
}

/**
 * What a shared link carries for an analysis tab: the calculated statistics the tab shows,
 * already restricted to the athletes picked on the page, and the page filters.
 * The viewer feeds it to the same components as the Data study page.
 */
export interface SharedStatsSnapshot {
  /** Missing on the Match report tab, which only needs its built report. */
  stats?: MatchStats;
  /** Match report tab: the scoresheet exactly as the tab draws it. */
  report?: MatchTabellinoReport;
  trends?: SharedTrendsSnapshot;
  filters: AdvancedFilters;
  selectedPlayerIds: string[];
}

/** Wire form: each set's rallies are rebuilt from `rallyStats`, so they are not sent twice. */
type WireStats = Omit<MatchStats, 'setStats'> & {
  setStats: Array<Omit<MatchStats['setStats'][number], 'rallies'>>;
};

export interface WireSnapshot {
  stats?: WireStats;
  report?: MatchTabellinoReport;
  trends?: SharedTrendsSnapshot;
  filters: AdvancedFilters;
  selectedPlayerIds: string[];
}

function rallyHasPlayer(rally: RallyStats, playerIds: ReadonlySet<string>): boolean {
  return rally.touches.some((touch) => touch.playerId !== undefined && playerIds.has(touch.playerId));
}

/**
 * Keeps only what the tab shows. On the player tab that is the picked athletes: their
 * totals and the rallies they touched (whole rallies, because rally-phase and
 * server/receiver metrics need the surrounding touches).
 */
export function buildStatsSnapshot(
  stats: MatchStats,
  options: { filters: AdvancedFilters; selectedPlayerIds: readonly string[]; scopeToPlayers: boolean },
): SharedStatsSnapshot & { stats: MatchStats } {
  const picked = options.selectedPlayerIds.length > 0
    ? [...options.selectedPlayerIds]
    : options.filters.player !== 'all' ? [options.filters.player] : [];
  const snapshotFilters = { ...options.filters };
  if (!options.scopeToPlayers || picked.length === 0) {
    return { stats, filters: snapshotFilters, selectedPlayerIds: picked };
  }
  const ids = new Set(picked);
  const rallyStats = stats.rallyStats.filter((rally) => rallyHasPlayer(rally, ids));
  const keptRallies = new Set(rallyStats);
  return {
    stats: {
      ...stats,
      playerStats: stats.playerStats.filter((player) => ids.has(player.playerId)),
      rallyStats,
      setStats: stats.setStats.map((set) => ({ ...set, rallies: set.rallies.filter((rally) => keptRallies.has(rally)) })),
      quickStats: { ...stats.quickStats, players: stats.quickStats.players.filter((player) => ids.has(player.playerId)) },
    },
    filters: snapshotFilters,
    selectedPlayerIds: picked,
  };
}

export function toWireSnapshot(snapshot: SharedStatsSnapshot): WireSnapshot {
  if (!snapshot.stats) return { ...snapshot, stats: undefined };
  return {
    ...snapshot,
    stats: {
      ...snapshot.stats,
      setStats: snapshot.stats.setStats.map(({ rallies: _rallies, ...set }) => set),
    },
  };
}

export function fromWireSnapshot(wire: WireSnapshot): SharedStatsSnapshot {
  if (!wire.stats) return { ...wire, stats: undefined };
  const bySet = new Map<number, RallyStats[]>();
  for (const rally of wire.stats.rallyStats) {
    const list = bySet.get(rally.setNumber);
    if (list) list.push(rally);
    else bySet.set(rally.setNumber, [rally]);
  }
  return {
    ...wire,
    stats: {
      ...wire.stats,
      setStats: wire.stats.setStats.map((set) => ({ ...set, rallies: bySet.get(set.setNumber) ?? [] })),
    },
  };
}

export function isWireSnapshot(value: unknown): value is WireSnapshot {
  if (!value || typeof value !== 'object') return false;
  const { stats, report, trends, filters, selectedPlayerIds } = value as Partial<WireSnapshot>;
  const validTrends = trends === undefined || (
    isTrendsSnapshot(trends) && typeof trends.teamLabel === 'string' && typeof trends.subTab === 'string'
    && typeof trends.seasonAxis === 'string' && Array.isArray(trends.priorityPlayerIds)
  );
  const validReport = report === undefined || Boolean(
    report && typeof report === 'object'
    && report.homeTabellino && report.awayTabellino && Array.isArray(report.setSummaries)
    && Array.isArray(report.bottomSummaryBlocks),
  );
  const validStats = stats === undefined || Boolean(
    stats && typeof stats === 'object'
    && stats.teamStats && stats.teamStats.home && stats.teamStats.away
    && Array.isArray(stats.playerStats) && Array.isArray(stats.rallyStats) && Array.isArray(stats.setStats)
    && stats.quickStats && Array.isArray(stats.quickStats.players),
  );
  return Boolean(
    validReport && validStats && validTrends && (stats !== undefined || report !== undefined || trends !== undefined)
    && filters && typeof filters === 'object' && Array.isArray(filters.evaluations)
    && Array.isArray(selectedPlayerIds) && selectedPlayerIds.every((id) => typeof id === 'string'),
  );
}
