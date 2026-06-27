/**
 * Rally-phase classifier tests.
 * Runs under Node.js via ts-node/esm.
 * Value imports use relative paths — @src/ aliases are type-only.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { BallTouch } from '@src/domain/touch/types';
// Value imports must be relative (ts-node/esm cannot resolve @src/ at runtime)
import {
  classifyRallyPhase,
  rallyMatchesPhaseFilter,
  isRallySideOut,
  isRallyBreakPoint,
} from './rally-phase-classifier';
import {
  computeSituationMetrics,
} from '../dashboard/situation/situation-metrics';

// ─── Helpers ────────────────────────────────────────────────────────────────

let seq = 1;
function nextId(): string {
  return `t-${String(seq++).padStart(4, '0')}`;
}

function makeTouch(
  overrides: Partial<BallTouch> & Pick<BallTouch, 'setNumber' | 'rallyNumber' | 'sequenceNumber' | 'teamSide' | 'skill'>,
): BallTouch {
  return {
    id: nextId(),
    evaluation: undefined,
    createdAt: overrides.sequenceNumber,
    ...overrides,
  };
}

function makeRally(
  overrides: Partial<RallyStats> & Pick<RallyStats, 'setNumber' | 'rallyNumber' | 'touches'>,
): RallyStats {
  return {
    dataVolleyCode: '',
    servingTeam: null,
    pointWinner: null,
    terminalReason: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('classifyRallyPhase', () => {
  it('returns unknown when servingTeam is null', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 1,
      touches: [makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '#' })],
      servingTeam: null,
      pointWinner: 'home',
    });
    assert.strictEqual(classifyRallyPhase(rally), 'unknown');
  });

  it('returns unknown when pointWinner is null', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 2,
      touches: [makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 1, teamSide: 'home', skill: 'serve' })],
      servingTeam: 'home',
      pointWinner: null,
    });
    assert.strictEqual(classifyRallyPhase(rally), 'unknown');
  });

  it('returns unknown when touches is empty', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 3,
      touches: [],
      servingTeam: 'home',
      pointWinner: 'away',
    });
    assert.strictEqual(classifyRallyPhase(rally), 'unknown');
  });

  it('classifies side_out: receiving team wins without attack', () => {
    // Home serves, away receives and wins (e.g. home serve error)
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 4,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 4, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '=' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'side_out');
  });

  it('classifies break_point: serving team wins without attack', () => {
    // Home serves an ace, home wins
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 5,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 5, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 5, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '=' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'break_point');
  });

  it('classifies attack_after_receive: winning team (receiver) attacks after reception', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 6,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 6, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 6, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 6, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 6, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'attack_after_receive');
  });

  it('classifies attack_after_receive: K1 rally where receiving team loses (counterattack)', () => {
    // K1 exists (away attacked after reception), so the phase is attack_after_receive
    // even though the serving team (home) won via counterattack.
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 7,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 7, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 7, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 7, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 7, sequenceNumber: 4, teamSide: 'home', skill: 'dig', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 7, sequenceNumber: 5, teamSide: 'home', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'attack_after_receive');
  });

  it('classifies attack_after_receive: K1 rally where receiving team loses (simple counter)', () => {
    // K1 exists (away received and attacked) — classified as attack_after_receive
    // regardless of the serving team (home) winning.
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 8,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 8, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 8, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 8, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 8, sequenceNumber: 4, teamSide: 'home', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'attack_after_receive');
  });

  it('classifies attack_after_receive: K1 attack blocked (receiving team loses)', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 80,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 80, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 80, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '+' }),
        makeTouch({ setNumber: 1, rallyNumber: 80, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 80, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '/' }),
        makeTouch({ setNumber: 1, rallyNumber: 80, sequenceNumber: 5, teamSide: 'home', skill: 'block', evaluation: '#' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'attack_after_receive');
  });

  it('classifies attack_after_receive: K1 attack error (receiving team loses)', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 81,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 81, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 81, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 81, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 81, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '=' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'attack_after_receive');
  });

  it('classifies attack_after_dig: non-K1 rally where winner attacks after dig', () => {
    // No K1 (reception error, no receiving-team attack), serving team digs
    // a freeball and attacks.
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 82,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 82, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 82, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '-' }),
        makeTouch({ setNumber: 1, rallyNumber: 82, sequenceNumber: 3, teamSide: 'home', skill: 'dig', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 82, sequenceNumber: 4, teamSide: 'home', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'attack_after_dig');
  });

  it('classifies freeball: freeball touch present in rally', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 9,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 9, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 9, sequenceNumber: 2, teamSide: 'away', skill: 'freeball' }),
        makeTouch({ setNumber: 1, rallyNumber: 9, sequenceNumber: 3, teamSide: 'home', skill: 'freeball', evaluation: '=' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'freeball');
  });

  it('freeball takes priority over attack_after_receive', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 10,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 10, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 10, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 10, sequenceNumber: 3, teamSide: 'away', skill: 'freeball' }),
        makeTouch({ setNumber: 1, rallyNumber: 10, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(classifyRallyPhase(rally), 'freeball');
  });
});

describe('isRallySideOut / isRallyBreakPoint', () => {
  it('isRallySideOut: true when receiving team wins', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 11, touches: [],
      servingTeam: 'home', pointWinner: 'away',
    });
    assert.strictEqual(isRallySideOut(rally), true);
    assert.strictEqual(isRallyBreakPoint(rally), false);
  });

  it('isRallyBreakPoint: true when serving team wins', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 12, touches: [],
      servingTeam: 'home', pointWinner: 'home',
    });
    assert.strictEqual(isRallySideOut(rally), false);
    assert.strictEqual(isRallyBreakPoint(rally), true);
  });

  it('returns false for both when servingTeam is null', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 13, touches: [],
      servingTeam: null, pointWinner: 'home',
    });
    assert.strictEqual(isRallySideOut(rally), false);
    assert.strictEqual(isRallyBreakPoint(rally), false);
  });
});

describe('rallyMatchesPhaseFilter', () => {
  const soRally = makeRally({
    setNumber: 1, rallyNumber: 20, touches: [],
    servingTeam: 'home', pointWinner: 'away',
  });
  const bpRally = makeRally({
    setNumber: 1, rallyNumber: 21, touches: [],
    servingTeam: 'home', pointWinner: 'home',
  });

  it('"all" filter matches any rally', () => {
    assert.strictEqual(rallyMatchesPhaseFilter(soRally, 'all'), true);
    assert.strictEqual(rallyMatchesPhaseFilter(bpRally, 'all'), true);
  });

  it('"side_out" filter matches all receiving-team-win rallies', () => {
    assert.strictEqual(rallyMatchesPhaseFilter(soRally, 'side_out'), true);
    assert.strictEqual(rallyMatchesPhaseFilter(bpRally, 'side_out'), false);
  });

  it('"break_point" filter matches all serving-team-win rallies', () => {
    assert.strictEqual(rallyMatchesPhaseFilter(bpRally, 'break_point'), true);
    assert.strictEqual(rallyMatchesPhaseFilter(soRally, 'break_point'), false);
  });

  it('specific phase filter uses classifyRallyPhase', () => {
    const freeRally = makeRally({
      setNumber: 1, rallyNumber: 22, servingTeam: 'home', pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 22, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 22, sequenceNumber: 2, teamSide: 'away', skill: 'freeball' }),
      ],
    });
    assert.strictEqual(rallyMatchesPhaseFilter(freeRally, 'freeball'), true);
    assert.strictEqual(rallyMatchesPhaseFilter(freeRally, 'attack_after_receive'), false);
  });
});

describe('computeSituationMetrics', () => {
  function buildTestRally(
    rallyNumber: number,
    servingTeam: 'home' | 'away',
    pointWinner: 'home' | 'away',
    touches: BallTouch[],
  ): RallyStats {
    return makeRally({ setNumber: 1, rallyNumber, servingTeam, pointWinner, touches });
  }

  it('accumulates side-out and break-point totals correctly', () => {
    const rallies: RallyStats[] = [
      // Home serves, away wins (side-out for away / break-point attempt for home)
      buildTestRally(30, 'home', 'away', [
        makeTouch({ setNumber: 1, rallyNumber: 30, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '=' }),
      ]),
      // Home serves, home wins (break-point for home / side-out fail for away)
      buildTestRally(31, 'home', 'home', [
        makeTouch({ setNumber: 1, rallyNumber: 31, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '#' }),
      ]),
    ];

    const result = computeSituationMetrics(rallies, 'Home', 'Away');

    // home serves in both rallies → away has 2 side-out attempts, wins rally 30
    assert.strictEqual(result.away.sideOut.attempts, 2);
    assert.strictEqual(result.away.sideOut.pointsWon, 1);

    // home serves in both rallies → home has 2 break-point attempts, wins rally 31
    assert.strictEqual(result.home.breakPoint.attempts, 2);
    assert.strictEqual(result.home.breakPoint.pointsWon, 1);
  });

  it('does not crash with unknown rallies (missing serving/winner)', () => {
    const unknownRally = makeRally({
      setNumber: 1, rallyNumber: 40, touches: [],
      servingTeam: null, pointWinner: null,
    });
    const result = computeSituationMetrics([unknownRally], 'Home', 'Away');
    assert.strictEqual(result.home.unknownCount, 1);
    assert.strictEqual(result.away.unknownCount, 1);
  });

  it('returns null pointPct for phases with zero attempts', () => {
    const result = computeSituationMetrics([], 'Home', 'Away');
    assert.strictEqual(result.home.sideOut.pointPct, null);
    assert.strictEqual(result.away.breakPoint.pointPct, null);
  });

  it('phase metrics sum: attack_after_receive tracked for receiving team', () => {
    const rally = buildTestRally(50, 'home', 'away', [
      makeTouch({ setNumber: 1, rallyNumber: 50, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
      makeTouch({ setNumber: 1, rallyNumber: 50, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
      makeTouch({ setNumber: 1, rallyNumber: 50, sequenceNumber: 3, teamSide: 'away', skill: 'attack', evaluation: '#' }),
    ]);
    const result = computeSituationMetrics([rally], 'Home', 'Away');
    assert.strictEqual(result.away.attackAfterReceive.attempts, 1);
    assert.strictEqual(result.away.attackAfterReceive.pointsWon, 1);
    assert.strictEqual(result.home.attackAfterReceive.attempts, 0);
  });

  it('handles imported match with no touches (partial data)', () => {
    const importedRally = buildTestRally(60, 'home', 'away', []);
    const result = computeSituationMetrics([importedRally], 'Home', 'Away');
    // Should not crash; side-out still counted from servingTeam/pointWinner
    assert.strictEqual(result.away.sideOut.attempts, 1);
  });

  it('K1 rally lost: counts attack_after_receive attempt for receiving team', () => {
    // Away receives and attacks (K1), but home counterattacks and wins
    const rally = buildTestRally(70, 'home', 'home', [
      makeTouch({ setNumber: 1, rallyNumber: 70, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
      makeTouch({ setNumber: 1, rallyNumber: 70, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '+' }),
      makeTouch({ setNumber: 1, rallyNumber: 70, sequenceNumber: 3, teamSide: 'away', skill: 'attack', evaluation: '-' }),
      makeTouch({ setNumber: 1, rallyNumber: 70, sequenceNumber: 4, teamSide: 'home', skill: 'dig', evaluation: '#' }),
      makeTouch({ setNumber: 1, rallyNumber: 70, sequenceNumber: 5, teamSide: 'home', skill: 'attack', evaluation: '#' }),
    ]);
    const result = computeSituationMetrics([rally], 'Home', 'Away');
    // Away had a K1 attempt but lost
    assert.strictEqual(result.away.attackAfterReceive.attempts, 1);
    assert.strictEqual(result.away.attackAfterReceive.pointsWon, 0);
    // Home had a counterattack attempt and won
    assert.strictEqual(result.home.counterattack.attempts, 1);
    assert.strictEqual(result.home.counterattack.pointsWon, 1);
  });

  it('K1 rally won: counts both attack_after_receive and no counterattack', () => {
    const rally = buildTestRally(71, 'home', 'away', [
      makeTouch({ setNumber: 1, rallyNumber: 71, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
      makeTouch({ setNumber: 1, rallyNumber: 71, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
      makeTouch({ setNumber: 1, rallyNumber: 71, sequenceNumber: 3, teamSide: 'away', skill: 'attack', evaluation: '#' }),
    ]);
    const result = computeSituationMetrics([rally], 'Home', 'Away');
    assert.strictEqual(result.away.attackAfterReceive.attempts, 1);
    assert.strictEqual(result.away.attackAfterReceive.pointsWon, 1);
    // No counterattack by home (they didn't attack)
    assert.strictEqual(result.home.counterattack.attempts, 0);
  });
});
