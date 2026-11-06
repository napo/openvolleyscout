import { describe, expect, it } from 'vitest';
import type { ArchivedTeam } from '@src/domain/team/types';
import { queryTeamLibrary } from './team-library';

const team = (id: string, name: string, code: string, coach = '', assistant = ''): ArchivedTeam => ({
  id, name, teamCode: code, staff: { headCoach: coach, assistantCoach: assistant }, rosterIds: [], createdAt: 0, updatedAt: 0,
});
const teams = [team('b', 'Volley 10', 'B10', 'José Rossi'), team('a', 'Volley 2', 'A02', 'Chen', 'Mori'), team('c', 'Aurora', 'C03')];

describe('team library query', () => {
  it('searches across data columns, ignoring case and accents', () => {
    expect(queryTeamLibrary(teams, 'VOLLEY jose b10', 'name', 'ascending', 'it').map((row) => row.id)).toEqual(['b']);
    expect(queryTeamLibrary(teams, 'mori', 'name', 'ascending', 'it').map((row) => row.id)).toEqual(['a']);
    expect(queryTeamLibrary(teams, 'missing', 'name', 'ascending', 'it')).toEqual([]);
  });
  it('sorts names and codes naturally in both directions without mutating input', () => {
    expect(queryTeamLibrary(teams, '  ', 'name', 'ascending', 'it').map((row) => row.id)).toEqual(['c', 'a', 'b']);
    expect(queryTeamLibrary(teams, '', 'teamCode', 'descending', 'it').map((row) => row.id)).toEqual(['c', 'b', 'a']);
    expect(teams.map((row) => row.id)).toEqual(['b', 'a', 'c']);
  });
  it('keeps absent staff last in both sort directions', () => {
    for (const direction of ['ascending', 'descending'] as const) {
      expect(queryTeamLibrary(teams, '', 'headCoach', direction, 'it').at(-1)?.id).toBe('c');
      expect(queryTeamLibrary(teams, '', 'assistantCoach', direction, 'it')[0].id).toBe('a');
    }
  });
});
