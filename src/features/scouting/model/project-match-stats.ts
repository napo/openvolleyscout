// SPDX-License-Identifier: AGPL-3.0-or-later
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { getIndicatorSettingsVersion } from './indicator-settings';
import { buildMatchStats, type MatchStats } from './match-stats';

const MAX_CACHED_MATCHES = 10;

interface CachedProjectStats {
  fingerprint: string;
  stats: MatchStats;
}

/**
 * Bounded LRU cache of whole-match base statistics (never filtered views).
 * Keyed by match id with a cheap fingerprint of the event log and active
 * efficiency settings version so navigating across Analysis, Team Analysis,
 * and Team Review Booklet reuses computed stats even after fresh IndexedDB reads.
 */
const cache = new Map<string, CachedProjectStats>();

function buildProjectStatsFingerprint(project: MatchProject): string {
  const eventCount = project.events.length;
  const lastEventId = eventCount > 0 ? project.events[eventCount - 1].id : '';
  const currentRallyCount = project.scoutingSession?.currentRallyTouches?.length ?? 0;
  const completedSetsCount = project.scoutingSession?.completedSets?.length ?? 0;
  const homeSel = project.homeSelection?.teamId ?? project.homeTeam.id;
  const awaySel = project.awaySelection?.teamId ?? project.awayTeam.id;
  const settingsVersion = getIndicatorSettingsVersion();
  return `${eventCount}|${lastEventId}|${project.updatedAt}|${currentRallyCount}|${completedSetsCount}|${homeSel}|${awaySel}|v${settingsVersion}`;
}

export function clearProjectMatchStatsCache(): void {
  cache.clear();
}

export function getProjectMatchStatsCacheSize(): number {
  return cache.size;
}

/** Whole-match stats of a saved match project, cached in memory across visits. */
export function buildProjectMatchStats(project: MatchProject): MatchStats {
  const matchId = project.metadata.id;
  const fingerprint = buildProjectStatsFingerprint(project);
  const cached = cache.get(matchId);

  if (cached && cached.fingerprint === fingerprint) {
    // Refresh LRU recency.
    cache.delete(matchId);
    cache.set(matchId, cached);
    return cached.stats;
  }

  const stats = buildMatchStats({
    homeTeam: getMatchTeamSnapshot(project, 'home'),
    awayTeam: getMatchTeamSnapshot(project, 'away'),
    eventLog: project.events,
    completedSets: mergeCompletedSets(
      project.scoutingSession?.completedSets,
      getCompletedSetsFromEvents(project.events),
    ),
    currentRallyTouches: project.scoutingSession?.currentRallyTouches ?? [],
  });

  if (cache.has(matchId)) {
    cache.delete(matchId);
  }
  cache.set(matchId, { fingerprint, stats });
  while (cache.size > MAX_CACHED_MATCHES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
    else break;
  }

  return stats;
}
