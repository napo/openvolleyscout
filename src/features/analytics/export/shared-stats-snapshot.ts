// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchStats, RallyStats } from '@src/features/scouting/model/match-stats';
import type { AdvancedFilters } from '../filters/advanced-filters';
import { normalizeDashboardFilters } from '../dashboard/filters/dashboard-filters';
import type { MatchTabellinoReport } from '@src/features/scouting/model/match-report';
import { isTrendsSnapshot, type TrendsSnapshot, type TrendsViewSubTab } from '../trends/trends-data-source';
import type { RadarAxisId } from '../radar/model/radar-metrics';
import type { PlayByPlayShare } from '../play-by-play/PlayByPlayPanel';
import type { EfficiencyDefinition } from '@src/features/scouting/model/indicators';
import {
  getCustomEfficiencyRules,
  sanitizeEfficiencyRules,
  type EditableEfficiencySkill,
} from '@src/features/scouting/model/indicator-settings';

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
  /** Play by play tab: the built timeline of one match. */
  playByPlay?: PlayByPlayShare;
  filters: AdvancedFilters;
  selectedPlayerIds: string[];
  /** Team data study: the page shows one team only (the studied one, as home). */
  lockedTeam?: 'home' | 'away';
  /**
   * The efficiency rules of the sender (Settings > Analysis), only the ones changed from the DataVolley
   * defaults. The viewer applies them so every efficiency follows one rule. Absent in older links.
   */
  efficiencyRules?: Partial<Record<EditableEfficiencySkill, EfficiencyDefinition>>;
}

/** Wire form: each set's rallies are rebuilt from `rallyStats`, so they are not sent twice. */
type WireStats = Omit<MatchStats, 'setStats'> & {
  setStats: Array<Omit<MatchStats['setStats'][number], 'rallies'>>;
};

export interface WireSnapshot {
  stats?: WireStats;
  report?: MatchTabellinoReport;
  trends?: SharedTrendsSnapshot;
  playByPlay?: PlayByPlayShare;
  filters: AdvancedFilters;
  selectedPlayerIds: string[];
  lockedTeam?: 'home' | 'away';
  efficiencyRules?: Partial<Record<EditableEfficiencySkill, EfficiencyDefinition>>;
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
  // The link always carries the sender's rules, so the viewer never mixes them with their own.
  const efficiencyRules = snapshot.efficiencyRules ?? getCustomEfficiencyRules();
  if (!snapshot.stats) return { ...snapshot, efficiencyRules, stats: undefined };
  return {
    ...snapshot,
    efficiencyRules,
    stats: {
      ...snapshot.stats,
      setStats: snapshot.stats.setStats.map(({ rallies: _rallies, ...set }) => set),
    },
  };
}

export function fromWireSnapshot(received: WireSnapshot): SharedStatsSnapshot {
  // A link made by an older version holds one set, phase, rotation or score situation: read as a list.
  const wire: WireSnapshot = { ...received, filters: normalizeDashboardFilters(received.filters) };
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
  const { stats, report, trends, playByPlay, filters, selectedPlayerIds, lockedTeam, efficiencyRules } = value as Partial<WireSnapshot>;
  if (efficiencyRules !== undefined && sanitizeEfficiencyRules(efficiencyRules) === null) return false;
  const validPlayByPlay = playByPlay === undefined || Boolean(
    playByPlay && typeof playByPlay === 'object' && Array.isArray(playByPlay.sets)
    && playByPlay.sets.every((set) => set && Array.isArray(set.rows))
    && playByPlay.homeTeam && Array.isArray(playByPlay.homeTeam.players)
    && playByPlay.awayTeam && Array.isArray(playByPlay.awayTeam.players)
    && (playByPlay.reference === 'home' || playByPlay.reference === 'away') && typeof playByPlay.setNumber === 'number'
    && (playByPlay.setNumbers === undefined || (Array.isArray(playByPlay.setNumbers) && playByPlay.setNumbers.every((value) => typeof value === 'number'))),
  );
  if (!validPlayByPlay) return false;
  if (lockedTeam !== undefined && lockedTeam !== 'home' && lockedTeam !== 'away') return false;
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
    validReport && validStats && validTrends && (stats !== undefined || report !== undefined || trends !== undefined || playByPlay !== undefined)
    && filters && typeof filters === 'object' && Array.isArray(filters.evaluations)
    && Array.isArray(selectedPlayerIds) && selectedPlayerIds.every((id) => typeof id === 'string'),
  );
}
