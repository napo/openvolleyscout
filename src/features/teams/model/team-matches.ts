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
