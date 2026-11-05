import { describe, expect, it } from 'vitest';
import type { MatchProject } from '@src/domain/match/types';
import { listMatchesOfTeam, listTeamsInMatches, teamRefKey } from './opponent-matches';

function match(id: string, playedAt: string, home: [string, string?], away: [string, string?]): MatchProject {
  return {
    metadata: { id, playedAt },
    homeTeam: { name: home[0] },
    awayTeam: { name: away[0] },
    homeSelection: { teamName: home[0], archivedTeamId: home[1] },
    awaySelection: { teamName: away[0], archivedTeamId: away[1] },
  } as unknown as MatchProject;
}

const matches = [
  match('m1', '2026-10-01', ['Rivals', 'r'], ['Us', 'u']),
  match('m2', '2026-10-20', ['Others'], ['Rivals', 'r']),
  match('m3', '2026-09-01', ['Us', 'u'], ['Others']),
];

describe('opponent matches', () => {
  it('lists every team once with its match count', () => {
    const teams = listTeamsInMatches(matches);
    expect(teams.map((team) => [team.name, team.matchCount])).toEqual([['Others', 2], ['Rivals', 2], ['Us', 2]]);
    expect(teamRefKey(teams[1])).toBe('id:r');
    expect(teamRefKey({ name: ' Others ' })).toBe('name:others');
  });

  it('lists the matches of a team, most recent first, with its side and the faced team', () => {
    const rivals = listMatchesOfTeam(matches, { archivedTeamId: 'r', name: 'Rivals' });
    expect(rivals.map((entry) => [entry.project.metadata.id, entry.side, entry.faced.name])).toEqual([
      ['m2', 'away', 'Others'],
      ['m1', 'home', 'Us'],
    ]);
  });
});
