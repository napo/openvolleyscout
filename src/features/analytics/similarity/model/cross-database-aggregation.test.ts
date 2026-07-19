import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchRosterPlayer, MatchTeamSelection } from '@src/domain/match/types';
import { buildCrossDatabaseAggregation } from './cross-database-aggregation';

let nextId = 1;
function id(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

function archivedRosterPlayer(overrides: Partial<MatchRosterPlayer> = {}): MatchRosterPlayer {
  return {
    id: id('roster-player'),
    jerseyNumber: 7,
    firstName: 'First',
    lastName: 'Last',
    shortName: 'F. Last',
    playerCode: 'X',
    source: 'archived_roster',
    archivedPlayerId: id('archived-player'),
    ...overrides,
  };
}

function manualEntryPlayer(overrides: Partial<MatchRosterPlayer> = {}): MatchRosterPlayer {
  return {
    id: id('manual-player'),
    jerseyNumber: 9,
    firstName: 'Manual',
    lastName: 'Entry',
    shortName: 'M. Entry',
    playerCode: 'Y',
    source: 'manual_entry',
    ...overrides,
  };
}

function selection(overrides: Partial<MatchTeamSelection> & Pick<MatchTeamSelection, 'roster'>): MatchTeamSelection {
  return {
    teamId: id('team'),
    teamName: 'Team',
    source: 'archived_team',
    staff: { headCoach: '', assistantCoach: '' },
    ...overrides,
  };
}

function matchProject(overrides: {
  homeSelection: MatchTeamSelection;
  awaySelection: MatchTeamSelection;
}): MatchProject {
  return {
    metadata: { id: id('match'), format: 'best-of-5', schemaVersion: 4 },
    homeTeam: { id: 'h', code: 'H', name: 'Home', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'a', code: 'A', name: 'Away', players: [], staff: { headCoach: '', assistantCoach: '' } },
    phase: 'completed',
    events: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as unknown as MatchProject;
}

describe('buildCrossDatabaseAggregation', () => {
  it('excludes manual_entry players and counts them', async () => {
    const manual = manualEntryPlayer();
    const project = matchProject({
      homeSelection: selection({ roster: [manual], archivedTeamId: 'team-home' }),
      awaySelection: selection({ roster: [] }),
    });

    const result = await buildCrossDatabaseAggregation([project]);

    expect(result.players).toHaveLength(0);
    expect(result.excludedPlayerAppearances).toBe(1);
  });

  it('excludes team appearances without an archivedTeamId', async () => {
    const project = matchProject({
      homeSelection: selection({ roster: [], archivedTeamId: undefined }),
      awaySelection: selection({ roster: [], archivedTeamId: 'team-away' }),
    });

    const result = await buildCrossDatabaseAggregation([project]);

    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].archivedTeamId).toBe('team-away');
    expect(result.excludedTeamAppearances).toBe(1);
  });

  it('merges the same archived player/team across two matches into one sample', async () => {
    const stablePlayer = archivedRosterPlayer({ archivedPlayerId: 'player-42', jerseyNumber: 4, firstName: 'Stable' });

    const project1 = matchProject({
      homeSelection: selection({ roster: [stablePlayer], archivedTeamId: 'team-x' }),
      awaySelection: selection({ roster: [] }),
    });
    const project2 = matchProject({
      homeSelection: selection({ roster: [stablePlayer], archivedTeamId: 'team-x' }),
      awaySelection: selection({ roster: [] }),
    });

    const result = await buildCrossDatabaseAggregation([project1, project2]);

    expect(result.players).toHaveLength(1);
    expect(result.players[0].playerId).toBe('player-42');
    expect(result.players[0].matchesCount).toBe(2);

    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].archivedTeamId).toBe('team-x');
    expect(result.teams[0].matchesCount).toBe(2);
  });

  it('returns empty results for an empty database', async () => {
    const result = await buildCrossDatabaseAggregation([]);
    expect(result.players).toHaveLength(0);
    expect(result.teams).toHaveLength(0);
    expect(result.excludedPlayerAppearances).toBe(0);
    expect(result.excludedTeamAppearances).toBe(0);
  });
});
