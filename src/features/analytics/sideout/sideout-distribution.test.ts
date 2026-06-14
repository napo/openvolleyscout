/**
 * Side-out distribution tests.
 * Runs under Node.js via ts-node/esm.
 * Value imports use relative paths — @src/ aliases are type-only.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
// Value imports must be relative (ts-node/esm cannot resolve @src/ at runtime)
import {
  computeSideOutDistribution,
  createDefaultSideOutStudyFilters,
  extractSideOutSequences,
} from './sideout-distribution';

let touchCounter = 0;

function touch(partial: {
  teamSide: TeamSide;
  skill: SkillType;
  sequenceNumber: number;
  evaluation?: SkillEvaluation;
  skillTypeCode?: string;
  serveType?: string;
  attackType?: string;
  startZoneCode?: string;
  playerId?: string;
  homeSetterPosition?: number;
  awaySetterPosition?: number;
}): BallTouch {
  touchCounter += 1;
  return {
    id: `touch-${touchCounter}`,
    setNumber: 1,
    rallyNumber: 1,
    createdAt: touchCounter,
    ...partial,
  };
}

function rally(partial: {
  rallyNumber?: number;
  setNumber?: number;
  servingTeam?: TeamSide | null;
  pointWinner?: TeamSide | null;
  touches: BallTouch[];
}): RallyStats {
  return {
    setNumber: partial.setNumber ?? 1,
    rallyNumber: partial.rallyNumber ?? 1,
    touches: partial.touches,
    dataVolleyCode: '',
    servingTeam: partial.servingTeam ?? 'away',
    pointWinner: partial.pointWinner ?? null,
    terminalReason: null,
  };
}

/** away serves, home receives → home set → home attack from the given zone. */
function sideOutRally(options: {
  rallyNumber: number;
  receptionEvaluation?: SkillEvaluation;
  receiveBallType?: string;
  attackZone?: string;
  attackEvaluation?: SkillEvaluation;
  withSet?: boolean;
  withAttack?: boolean;
  setterPosition?: number;
  setterPlayerId?: string;
  attackBallType?: string;
}): RallyStats {
  const touches: BallTouch[] = [
    touch({ teamSide: 'away', skill: 'serve', sequenceNumber: 1, skillTypeCode: options.receiveBallType }),
    touch({
      teamSide: 'home',
      skill: 'receive',
      sequenceNumber: 2,
      evaluation: options.receptionEvaluation ?? '#',
      skillTypeCode: options.receiveBallType,
      homeSetterPosition: options.setterPosition,
    }),
  ];
  if (options.withSet !== false) {
    touches.push(touch({
      teamSide: 'home',
      skill: 'set',
      sequenceNumber: 3,
      playerId: options.setterPlayerId,
    }));
  }
  if (options.withAttack !== false) {
    touches.push(touch({
      teamSide: 'home',
      skill: 'attack',
      sequenceNumber: 4,
      evaluation: options.attackEvaluation ?? '#',
      startZoneCode: options.attackZone ?? '4',
      attackType: options.attackBallType,
    }));
  }
  return rally({ rallyNumber: options.rallyNumber, touches });
}

