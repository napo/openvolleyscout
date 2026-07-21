import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchTeamSelection } from '@src/domain/match/types';
import { computeSeasonTrend, computeDeltaVsAverage, type SeasonTrendPoint } from './season-trend';

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
  id?: string;
  playedAt?: string;
  homeSelection: MatchTeamSelection;
  awaySelection: MatchTeamSelection;
  homeName?: string;
  awayName?: string;
}): MatchProject {
  return {
    metadata: { id: overrides.id ?? id('match'), format: 'best-of-5', schemaVersion: 4, playedAt: overrides.playedAt },
    homeTeam: { id: 'h', code: 'H', name: overrides.homeName ?? 'Home', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'a', code: 'A', name: overrides.awayName ?? 'Away', players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: overrides.homeSelection,
    awaySelection: overrides.awaySelection,
    phase: 'completed',
    events: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as MatchProject;
}

describe('computeSeasonTrend', () => {
  it('returns one point per match, sorted chronologically by playedAt', () => {
    const teamId = 'team-x';
    const p1 = matchProject({
      id: 'm1', playedAt: '2026-03-10', homeName: 'Focus',
      homeSelection: selection({ archivedTeamId: teamId }),
      awaySelection: selection(),
    });
    const p2 = matchProject({
      id: 'm2', playedAt: '2026-01-05', homeName: 'Focus',
      homeSelection: selection({ archivedTeamId: teamId }),
      awaySelection: selection(),
    });
    const p3 = matchProject({
      id: 'm3', playedAt: '2026-02-15', homeName: 'Focus',
      homeSelection: selection({ archivedTeamId: teamId }),
      awaySelection: selection(),
    });

    const trend = computeSeasonTrend([p1, p2, p3], { teamId });

    expect(trend.map((pt) => pt.matchId)).toEqual(['m2', 'm3', 'm1']);
    expect(trend).toHaveLength(3);
  });

  it('resolves opponent name based on which side the focus team occupies', () => {
    const teamId = 'team-x';
    const asHome = matchProject({
      id: 'm1', playedAt: '2026-01-01', homeName: 'Focus', awayName: 'Rival A',
      homeSelection: selection({ archivedTeamId: teamId, teamName: 'Focus' }),
      awaySelection: selection({ teamName: 'Rival A' }),
    });
    const asAway = matchProject({
      id: 'm2', playedAt: '2026-01-02', homeName: 'Rival B', awayName: 'Focus',
      homeSelection: selection({ teamName: 'Rival B' }),
      awaySelection: selection({ archivedTeamId: teamId, teamName: 'Focus' }),
    });

    const trend = computeSeasonTrend([asHome, asAway], { teamId });

    expect(trend[0].opponentName).toBe('Rival A');
    expect(trend[1].opponentName).toBe('Rival B');
  });

  it('does not crash for a team with no matches', () => {
    expect(computeSeasonTrend([], { teamId: 'nobody' })).toEqual([]);
  });
});

describe('computeDeltaVsAverage', () => {
  function point(matchId: string, sideOutPct: number | null): SeasonTrendPoint {
    return { matchId, playedAt: null, opponentName: 'X', values: { sideOutPct } };
  }

  it('compares the latest point against the average of every prior point', () => {
    const trend = [point('1', 0.5), point('2', 0.6), point('3', 0.8)];
    const deltas = computeDeltaVsAverage(trend);
    const sideOut = deltas.find((d) => d.axis === 'sideOutPct')!;
    expect(sideOut.latest).toBe(0.8);
    expect(sideOut.average).toBeCloseTo(0.55, 5);
    expect(sideOut.delta).toBeCloseTo(0.25, 5);
  });

  it('skips null values when averaging', () => {
    const trend = [point('1', null), point('2', 0.4), point('3', 0.6)];
    const deltas = computeDeltaVsAverage(trend);
    const sideOut = deltas.find((d) => d.axis === 'sideOutPct')!;
    expect(sideOut.average).toBe(0.4);
  });

  it('returns null average/delta when there is only one point', () => {
    const deltas = computeDeltaVsAverage([point('1', 0.5)]);
    const sideOut = deltas.find((d) => d.axis === 'sideOutPct')!;
    expect(sideOut.latest).toBe(0.5);
    expect(sideOut.average).toBeNull();
    expect(sideOut.delta).toBeNull();
  });

  it('returns an empty-shaped result for an empty trend', () => {
    const deltas = computeDeltaVsAverage([]);
    expect(deltas.every((d) => d.latest === null && d.average === null && d.delta === null)).toBe(true);
  });
});
