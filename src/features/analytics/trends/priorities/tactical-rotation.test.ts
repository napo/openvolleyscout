import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchTeamSelection } from '@src/domain/match/types';
import type { RotationStats } from '@src/features/scouting/model/match-stats';
import { aggregateRotationDiagnosis, computeRotationDiagnosis, getWeakRotations } from './tactical-rotation';

function rotationStats(overrides: Partial<RotationStats> & { rotationNumber: RotationStats['rotationNumber'] }): RotationStats {
  return {
    sideOutAttempts: 0,
    sideOutWins: 0,
    sideOutPercentage: null,
    breakPointAttempts: 0,
    breakPointWins: 0,
    breakPointPercentage: null,
    pointsScored: 0,
    pointsConceded: 0,
    ...overrides,
  };
}

function emptyRotations(): RotationStats[] {
  return ([1, 2, 3, 4, 5, 6] as const).map((rotationNumber) => rotationStats({ rotationNumber }));
}

describe('aggregateRotationDiagnosis', () => {
  it('sums attempts/wins for the same rotation across matches', () => {
    const match1 = emptyRotations();
    match1[0] = rotationStats({ rotationNumber: 1, sideOutAttempts: 10, sideOutWins: 6 });
    const match2 = emptyRotations();
    match2[0] = rotationStats({ rotationNumber: 1, sideOutAttempts: 10, sideOutWins: 4 });

    const diagnosis = aggregateRotationDiagnosis([match1, match2]);
    const rotation1 = diagnosis.find((d) => d.rotation === 1)!;

    expect(rotation1.sideOut.attempts).toBe(20);
    expect(rotation1.sideOut.wins).toBe(10);
    expect(rotation1.sideOut.percentage).toBeCloseTo(0.5, 5);
  });

  it('tags green when at/above the good threshold and red when at/below the bad threshold', () => {
    const rotations = emptyRotations();
    rotations[0] = rotationStats({
      rotationNumber: 1, sideOutAttempts: 100, sideOutWins: 60, breakPointAttempts: 100, breakPointWins: 20,
    });
    rotations[1] = rotationStats({
      rotationNumber: 2, sideOutAttempts: 100, sideOutWins: 30, breakPointAttempts: 100, breakPointWins: 45,
    });

    const diagnosis = aggregateRotationDiagnosis([rotations]);
    const r1 = diagnosis.find((d) => d.rotation === 1)!;
    const r2 = diagnosis.find((d) => d.rotation === 2)!;

    expect(r1.sideOut.tone).toBe('green'); // 60% >= 55% good threshold
    expect(r1.breakPoint.tone).toBe('red'); // 20% <= 30% bad threshold
    expect(r2.sideOut.tone).toBe('red'); // 30% <= 45% bad threshold
    expect(r2.breakPoint.tone).toBe('green'); // 45% >= 40% good threshold
  });

  it('leaves tone/percentage null when a rotation has no attempts', () => {
    const diagnosis = aggregateRotationDiagnosis([emptyRotations()]);
    diagnosis.forEach((entry) => {
      expect(entry.sideOut.percentage).toBeNull();
      expect(entry.sideOut.tone).toBeNull();
      expect(entry.breakPoint.percentage).toBeNull();
      expect(entry.breakPoint.tone).toBeNull();
    });
  });

  it('returns all 6 rotations even with no matches', () => {
    expect(aggregateRotationDiagnosis([]).map((d) => d.rotation)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('getWeakRotations', () => {
  it('collects red-tagged phases only, sorted worst (lowest %) first', () => {
    const rotations = emptyRotations();
    rotations[0] = rotationStats({ rotationNumber: 1, sideOutAttempts: 100, sideOutWins: 40 }); // 40%, red
    rotations[2] = rotationStats({ rotationNumber: 3, sideOutAttempts: 100, sideOutWins: 20 }); // 20%, red
    rotations[4] = rotationStats({ rotationNumber: 5, sideOutAttempts: 100, sideOutWins: 90 }); // 90%, green

    const diagnosis = aggregateRotationDiagnosis([rotations]);
    const weak = getWeakRotations(diagnosis);

    expect(weak.map((w) => `${w.rotation}:${w.phase}`)).toEqual(['3:sideOut', '1:sideOut']);
  });

  it('returns an empty list when nothing is red', () => {
    const rotations = emptyRotations();
    rotations[0] = rotationStats({ rotationNumber: 1, sideOutAttempts: 100, sideOutWins: 90 });
    expect(getWeakRotations(aggregateRotationDiagnosis([rotations]))).toEqual([]);
  });
});

describe('computeRotationDiagnosis (MatchProject wrapper)', () => {
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

  it('does not throw and returns 6 empty rotations for a match with no events', () => {
    const diagnosis = computeRotationDiagnosis([emptyMatchProject()], { teamId: 'team-x' });
    expect(diagnosis).toHaveLength(6);
    diagnosis.forEach((entry) => expect(entry.sideOut.attempts).toBe(0));
  });

  it('does not crash for an empty match list', () => {
    expect(computeRotationDiagnosis([], { teamId: 'nobody' })).toHaveLength(6);
  });
});