describe('extractSideOutSequences', () => {
  it('extracts receive → set → attack for the receiving team', () => {
    const sequences = extractSideOutSequences([
      sideOutRally({ rallyNumber: 1, attackZone: '4' }),
    ]);
    assert.equal(sequences.length, 1);
    assert.equal(sequences[0].teamSide, 'home');
    assert.equal(sequences[0].set?.skill, 'set');
    assert.equal(sequences[0].attack?.skill, 'attack');
    assert.equal(sequences[0].target, 'zone4');
  });

  it('classifies targets from the attack start zone', () => {
    const zones: Array<[string, string]> = [
      ['4', 'zone4'], ['7', 'zone7'],
      ['3', 'zone3'],
      ['2', 'zone2'], ['9', 'zone9'],
      ['5', 'zone5'],
      ['6', 'zone6'], ['8', 'zone8'],
      ['1', 'zone1'],
    ];
    for (const [zone, expected] of zones) {
      const [sequence] = extractSideOutSequences([
        sideOutRally({ rallyNumber: 1, attackZone: zone }),
      ]);
      assert.equal(sequence.target, expected, `zone ${zone}`);
    }
  });

  it('classifies a second-touch attack without a set as a setter attack', () => {
    const [sequence] = extractSideOutSequences([
      sideOutRally({ rallyNumber: 1, withSet: false, attackZone: '3' }),
    ]);
    assert.equal(sequence.target, 'setter');
  });

  it('marks a set without a following attack as unknown', () => {
    const [sequence] = extractSideOutSequences([
      sideOutRally({ rallyNumber: 1, withAttack: false }),
    ]);
    assert.equal(sequence.target, 'unknown');
  });

  it('ignores transition touches after the ball crosses to the serving team', () => {
    const touches: BallTouch[] = [
      touch({ teamSide: 'away', skill: 'serve', sequenceNumber: 1 }),
      touch({ teamSide: 'home', skill: 'receive', sequenceNumber: 2, evaluation: '-' }),
      // negative reception: ball goes straight over, opponent digs
      touch({ teamSide: 'away', skill: 'dig', sequenceNumber: 3 }),
      // later home counterattack must not count as side-out distribution
      touch({ teamSide: 'home', skill: 'set', sequenceNumber: 5 }),
      touch({ teamSide: 'home', skill: 'attack', sequenceNumber: 6, startZoneCode: '4' }),
    ];
    const [sequence] = extractSideOutSequences([rally({ touches })]);
    assert.equal(sequence.set, null);
    assert.equal(sequence.attack, null);
    assert.equal(sequence.target, 'unknown');
  });

  it('reads the serve ball height from the reception, falling back to the serve', () => {
    const [fromReceive] = extractSideOutSequences([
      sideOutRally({ rallyNumber: 1, receiveBallType: 'Q' }),
    ]);
    assert.equal(fromReceive.serveBallType, 'Q');

    const touches: BallTouch[] = [
      touch({ teamSide: 'away', skill: 'serve', sequenceNumber: 1, serveType: 'H' }),
      touch({ teamSide: 'home', skill: 'receive', sequenceNumber: 2, evaluation: '+' }),
      touch({ teamSide: 'home', skill: 'set', sequenceNumber: 3 }),
      touch({ teamSide: 'home', skill: 'attack', sequenceNumber: 4, startZoneCode: '3' }),
    ];
    const [fromServe] = extractSideOutSequences([rally({ touches })]);
    assert.equal(fromServe.serveBallType, 'H');
  });
});

