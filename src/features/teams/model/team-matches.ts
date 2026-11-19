// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ArchivedTeam } from '@src/domain/team/types';

export interface TeamMatchSummaryLike {
  id: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName: string;
  awayTeamName: string;
}

/**
 * Ids of the played matches linked to any of the given teams. A match is linked
 * by team id; only matches without a team id fall back to a case-insensitive name match.
 */
export function findRelatedMatchIds(
  summaries: readonly TeamMatchSummaryLike[],
  targetTeams: ReadonlyArray<Pick<ArchivedTeam, 'id' | 'name'>>,
): string[] {
  const idSet = new Set(targetTeams.map((team) => team.id));
  const nameSet = new Set(targetTeams.map((team) => team.name.trim().toLowerCase()).filter(Boolean));
  const isLinked = (teamId: string | undefined, teamName: string) => (teamId
    ? idSet.has(teamId)
    : nameSet.has(teamName.trim().toLowerCase()));
  return summaries
    .filter((summary) => isLinked(summary.homeTeamId, summary.homeTeamName) || isLinked(summary.awayTeamId, summary.awayTeamName))
    .map((summary) => summary.id);
}

export interface TeamIndexedSummary {
  homeTeamId?: string;
  awayTeamId?: string;
  playedAt?: string;
}

/** Number of match sides per team id (a match counts once per side that carries the team id). */
export function countMatchesByTeamId(summaries: readonly TeamIndexedSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    if (summary.homeTeamId) counts.set(summary.homeTeamId, (counts.get(summary.homeTeamId) ?? 0) + 1);
    if (summary.awayTeamId) counts.set(summary.awayTeamId, (counts.get(summary.awayTeamId) ?? 0) + 1);
  }
  return counts;
}

/** Matches grouped by team id, newest first; a match listed once per team even if both sides share the id. */
export function groupMatchesByTeamId<T extends TeamIndexedSummary>(summaries: readonly T[]): Map<string, T[]> {
  const byTeam = new Map<string, T[]>();
  const add = (teamId: string | undefined, summary: T) => {
    if (!teamId) return;
    const list = byTeam.get(teamId) ?? [];
    list.push(summary);
    byTeam.set(teamId, list);
  };
  for (const summary of summaries) {
    add(summary.homeTeamId, summary);
    if (summary.awayTeamId !== summary.homeTeamId) add(summary.awayTeamId, summary);
  }
  for (const list of byTeam.values()) {
    list.sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || ''));
  }
  return byTeam;
}
