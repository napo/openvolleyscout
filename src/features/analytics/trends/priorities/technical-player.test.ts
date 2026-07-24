import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchTeamSelection } from '@src/domain/match/types';
import type { SkillStats, TeamStats, PlayerStats, MatchStats } from '@src/features/scouting/model/match-stats';
import {
  createEmptySkillStats,
  createEmptyTeamStats,
  buildMatchStatsQuickStats,
  buildCrossRotationStats,
} from '@src/features/scouting/model/match-stats';
import {
  computePlayerTechnicalDiagnosisFromResults,
  computePlayerTechnicalDiagnosis,
  getAvailablePlayersFromResults,
  getAvailablePlayers,
} from './technical-player';

function skill(overrides: Partial<SkillStats>): SkillStats {
  return { ...createEmptySkillStats(), ...overrides };
}

function playerFixture(input: {
  playerId: string;
  playerName?: string;
  role?: PlayerStats['role'];
  attack?: Partial<SkillStats>;
  serve?: Partial<SkillStats>;
  receive?: Partial<SkillStats>;
  set?: Partial<SkillStats>;
  block?: Partial<SkillStats>;
  blockPoints?: number;
}): PlayerStats {
  return {
    playerId: input.playerId,
    jerseyNumber: 7,
    playerName: input.playerName ?? 'Player X',
    teamSide: 'home',
    role: input.role,
    totalTouches: 0,
    points: 0,
    errors: 0,
    winningTouches: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: input.blockPoints ?? 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
    attack: skill(input.attack ?? {}),
    serve: skill(input.serve ?? {}),
    receive: skill(input.receive ?? {}),
    set: skill(input.set ?? {}),
    block: skill(input.block ?? {}),
    dig: skill({}),
    freeball: skill({}),
    cover: skill({}),
  };
}

function homeTeamStats(): TeamStats {
  return createEmptyTeamStats('home', 'Focus');
}

function matchStatsFixture(input: { homeSets: number; awaySets: number; players: PlayerStats[] }): MatchStats {
  const teamStatsRecord = { home: homeTeamStats(), away: createEmptyTeamStats('away', 'Rival') };
  const emptyPhase = { home: { sideOutAttempts: 0, sideOutWins: 0, sideOutPercentage: null }, away: { sideOutAttempts: 0, sideOutWins: 0, sideOutPercentage: null } };
  const emptyBreakPoint = { home: { breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null }, away: { breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null } };

  return {
    teamStats: teamStatsRecord,
    playerStats: input.players,
    setStats: [],
    rallyStats: [],
    setsWon: { home: input.homeSets, away: input.awaySets },
    totalTouches: 0,
    quickStats: buildMatchStatsQuickStats({ teamStats: teamStatsRecord, playerStats: input.players }),
    advancedStats: { sideOut: emptyPhase, breakPoint: emptyBreakPoint, rotations: { home: [], away: [] } },
    sideOutStats: emptyPhase,
    breakPointStats: emptyBreakPoint,
    rotationStats: { home: [], away: [] },
    crossRotationStats: buildCrossRotationStats({ rallyStats: [], setStartedEvents: [], pointEvents: [] }),
  };
}

describe('computePlayerTechnicalDiagnosisFromResults', () => {
  it("benchmarks the player's own stats only against matches the team won", () => {
    const won = matchStatsFixture({
      homeSets: 3,
      awaySets: 0,
      players: [playerFixture({
        playerId: 'p1', role: 'outside_hitter', attack: { total: 20, hash: 12, equal: 2 },
      })], // (12-2)/20 = 0.5
    });
    const lost = matchStatsFixture({
      homeSets: 1,
      awaySets: 3,
      players: [playerFixture({
        playerId: 'p1', role: 'outside_hitter', attack: { total: 20, hash: 4, equal: 6 },
      })], // (4-6)/20 = -0.1
    });

    const results = [
      { stats: won, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 },
      { stats: lost, focusTeamSide: 'home' as const, won: false, setsPlayed: 4 },
    ];

    const diagnosis = computePlayerTechnicalDiagnosisFromResults(results, 'Focus', 'p1');
    const attack = diagnosis.find((d) => d.category.id === 'attackEfficiency')!;

    expect(attack.benchmark).toBeCloseTo(0.5, 5);
    expect(attack.current).toBeCloseTo(0.2, 5); // pooled: (16-8)/40 = 0.2
  });

  it('filters categories by the role recorded on the player', () => {
    const won = matchStatsFixture({
      homeSets: 3,
      awaySets: 0,
      players: [playerFixture({ playerId: 'p1', role: 'setter', serve: { total: 20, hash: 2 } })],
    });
    const results = [{ stats: won, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 }];

    const diagnosis = computePlayerTechnicalDiagnosisFromResults(results, 'Focus', 'p1');

    expect(diagnosis.some((d) => d.category.id === 'attackEfficiency')).toBe(false);
    expect(diagnosis.some((d) => d.category.id === 'receptionEfficiency')).toBe(false);
    expect(diagnosis.some((d) => d.category.id === 'serveEfficiency')).toBe(true);
  });

  it('returns no categories for a player not present in the selected matches', () => {
    const won = matchStatsFixture({ homeSets: 3, awaySets: 0, players: [] });
    const results = [{ stats: won, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 }];

    // No role on file → falls back to the full category set, but every value stays null.
    const diagnosis = computePlayerTechnicalDiagnosisFromResults(results, 'Focus', 'ghost');
    diagnosis.forEach((entry) => {
      expect(entry.current).toBeNull();
      expect(entry.deficit).toBeNull();
    });
  });

  it('gates the deficit to null below the minimum sample size', () => {
    const won = matchStatsFixture({
      homeSets: 3, awaySets: 0, players: [playerFixture({ playerId: 'p1', role: 'outside_hitter', attack: { total: 3, hash: 3 } })],
    });
    const results = [{ stats: won, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 }];

    const diagnosis = computePlayerTechnicalDiagnosisFromResults(results, 'Focus', 'p1');
    const attack = diagnosis.find((d) => d.category.id === 'attackEfficiency')!;

    expect(attack.sampleSize).toBe(3);
    expect(attack.deficit).toBeNull();
  });
});

describe('getAvailablePlayersFromResults', () => {
  it('lists only home-side (focus team) players from the pooled window', () => {
    const match = matchStatsFixture({
      homeSets: 3,
      awaySets: 0,
      players: [
        playerFixture({ playerId: 'p1', playerName: 'Home Player', role: 'libero' }),
      ],
    });
    const results = [{ stats: match, focusTeamSide: 'home' as const, won: true, setsPlayed: 3 }];

    const players = getAvailablePlayersFromResults(results, 'Focus');
    expect(players).toHaveLength(1);
    expect(players[0].playerId).toBe('p1');
    expect(players[0].role).toBe('libero');
  });

  it('returns an empty list with no matches', () => {
    expect(getAvailablePlayersFromResults([], 'Focus')).toEqual([]);
  });
});

describe('MatchProject wrappers', () => {
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

  it('does not throw for a match with no events', () => {
    expect(getAvailablePlayers([emptyMatchProject()], { teamId: 'team-x' })).toEqual([]);
    expect(computePlayerTechnicalDiagnosis([emptyMatchProject()], { teamId: 'team-x' }, 'nobody').length).toBeGreaterThan(0);
  });

  it('does not crash for an empty match list', () => {
    expect(getAvailablePlayers([], { teamId: 'nobody' })).toEqual([]);
    expect(computePlayerTechnicalDiagnosis([], { teamId: 'nobody' }, 'nobody').length).toBeGreaterThan(0);
  });
});
