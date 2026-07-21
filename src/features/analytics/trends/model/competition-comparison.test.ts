import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchTeamSelection } from '@src/domain/match/types';
import {
  matchIsInCompetition,
  filterMatchesForCompetition,
  listDistinctCompetitions,
  computeCompetitionComparison,
} from './competition-comparison';

let nextId = 1;
function id(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

function selection(overrides: Partial<MatchTeamSelection> = {}): MatchTeamSelection {
  return {
    teamId: id('team'),
    teamName: 'Team',
    source: 'archived_team',
    staff: { headCoach: '', assistantCoach: '' },
    roster: [],
    ...overrides,
  };
}

function matchProject(overrides: {
  competitionEntryId?: string;
  competition?: string;
  homeSelection: MatchTeamSelection;
  awaySelection: MatchTeamSelection;
}): MatchProject {
  return {
    metadata: {
      id: id('match'),
      format: 'best-of-5',
      schemaVersion: 4,
      competitionEntryId: overrides.competitionEntryId,
      competition: overrides.competition,
    },
    homeTeam: { id: 'h', code: 'H', name: 'Home', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'a', code: 'A', name: 'Away', players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: overrides.homeSelection,
    awaySelection: overrides.awaySelection,
    phase: 'completed',
    events: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as MatchProject;
}

describe('matchIsInCompetition', () => {
  it('matches by competitionEntryId when both sides have one', () => {
    const project = matchProject({ competitionEntryId: 'serie-a2', homeSelection: selection(), awaySelection: selection() });
    expect(matchIsInCompetition(project, { competitionEntryId: 'serie-a2' })).toBe(true);
    expect(matchIsInCompetition(project, { competitionEntryId: 'other' })).toBe(false);
  });

  it('falls back to normalized competition name when no id matches', () => {
    const project = matchProject({ competition: '  Serie A2 ', homeSelection: selection(), awaySelection: selection() });
    expect(matchIsInCompetition(project, { competitionName: 'serie a2' })).toBe(true);
    expect(matchIsInCompetition(project, { competitionName: 'Serie B' })).toBe(false);
  });

  it('returns false when neither id nor name is provided', () => {
    const project = matchProject({ homeSelection: selection(), awaySelection: selection() });
    expect(matchIsInCompetition(project, {})).toBe(false);
  });
});

describe('filterMatchesForCompetition', () => {
  it('filters a mixed pool of id-based and name-only matches', () => {
    const withId = matchProject({ competitionEntryId: 'serie-a2', competition: 'Serie A2', homeSelection: selection(), awaySelection: selection() });
    const nameOnly = matchProject({ competition: 'serie a2', homeSelection: selection(), awaySelection: selection() });
    const other = matchProject({ competition: 'Serie B', homeSelection: selection(), awaySelection: selection() });

    const result = filterMatchesForCompetition([withId, nameOnly, other], { competitionEntryId: 'serie-a2', competitionName: 'Serie A2' });
    expect(result).toHaveLength(2);
  });
});

describe('listDistinctCompetitions', () => {
  it('dedupes by id first, falling back to normalized name', () => {
    const m1 = matchProject({ competitionEntryId: 'serie-a2', competition: 'Serie A2', homeSelection: selection(), awaySelection: selection() });
    const m2 = matchProject({ competitionEntryId: 'serie-a2', competition: 'Serie A2', homeSelection: selection(), awaySelection: selection() });
    const m3 = matchProject({ competition: 'Coppa Italia', homeSelection: selection(), awaySelection: selection() });
    const m4 = matchProject({ homeSelection: selection(), awaySelection: selection() }); // no competition at all

    const options = listDistinctCompetitions([m1, m2, m3, m4]);
    expect(options).toHaveLength(2);
    const serie = options.find((o) => o.competitionEntryId === 'serie-a2');
    expect(serie?.matchCount).toBe(2);
    const coppa = options.find((o) => o.competitionName === 'Coppa Italia');
    expect(coppa?.matchCount).toBe(1);
  });
});

describe('computeCompetitionComparison', () => {
  it('ranks teams within one competition, ignoring matches from other competitions', async () => {
    const teamA = matchProject({
      competitionEntryId: 'league', homeSelection: selection({ archivedTeamId: 'team-a' }), awaySelection: selection({ archivedTeamId: 'team-b' }),
    });
    const teamAAgain = matchProject({
      competitionEntryId: 'league', homeSelection: selection({ archivedTeamId: 'team-a' }), awaySelection: selection({ archivedTeamId: 'team-c' }),
    });
    const otherCompetition = matchProject({
      competitionEntryId: 'cup', homeSelection: selection({ archivedTeamId: 'team-d' }), awaySelection: selection({ archivedTeamId: 'team-e' }),
    });

    const result = await computeCompetitionComparison([teamA, teamAAgain, otherCompetition], { competitionEntryId: 'league' });

    const teamIds = result.map((t) => t.archivedTeamId).sort();
    expect(teamIds).toEqual(['team-a', 'team-b', 'team-c']);
    expect(result.find((t) => t.archivedTeamId === 'team-a')?.matchesCount).toBe(2);
  });
});
