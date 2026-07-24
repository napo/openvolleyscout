import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchTeamSelection } from '@src/domain/match/types';
import type { SkillStats, TeamStats, MatchStats } from '@src/features/scouting/model/match-stats';
import {
  createEmptySkillStats,
  createEmptyTeamStats,
  buildMatchStatsQuickStats,
  buildCrossRotationStats,
} from '@src/features/scouting/model/match-stats';
import {
  computeTeamTechnicalDiagnosis,
  computeTeamTechnicalDiagnosisFromResults,
} from './technical-team';

function skill(overrides: Partial<SkillStats>): SkillStats {
  return { ...createEmptySkillStats(), ...overrides };
}

function teamStats(input: {
  side: 'home' | 'away';
  name: string;
  attack?: Partial<SkillStats>;
  serve?: Partial<SkillStats>;
  receive?: Partial<SkillStats>;
  set?: Partial<SkillStats>;
  block?: Partial<SkillStats>;
  blockPoints?: number;
}): TeamStats {
  return {
    ...createEmptyTeamStats(input.side, input.name),
    attack: skill(input.attack ?? {}),
    serve: skill(input.serve ?? {}),
    receive: skill(input.receive ?? {}),
    set: skill(input.set ?? {}),
    block: skill(input.block ?? {}),
    blockPoints: input.blockPoints ?? 0,
  };
}

/** A minimal but fully-typed MatchStats, focus team always 'home' with the given result. */
function matchStatsFixture(input: {
  homeSets: number;
  awaySets: number;
  attack?: Partial<SkillStats>;
  serve?: Partial<SkillStats>;
  receive?: Partial<SkillStats>;
  set?: Partial<SkillStats>;
  block?: Partial<SkillStats>;
  blockPoints?: number;
}): MatchStats {
  const home = teamStats({
    side: 'home',
    name: 'Focus',
    attack: input.attack,
    serve: input.serve,
    receive: input.receive,
    set: input.set,
    block: input.block,
    blockPoints: input.blockPoints,
  });
  const away = teamStats({ side: 'away', name: 'Rival' });
  const teamStatsRecord = { home, away };
  const emptyPhase = { home: { sideOutAttempts: 0, sideOutWins: 0, sideOutPercentage: null }, away: { sideOutAttempts: 0, sideOutWins: 0, sideOutPercentage: null } };
  const emptyBreakPoint = { home: { breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null }, away: { breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null } };

  return {
    teamStats: teamStatsRecord,
    playerStats: [],
    setStats: [],
    rallyStats: [],
    setsWon: { home: input.homeSets, away: input.awaySets },
    totalTouches: 0,
    quickStats: buildMatchStatsQuickStats({ teamStats: teamStatsRecord, playerStats: [] }),
    advancedStats: { sideOut: emptyPhase, breakPoint: emptyBreakPoint, rotations: { home: [], away: [] } },
    sideOutStats: emptyPhase,
    breakPointStats: emptyBreakPoint,
    rotationStats: { home: [], away: [] },
    crossRotationStats: buildCrossRotationStats({ rallyStats: [], setStartedEvents: [], pointEvents: [] }),
  };
}

