import { getMatchTeamSnapshot } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { buildMatchStats, type MatchStats } from './match-stats';

interface CachedProjectStats {
  events: MatchProject['events'];
  scoutingSession: MatchProject['scoutingSession'];
  homeSelection: MatchProject['homeSelection'];
  awaySelection: MatchProject['awaySelection'];
  stats: MatchStats;
}

// The analysis pages derive several views from the same saved matches (the
// Trends tab alone asks for every match's stats five times), and buildMatchStats
// walks the whole event log. Projects are never mutated in place, so the stats
// are cached per project object; the checked fields guard against a project
// being edited in place anyway. The returned stats are shared: treat them as read-only.
const cache = new WeakMap<MatchProject, CachedProjectStats>();

/** Whole-match stats of a saved match project. */
export function buildProjectMatchStats(project: MatchProject): MatchStats {
  const cached = cache.get(project);
  if (
    cached
    && cached.events === project.events
    && cached.scoutingSession === project.scoutingSession
    && cached.homeSelection === project.homeSelection
    && cached.awaySelection === project.awaySelection
  ) {
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
  cache.set(project, {
    events: project.events,
    scoutingSession: project.scoutingSession,
    homeSelection: project.homeSelection,
    awaySelection: project.awaySelection,
    stats,
  });
  return stats;
}
