import type { ArchivedTeam } from '@src/domain/team/types';

export type TeamLibraryColumn = 'name' | 'teamCode' | 'headCoach' | 'assistantCoach';
export const TEAM_LIBRARY_COLUMNS: TeamLibraryColumn[] = ['name', 'teamCode', 'headCoach', 'assistantCoach'];
export const teamLibraryValue = (team: ArchivedTeam, column: TeamLibraryColumn): string =>
  column === 'headCoach' || column === 'assistantCoach' ? team.staff?.[column] ?? '' : team[column] ?? '';

/** Search every displayed data column, allowing words to match different cells. */
export function queryTeamLibrary(teams: readonly ArchivedTeam[], query: string, column: TeamLibraryColumn, direction: 'ascending' | 'descending', locale: string): ArchivedTeam[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return teams.filter((team) => {
    const values = TEAM_LIBRARY_COLUMNS.map((key) => normalize(teamLibraryValue(team, key)));
    return words.every((word) => values.some((value) => value.includes(word)));
  }).sort((a, b) => {
    const av = teamLibraryValue(a, column), bv = teamLibraryValue(b, column);
    // Missing values stay last in both directions.
    if (!av.trim() || !bv.trim()) return Number(!av.trim()) - Number(!bv.trim());
    const order = collator.compare(av, bv) || collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
    return direction === 'ascending' ? order : -order;
  });
}