describe('computeSideOutDistribution', () => {
  it('computes percentages over the sets matching the reception filters', () => {
    const rallies = [
      sideOutRally({ rallyNumber: 1, attackZone: '4', receptionEvaluation: '#' }),
      sideOutRally({ rallyNumber: 2, attackZone: '4', receptionEvaluation: '#' }),
      sideOutRally({ rallyNumber: 3, attackZone: '3', receptionEvaluation: '#' }),
      sideOutRally({ rallyNumber: 4, attackZone: '2', receptionEvaluation: '-' }),
    ];
    const sequences = extractSideOutSequences(rallies);

    const all = computeSideOutDistribution(sequences, createDefaultSideOutStudyFilters('home'));
    assert.equal(all.totalSets, 4);
    assert.equal(all.buckets.zone4.matching, 2);
    assert.equal(all.buckets.zone4.pctOfSets, 0.5);

    const perfectOnly = computeSideOutDistribution(sequences, {
      ...createDefaultSideOutStudyFilters('home'),
      receptionEvaluations: ['#'],
    });
    assert.equal(perfectOnly.totalSets, 3);
    assert.equal(perfectOnly.buckets.zone2.matching, 0);
    assert.ok(Math.abs((perfectOnly.buckets.zone4.pctOfSets ?? 0) - 2 / 3) < 1e-9);
  });

  it('keeps the denominator fixed when the attack-result filter narrows the numerator', () => {
    const rallies = [
      sideOutRally({ rallyNumber: 1, attackZone: '4', attackEvaluation: '#' }),
      sideOutRally({ rallyNumber: 2, attackZone: '4', attackEvaluation: '=' }),
      sideOutRally({ rallyNumber: 3, attackZone: '3', attackEvaluation: '#' }),
    ];
    const sequences = extractSideOutSequences(rallies);

    const killsOnly = computeSideOutDistribution(sequences, {
      ...createDefaultSideOutStudyFilters('home'),
      attackEvaluations: ['#'],
    });
    assert.equal(killsOnly.totalSets, 3);
    assert.equal(killsOnly.buckets.zone4.total, 2);
    assert.equal(killsOnly.buckets.zone4.matching, 1);
    // pctOfSets = distribution share (total/totalSets), unaffected by attack filter
    assert.ok(Math.abs((killsOnly.buckets.zone4.pctOfSets ?? 0) - 2 / 3) < 1e-9);
    // successRate = efficacy on this target (matching/total)
    assert.ok(Math.abs((killsOnly.buckets.zone4.successRate ?? 0) - 1 / 2) < 1e-9);
  });

  it('filters by serve ball height and setter position', () => {
    const rallies = [
      sideOutRally({ rallyNumber: 1, attackZone: '4', receiveBallType: 'H', setterPosition: 1 }),
      sideOutRally({ rallyNumber: 2, attackZone: '3', receiveBallType: 'Q', setterPosition: 1 }),
      sideOutRally({ rallyNumber: 3, attackZone: '2', receiveBallType: 'Q', setterPosition: 6 }),
    ];
    const sequences = extractSideOutSequences(rallies);

    const quickOnly = computeSideOutDistribution(sequences, {
      ...createDefaultSideOutStudyFilters('home'),
      serveBallTypes: ['Q'],
    });
    assert.equal(quickOnly.totalSets, 2);
    assert.equal(quickOnly.buckets.zone3.matching, 1);
    assert.equal(quickOnly.buckets.zone2.matching, 1);

    const p1Only = computeSideOutDistribution(sequences, {
      ...createDefaultSideOutStudyFilters('home'),
      setterPosition: 1,
    });
    assert.equal(p1Only.totalSets, 2);
    assert.equal(p1Only.buckets.zone2.matching, 0);
  });

  it('filters by setter player in the denominator', () => {
    const rallies = [
      sideOutRally({ rallyNumber: 1, attackZone: '4', setterPlayerId: 'setter-a' }),
      sideOutRally({ rallyNumber: 2, attackZone: '3', setterPlayerId: 'setter-a' }),
      sideOutRally({ rallyNumber: 3, attackZone: '2', setterPlayerId: 'setter-b' }),
    ];
    const sequences = extractSideOutSequences(rallies);

    const setterA = computeSideOutDistribution(sequences, {
      ...createDefaultSideOutStudyFilters('home'),
      setterPlayerId: 'setter-a',
    });
    assert.equal(setterA.totalSets, 2);
    assert.equal(setterA.buckets.zone4.pctOfSets, 0.5);
    assert.equal(setterA.buckets.zone2.matching, 0);
  });

  it('uses the second-touch attacker as setter when there is no set', () => {
    const touches: BallTouch[] = [
      touch({ teamSide: 'away', skill: 'serve', sequenceNumber: 1 }),
      touch({ teamSide: 'home', skill: 'receive', sequenceNumber: 2, evaluation: '+' }),
      touch({ teamSide: 'home', skill: 'attack', sequenceNumber: 3, playerId: 'setter-a', startZoneCode: '3' }),
    ];
    const [sequence] = extractSideOutSequences([rally({ touches })]);
    assert.equal(sequence.target, 'setter');
    assert.equal(sequence.setterPlayerId, 'setter-a');
  });

  it('narrows the numerator by attack ball type with a fixed denominator', () => {
    const rallies = [
      sideOutRally({ rallyNumber: 1, attackZone: '3', attackBallType: 'Q' }),
      sideOutRally({ rallyNumber: 2, attackZone: '3', attackBallType: 'H' }),
      sideOutRally({ rallyNumber: 3, attackZone: '4', attackBallType: 'H' }),
    ];
    const sequences = extractSideOutSequences(rallies);

    const quickOnly = computeSideOutDistribution(sequences, {
      ...createDefaultSideOutStudyFilters('home'),
      attackBallTypes: ['Q'],
    });
    assert.equal(quickOnly.totalSets, 3);
    assert.equal(quickOnly.buckets.zone3.total, 2);
    assert.equal(quickOnly.buckets.zone3.matching, 1);
    assert.equal(quickOnly.buckets.zone4.matching, 0);
    // pctOfSets = distribution share (total/totalSets), unaffected by attack filter
    assert.ok(Math.abs((quickOnly.buckets.zone3.pctOfSets ?? 0) - 2 / 3) < 1e-9);
    // successRate = efficacy on this target (matching/total)
    assert.ok(Math.abs((quickOnly.buckets.zone3.successRate ?? 0) - 1 / 2) < 1e-9);
  });

  it('excludes receptions without a set from the denominator but reports them', () => {
    const rallies = [
      sideOutRally({ rallyNumber: 1, attackZone: '4' }),
      sideOutRally({ rallyNumber: 2, withSet: false, withAttack: false }),
    ];
    const sequences = extractSideOutSequences(rallies);
    const result = computeSideOutDistribution(sequences, createDefaultSideOutStudyFilters('home'));
    assert.equal(result.totalSets, 1);
    assert.equal(result.receptionsWithoutSet, 1);
    assert.equal(result.buckets.zone4.pctOfSets, 1);
  });
});
