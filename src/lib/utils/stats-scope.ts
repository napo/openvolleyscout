// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchStats } from '@src/features/scouting/model/match-stats';

/**
 * A short key for the matches a set of statistics is made of: the same key while the user moves
 * between the tabs of one match (or one selection), another key for another match.
 */
export function statsScopeKey(stats: Partial<Pick<MatchStats, 'teamStats' | 'rallyStats' | 'totalTouches' | 'setsWon'>>): string {
  return [
    stats.teamStats?.home?.teamName,
    stats.teamStats?.away?.teamName,
    stats.rallyStats?.length,
    stats.totalTouches,
    stats.setsWon?.home,
    stats.setsWon?.away,
  ].join('|');
}

/**
 * How many filters differ from their default value, for the "Reset filters (n)" button. Lists
 * (evaluations and the like) count as one filter when they differ; `ignore` leaves out keys that
 * are a choice of view rather than a filter (the team shown, a position already shown apart).
 */
export function countChangedFilters<T extends object>(current: T, defaults: T, ignore: ReadonlyArray<keyof T> = []): number {
  return (Object.keys(defaults) as Array<keyof T>).filter((key) => (
    !ignore.includes(key) && JSON.stringify(current[key]) !== JSON.stringify(defaults[key])
  )).length;
}
