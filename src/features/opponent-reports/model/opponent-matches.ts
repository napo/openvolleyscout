/**
 * Which teams appear in the local matches, and which matches involve a given
 * team (same id-first / name-fallback rule as the team analysis page).
 */
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';
import type { OpponentReportTeamRef } from '@src/domain/opponent-report/types';
import { filterMatchesForTeam, getFocusTeamSide } from '@src/features/teams/model/team-match-filter';

export function teamRefKey(team: OpponentReportTeamRef): string {
  return team.archivedTeamId ? `id:${team.archivedTeamId}` : `name:${team.name.trim().toLowerCase()}`;
}

function sideRef(project: MatchProject, side: TeamSide): OpponentReportTeamRef {
  const selection = side === 'home' ? project.homeSelection : project.awaySelection;
  const name = (selection.teamName || (side === 'home' ? project.homeTeam.name : project.awayTeam.name)).trim();
  return selection.archivedTeamId ? { archivedTeamId: selection.archivedTeamId, name } : { name };
}

/** Every team found in the matches, once, sorted by name, with its match count. */
export function listTeamsInMatches(projects: readonly MatchProject[]): Array<OpponentReportTeamRef & { matchCount: number }> {
  const teams = new Map<string, OpponentReportTeamRef & { matchCount: number }>();
  for (const project of projects) {
    for (const side of ['home', 'away'] as const) {
      const ref = sideRef(project, side);
      if (!ref.name && !ref.archivedTeamId) continue;
      const key = teamRefKey(ref);
      const existing = teams.get(key);
      if (existing) existing.matchCount += 1;
      else teams.set(key, { ...ref, matchCount: 1 });
    }
  }
  return [...teams.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export interface TeamMatch {
  project: MatchProject;
  /** Side the team plays on in that match. */
  side: TeamSide;
  /** The team it faced. */
  faced: OpponentReportTeamRef;
}

/** Matches of `team`, most recent first (by played date). */
export function listMatchesOfTeam(projects: readonly MatchProject[], team: OpponentReportTeamRef): TeamMatch[] {
  return filterMatchesForTeam(projects, team.archivedTeamId, team.name)
    .map((project) => {
      const side = getFocusTeamSide(project, team.archivedTeamId, team.name);
      return { project, side, faced: sideRef(project, side === 'home' ? 'away' : 'home') };
    })
    .sort((left, right) => (right.project.metadata.playedAt ?? '').localeCompare(left.project.metadata.playedAt ?? ''));
}