describe('computeTeamTechnicalDiagnosisFromResults', () => {
  it('benchmarks only against matches the team won, not the losses', () => {
    const won = matchStatsFixture({
      homeSets: 3, awaySets: 0, attack: { total: 20, hash: 12, equal: 2 }, // (12-2)/20 = 0.5
    });
    const lost = matchStatsFixture({
      homeSets: 1, awaySets: 3, attack: { total: 20, hash: 4, equal: 6 }, // (4-6)/20 = -0.1
    });

    const results = [
      { stats: won, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 },
      { stats: lost, focusTeamSide: 'home' as const, won: false, setsPlayed: 4 },
    ];

    const diagnosis = computeTeamTechnicalDiagnosisFromResults(results, 'Focus');
    const attack = diagnosis.find((d) => d.category.id === 'attackEfficiency')!;

    // benchmark = only the won match's attack efficiency (0.5)
    expect(attack.benchmark).toBeCloseTo(0.5, 5);
    // current = both matches pooled: (12+4 - (2+6)) / 40 = 8/40 = 0.2
    expect(attack.current).toBeCloseTo(0.2, 5);
    expect(attack.deficit).toBeCloseTo(0.3, 5);
  });

  it('reports a null benchmark when the team has no wins in the window', () => {
    const lost = matchStatsFixture({ homeSets: 1, awaySets: 3, attack: { total: 20, hash: 4, equal: 6 } });
    const results = [{ stats: lost, focusTeamSide: 'home' as const, won: false, setsPlayed: 4 }];

    const diagnosis = computeTeamTechnicalDiagnosisFromResults(results, 'Focus');
    const attack = diagnosis.find((d) => d.category.id === 'attackEfficiency')!;

    expect(attack.benchmark).toBeNull();
    expect(attack.deficit).toBeNull();
    expect(attack.current).not.toBeNull();
  });

  it('gates the deficit to null when the sample size is below the minimum', () => {
    const won = matchStatsFixture({ homeSets: 3, awaySets: 0, attack: { total: 3, hash: 3 } });
    const results = [{ stats: won, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 }];

    const diagnosis = computeTeamTechnicalDiagnosisFromResults(results, 'Focus');
    const attack = diagnosis.find((d) => d.category.id === 'attackEfficiency')!;

    expect(attack.sampleSize).toBe(3);
    expect(attack.deficit).toBeNull();
  });

  it('computes the raw-rate block category per set played', () => {
    const won = matchStatsFixture({
      homeSets: 3, awaySets: 0, blockPoints: 12, block: { total: 30 },
    });
    const results = [{ stats: won, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 }];

    const diagnosis = computeTeamTechnicalDiagnosisFromResults(results, 'Focus');
    const block = diagnosis.find((d) => d.category.id === 'blockPointsPerSet')!;

    expect(block.current).toBeCloseTo(4, 5); // 12 / 3 sets
    // current === benchmark here (only one, won, match) → deficit 0, not null
    expect(block.deficit).toBe(0);
  });

  it('returns all 7 categories even with no matches', () => {
    expect(computeTeamTechnicalDiagnosisFromResults([], 'Focus')).toHaveLength(7);
  });
});

describe('computeTeamTechnicalDiagnosis (MatchProject wrapper)', () => {
  function selection(overrides: Partial<MatchTeamSelection> = {}): MatchTeamSelection {
    return {
      teamId: 'team-x',
      teamName: 'Focus',
      source: 'archived_team',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
      ...overrides,
    };
  }

  function emptyMatchProject(): MatchProject {
    return {
      metadata: { id: 'm1', format: 'best-of-5', schemaVersion: 4 },
      homeTeam: { id: 'h', code: 'H', name: 'Focus', players: [], staff: { headCoach: '', assistantCoach: '' } },
      awayTeam: { id: 'a', code: 'A', name: 'Rival', players: [], staff: { headCoach: '', assistantCoach: '' } },
      homeSelection: selection({ archivedTeamId: 'team-x' }),
      awaySelection: selection({ teamName: 'Rival', archivedTeamId: undefined }),
      phase: 'completed',
      events: [],
      createdAt: 0,
      updatedAt: 0,
    } as unknown as MatchProject;
  }

  it('does not throw for a match with no events and returns all categories with null values', () => {
    const diagnosis = computeTeamTechnicalDiagnosis([emptyMatchProject()], { teamId: 'team-x' });
    expect(diagnosis).toHaveLength(7);
    diagnosis.forEach((entry) => expect(entry.deficit).toBeNull());
  });

  it('does not crash for an empty match list', () => {
    expect(computeTeamTechnicalDiagnosis([], { teamId: 'nobody' })).toHaveLength(7);
  });
});
