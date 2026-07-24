import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchTeamSelection } from '@src/domain/match/types';
import type { SkillStats, MatchStats } from '@src/features/scouting/model/match-stats';
import {
  createEmptySkillStats,
  createEmptyTeamStats,
  buildMatchStatsQuickStats,
  buildCrossRotationStats,
} from '@src/features/scouting/model/match-stats';
import { evaluationPointFromStats, computeCategoryEvaluationTrend } from './evaluation-breakdown';

function skill(overrides: Partial<SkillStats>): SkillStats {
  return { ...createEmptySkillStats(), ...overrides };
}

function matchStatsFixture(attack: Partial<SkillStats>): MatchStats {
  const home = { ...createEmptyTeamStats('home', 'Focus'), attack: skill(attack) };
  const away = createEmptyTeamStats('away', 'Rival');
  const teamStatsRecord = { home, away };
  const emptyPhase = { home: { sideOutAttempts: 0, sideOutWins: 0, sideOutPercentage: null }, away: { sideOutAttempts: 0, sideOutWins: 0, sideOutPercentage: null } };
  const emptyBreakPoint = { home: { breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null }, away: { breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null } };

  return {
    teamStats: teamStatsRecord,
    playerStats: [],
    setStats: [],
    rallyStats: [],
    setsWon: { home: 3, away: 0 },
    totalTouches: 0,
    quickStats: buildMatchStatsQuickStats({ teamStats: teamStatsRecord, playerStats: [] }),
    advancedStats: { sideOut: emptyPhase, breakPoint: emptyBreakPoint, rotations: { home: [], away: [] } },
    sideOutStats: emptyPhase,
    breakPointStats: emptyBreakPoint,
    rotationStats: { home: [], away: [] },
    crossRotationStats: buildCrossRotationStats({ rallyStats: [], setStartedEvents: [], pointEvents: [] }),
  };
}

describe('evaluationPointFromStats', () => {
  it('extracts the per-symbol counts for the requested team skill', () => {
    const stats = matchStatsFixture({
      total: 20, hash: 8, plus: 4, exclamation: 1, minus: 3, slash: 2, equal: 2,
    });

    const point = evaluationPointFromStats(stats, 'home', 'attack', { matchId: 'm1', playedAt: '2026-01-01' });

    expect(point.total).toBe(20);
    expect(point.counts['#']).toBe(8);
    expect(point.counts['+']).toBe(4);
    expect(point.counts['!']).toBe(1);
    expect(point.counts['-']).toBe(3);
    expect(point.counts['/']).toBe(2);
    expect(point.counts['=']).toBe(2);
    expect(point.opponentName).toBe('Rival');
  });

  it('returns all-zero counts when the requested player is not present in the match', () => {
    const stats = matchStatsFixture({ total: 20, hash: 8 });
    const point = evaluationPointFromStats(stats, 'home', 'attack', { matchId: 'm1', playedAt: null, playerId: 'ghost' });
    expect(point.total).toBe(0);
    expect(point.counts['#']).toBe(0);
  });
});

describe('computeCategoryEvaluationTrend (MatchProject wrapper)', () => {
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

  function emptyMatchProject(id: string, playedAt: string): MatchProject {
    return {
      metadata: { id, format: 'best-of-5', schemaVersion: 4, playedAt },
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

  it('returns one chronologically-sorted point per match without crashing on empty events', () => {
    const p1 = emptyMatchProject('m1', '2026-02-01');
    const p2 = emptyMatchProject('m2', '2026-01-01');

    const trend = computeCategoryEvaluationTrend([p1, p2], { teamId: 'team-x' }, 'attack');

    expect(trend.map((pt) => pt.matchId)).toEqual(['m2', 'm1']);
    trend.forEach((pt) => expect(pt.total).toBe(0));
  });

  it('returns an empty array for an empty match list', () => {
    expect(computeCategoryEvaluationTrend([], { teamId: 'nobody' }, 'serve')).toEqual([]);
  });
});
