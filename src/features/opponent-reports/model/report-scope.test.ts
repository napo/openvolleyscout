import { describe, it, expect } from 'vitest';
import type { MatchProject } from '@src/domain/match/types';
import { listReportScopes, matchScopeKey, buildReportSimilarities } from './report-scope';

function match(id: string, competition = 'League', season = '2026/27'): MatchProject {
  return {
    metadata: { id, competition, season, playedAt: id === 'latest' ? '2026-11-06' : '2026-10-01', format: 'best-of-5', schemaVersion: 4 },
    homeTeam: { id: 'h', code: 'H', name: 'Home', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'a', code: 'A', name: 'Away', players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: { teamId: 'h', teamName: 'Home', archivedTeamId: 'h', source: 'archived_team', roster: [] },
    awaySelection: { teamId: 'a', teamName: 'Away', archivedTeamId: 'a', source: 'archived_team', roster: [] },
    events: [], phase: 'completed', createdAt: 0, updatedAt: 0,
  } as unknown as MatchProject;
}

describe('report competition scope', () => {
  it('uses explicit competition and season, ordered by most recent match, with no inferred calendar', () => {
    const scopes = listReportScopes([match('old', 'Cup'), match('latest'), match('same')]);
    expect(scopes.map((scope) => scope.competition)).toEqual(['League', 'Cup']);
    expect(matchScopeKey(match('x', ' League '))).toBe(matchScopeKey(match('y')));
    expect(matchScopeKey(match('x', 'League', '2025/26'))).not.toBe(matchScopeKey(match('y')));
  });
  it('does not count other competitions or seasons towards the comparison sample', async () => {
    const a = match('a');
    const result = await buildReportSimilarities([a, match('b'), match('c', 'Cup'), match('d', 'League', '2025/26')], matchScopeKey(a));
    expect(result.get('a')).toEqual({ score: null, home: { matches: 2, actions: 0 }, away: { matches: 2, actions: 0 } });
  });
  it('keeps unknown seasons explicit and handles an empty archive', async () => {
    expect(listReportScopes([match('a', '', '')])[0]).toMatchObject({ competition: '', season: '' });
    expect(await buildReportSimilarities([], '')).toEqual(new Map());
  });
});
