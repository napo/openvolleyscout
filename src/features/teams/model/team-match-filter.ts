import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';

/**
 * Resolves which side (home/away) a given team occupies in a match, using
 * the stable archived-team id when available and falling back to
 * case-insensitive/trimmed name matching for manually-entered teams that
 * were never linked to an archived roster.
 */
export function getFocusTeamSide(project: MatchProject, teamId?: string, teamName?: string): TeamSide {
  if (teamId) {
    return project.homeSelection.archivedTeamId === teamId ? 'home' : 'away';
  }
  const name = (teamName ?? '').toLowerCase().trim();
  return project.homeTeam.name.toLowerCase().trim() === name ? 'home' : 'away';
}

/**
 * Filters matches down to those involving the given team, using the same
 * id-first/name-fallback rule as `getFocusTeamSide`.
 */
export function filterMatchesForTeam(matches: readonly MatchProject[], teamId?: string, teamName?: string): MatchProject[] {
  return matches.filter((p) => {
    if (teamId) {
      return p.homeSelection.archivedTeamId === teamId || p.awaySelection.archivedTeamId === teamId;
    }
    const name = (teamName ?? '').toLowerCase().trim();
    return p.homeTeam.name.toLowerCase().trim() === name || p.awayTeam.name.toLowerCase().trim() === name;
  });
}
