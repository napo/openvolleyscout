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
  isFirstBallSideOutKill,
  isAttackAfterDigKill,
  classifyAttackPrecedingContext,
  classifyRallyTouchPhases,
  filterTouchesByPhase,
} from './rally-phase-classifier';
import {
  computeSituationMetrics,
  computePlayerSituationContribution,
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

describe('isFirstBallSideOutKill', () => {
  it('true: receive-set-attack chain ends the rally with a kill', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 90,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(isFirstBallSideOutKill(rally), true);
  });

  it('false: first-ball attack is dug and the rally continues', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 91,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '!' }),
        makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 5, teamSide: 'home', skill: 'dig', evaluation: '=' }),
      ],
    });
    assert.strictEqual(isFirstBallSideOutKill(rally), false);
  });

  it('false: first-ball attack blocked for a point against the receiving team', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 92,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 92, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 92, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '+' }),
        makeTouch({ setNumber: 1, rallyNumber: 92, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 92, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '/' }),
        makeTouch({ setNumber: 1, rallyNumber: 92, sequenceNumber: 5, teamSide: 'home', skill: 'block', evaluation: '#' }),
      ],
    });
    assert.strictEqual(isFirstBallSideOutKill(rally), false);
  });

  it('false: no reception in the rally', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 93,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 93, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '#' }),
      ],
    });
    assert.strictEqual(isFirstBallSideOutKill(rally), false);
  });

  it('false: attack is a kill but preceded by a dig (not a first-ball attack)', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 94,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 94, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 94, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '-' }),
        makeTouch({ setNumber: 1, rallyNumber: 94, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 94, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '!' }),
        makeTouch({ setNumber: 1, rallyNumber: 94, sequenceNumber: 5, teamSide: 'home', skill: 'dig', evaluation: '-' }),
        makeTouch({ setNumber: 1, rallyNumber: 94, sequenceNumber: 6, teamSide: 'home', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 94, sequenceNumber: 7, teamSide: 'home', skill: 'attack', evaluation: '#' }),
      ],
    });
    // The K1 attack (seq 4) wasn't a kill; the eventual kill (seq 7) is home's,
    // not the receiving team's first-ball attack — not a first-ball side-out kill.
    assert.strictEqual(isFirstBallSideOutKill(rally), false);
  });
});

describe('classifyAttackPrecedingContext', () => {
  it('K1 attack (directly after reception, via a set) is classified as receive', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 100,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 100, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 100, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 100, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 100, sequenceNumber: 4, teamSide: 'away', skill: 'attack' }),
      ],
    });
    const map = classifyAttackPrecedingContext(rally);
    const attackTouch = rally.touches.find((t) => t.sequenceNumber === 4)!;
    assert.strictEqual(map.get(attackTouch.id), 'receive');
  });

  it('transition attack after a dig is classified as dig', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 101,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 101, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 101, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 101, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 101, sequenceNumber: 4, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 101, sequenceNumber: 5, teamSide: 'home', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 101, sequenceNumber: 6, teamSide: 'home', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 101, sequenceNumber: 7, teamSide: 'home', skill: 'attack' }),
      ],
    });
    const map = classifyAttackPrecedingContext(rally);
    const k1Attack = rally.touches.find((t) => t.sequenceNumber === 4)!;
    const transitionAttack = rally.touches.find((t) => t.sequenceNumber === 7)!;
    assert.strictEqual(map.get(k1Attack.id), 'receive');
    assert.strictEqual(map.get(transitionAttack.id), 'dig');
  });

  it('attack after a freeball (no receive/dig) gets no entry', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 102,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 102, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 102, sequenceNumber: 2, teamSide: 'away', skill: 'freeball' }),
        makeTouch({ setNumber: 1, rallyNumber: 102, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 102, sequenceNumber: 4, teamSide: 'away', skill: 'attack' }),
      ],
    });
    const map = classifyAttackPrecedingContext(rally);
    const attackTouch = rally.touches.find((t) => t.sequenceNumber === 4)!;
    assert.strictEqual(map.has(attackTouch.id), false);
  });

  it('attack whose nearest same-team touch is another attack (no dig/receive between) gets no entry', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 103,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 103, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 103, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 103, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 103, sequenceNumber: 4, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 103, sequenceNumber: 5, teamSide: 'home', skill: 'block' }),
        makeTouch({ setNumber: 1, rallyNumber: 103, sequenceNumber: 6, teamSide: 'away', skill: 'attack' }),
      ],
    });
    const map = classifyAttackPrecedingContext(rally);
    const secondAttack = rally.touches.find((t) => t.sequenceNumber === 6)!;
    assert.strictEqual(map.has(secondAttack.id), false);
  });

  it('covers between a block and the re-attack do not break the dig lookup', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 104,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 4, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 5, teamSide: 'away', skill: 'cover' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 6, teamSide: 'home', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 7, teamSide: 'home', skill: 'cover' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 8, teamSide: 'home', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 104, sequenceNumber: 9, teamSide: 'home', skill: 'attack' }),
      ],
    });
    const map = classifyAttackPrecedingContext(rally);
    const secondAttack = rally.touches.find((t) => t.sequenceNumber === 9)!;
    assert.strictEqual(map.get(secondAttack.id), 'dig');
  });

  it('returns an empty map for a rally with no touches', () => {
    const rally = makeRally({ setNumber: 1, rallyNumber: 105, touches: [] });
    assert.strictEqual(classifyAttackPrecedingContext(rally).size, 0);
  });
});

describe('isAttackAfterDigKill', () => {
  it('true: transition attack after a dig ends the rally with a kill', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 110,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 110, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 110, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 110, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 110, sequenceNumber: 4, teamSide: 'home', skill: 'dig', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 110, sequenceNumber: 5, teamSide: 'home', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 110, sequenceNumber: 6, teamSide: 'home', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(isAttackAfterDigKill(rally), true);
  });

  it('false: attack after dig is dug back and the rally continues', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 111,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 111, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 111, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 111, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 111, sequenceNumber: 4, teamSide: 'home', skill: 'dig', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 111, sequenceNumber: 5, teamSide: 'home', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 111, sequenceNumber: 6, teamSide: 'home', skill: 'attack', evaluation: '!' }),
        makeTouch({ setNumber: 1, rallyNumber: 111, sequenceNumber: 7, teamSide: 'away', skill: 'dig', evaluation: '=' }),
      ],
    });
    assert.strictEqual(isAttackAfterDigKill(rally), false);
  });

  it('false: terminal attack is a kill but preceded by a receive, not a dig (FBSO territory, not AST)', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 112,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 112, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 112, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 112, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 112, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(isAttackAfterDigKill(rally), false);
  });

  it('false: no touches', () => {
    const rally = makeRally({ setNumber: 1, rallyNumber: 113, touches: [] });
    assert.strictEqual(isAttackAfterDigKill(rally), false);
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

  it('attackAfterDigKill: strict AST only counts when the transition attack is the rally-ending kill', () => {
    // No K1 (poor reception, no receiving-team attack) — the serving team
    // digs the shanked pass directly and attacks, same shape as the
    // existing "non-K1 rally where winner attacks after dig" fixture above.
    const strictKill = buildTestRally(90, 'home', 'home', [
      makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
      makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '-' }),
      makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 3, teamSide: 'home', skill: 'dig', evaluation: '#' }),
      makeTouch({ setNumber: 1, rallyNumber: 90, sequenceNumber: 4, teamSide: 'home', skill: 'attack', evaluation: '#' }),
    ]);
    const notTerminal = buildTestRally(91, 'home', 'home', [
      makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
      makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '-' }),
      makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 3, teamSide: 'home', skill: 'dig', evaluation: '#' }),
      makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 4, teamSide: 'home', skill: 'attack', evaluation: '!' }),
      makeTouch({ setNumber: 1, rallyNumber: 91, sequenceNumber: 5, teamSide: 'away', skill: 'dig', evaluation: '=' }),
    ]);

    const result = computeSituationMetrics([strictKill, notTerminal], 'Home', 'Away');
    // Both rallies are classified attack_after_dig for home, so attempts = 2
    // for both the loose and strict buckets, but only the strict-kill rally
    // (terminal touch = home's attack, eval '#') counts as a "win" in the
    // strict bucket — the second rally's terminal touch is away's dig error,
    // not home's attack, so it doesn't qualify even though home still wins.
    assert.strictEqual(result.home.attackAfterDig.attempts, 2);
    assert.strictEqual(result.home.attackAfterDig.pointsWon, 2);
    assert.strictEqual(result.home.attackAfterDigKill.attempts, 2);
    assert.strictEqual(result.home.attackAfterDigKill.pointsWon, 1);
  });
});

describe('computePlayerSituationContribution: firstBallSideOut / firstBallPlay', () => {
  it('firstBallSideOut: credits the player who struck the strict first-ball kill', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 200,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 200, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 200, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 200, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 200, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '#', playerId: 'away-p1' }),
      ],
    });

    const scorer = computePlayerSituationContribution([rally], 'away', 'away-p1');
    assert.strictEqual(scorer.firstBallSideOut.teamAttempts, 1);
    assert.strictEqual(scorer.firstBallSideOut.teamPointsWon, 1);
    assert.strictEqual(scorer.firstBallSideOut.playerPoints, 1);
    assert.strictEqual(scorer.firstBallSideOut.playerShare, 1);

    const bystander = computePlayerSituationContribution([rally], 'away', 'away-p2');
    assert.strictEqual(bystander.firstBallSideOut.teamAttempts, 1);
    assert.strictEqual(bystander.firstBallSideOut.playerPoints, 0);
    assert.strictEqual(bystander.firstBallSideOut.playerShare, 0);
  });

  it('firstBallPlay: counts the attempt even when the K1 rally is ultimately lost, crediting no one', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 201,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 201, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 201, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '+' }),
        makeTouch({ setNumber: 1, rallyNumber: 201, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 201, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '-', playerId: 'away-p1' }),
        makeTouch({ setNumber: 1, rallyNumber: 201, sequenceNumber: 5, teamSide: 'home', skill: 'dig', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 201, sequenceNumber: 6, teamSide: 'home', skill: 'attack', evaluation: '#' }),
      ],
    });

    const attacker = computePlayerSituationContribution([rally], 'away', 'away-p1');
    // The K1 attempt happened (attempts=1, teamPointsWon reflects the attempt,
    // not the rally outcome) but away lost the rally, so no one is credited.
    assert.strictEqual(attacker.firstBallPlay.teamAttempts, 1);
    assert.strictEqual(attacker.firstBallPlay.teamPointsWon, 1);
    assert.strictEqual(attacker.firstBallPlay.playerPoints, 0);
    assert.strictEqual(attacker.firstBallPlay.playerShare, 0);
  });

  it('firstBallSideOut/firstBallPlay attempts only accumulate while the player\'s team is receiving', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 202,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 202, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '#' }),
      ],
    });

    const servingPlayer = computePlayerSituationContribution([rally], 'home', 'home-p1');
    assert.strictEqual(servingPlayer.firstBallSideOut.teamAttempts, 0);
    assert.strictEqual(servingPlayer.firstBallPlay.teamAttempts, 0);
  });
});

describe('computePlayerSituationContribution: attackAfterDigKill (AST)', () => {
  it('credits the player who struck the strict transition kill after a dig, not the mere attack_after_dig attempt', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 210,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 210, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 210, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '-' }),
        makeTouch({ setNumber: 1, rallyNumber: 210, sequenceNumber: 3, teamSide: 'home', skill: 'dig', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 210, sequenceNumber: 4, teamSide: 'home', skill: 'attack', evaluation: '#', playerId: 'home-p1' }),
      ],
    });

    const scorer = computePlayerSituationContribution([rally], 'home', 'home-p1');
    assert.strictEqual(scorer.attackAfterDig.teamAttempts, 1);
    assert.strictEqual(scorer.attackAfterDig.playerPoints, 1);
    assert.strictEqual(scorer.attackAfterDigKill.teamAttempts, 1);
    assert.strictEqual(scorer.attackAfterDigKill.playerPoints, 1);
    assert.strictEqual(scorer.attackAfterDigKill.playerShare, 1);
  });

  it('does not credit anyone in the strict bucket when the point is decided by a later touch', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 211,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 211, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 211, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '-' }),
        makeTouch({ setNumber: 1, rallyNumber: 211, sequenceNumber: 3, teamSide: 'home', skill: 'dig', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 211, sequenceNumber: 4, teamSide: 'home', skill: 'attack', evaluation: '!', playerId: 'home-p1' }),
        makeTouch({ setNumber: 1, rallyNumber: 211, sequenceNumber: 5, teamSide: 'away', skill: 'dig', evaluation: '=' }),
      ],
    });

    const attacker = computePlayerSituationContribution([rally], 'home', 'home-p1');
    // Home wins the rally (away's dig errors out), but no home touch is
    // evaluated '#' (the attack was only '!'), so no one is credited with
    // scoring it directly — in either the loose or the strict bucket.
    assert.strictEqual(attacker.attackAfterDig.teamPointsWon, 1);
    assert.strictEqual(attacker.attackAfterDig.playerPoints, 0);
    assert.strictEqual(attacker.attackAfterDigKill.teamAttempts, 1);
    assert.strictEqual(attacker.attackAfterDigKill.teamPointsWon, 0);
    assert.strictEqual(attacker.attackAfterDigKill.playerPoints, 0);
    assert.strictEqual(attacker.attackAfterDigKill.playerShare, null);
  });
});

describe('classifyRallyTouchPhases', () => {
  it('classifies a full exchange: serve/receive always fixed, first-occurrence rule per team, rest transition', () => {
    // A serves; B receives/sets/attacks (K1); A blocks/digs/sets/attacks (their break-point
    // sequence); B digs/sets/attacks again (2nd wave, all transition).
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 1,
      servingTeam: 'home',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 4, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 5, teamSide: 'home', skill: 'block' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 6, teamSide: 'home', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 7, teamSide: 'home', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 8, teamSide: 'home', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 9, teamSide: 'away', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 10, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 11, teamSide: 'away', skill: 'attack' }),
      ],
    });

    const phases = classifyRallyTouchPhases(rally);
    const expected: Array<[number, 'break_point' | 'point' | 'transition_break_point' | 'transition_point']> = [
      [1, 'break_point'],  // serve
      [2, 'point'],        // receive
      [3, 'point'],        // B's 1st set
      [4, 'point'],        // B's 1st attack (K1)
      [5, 'break_point'],  // A's 1st block
      [6, 'break_point'],  // A's 1st dig
      [7, 'break_point'],  // A's 1st set
      [8, 'break_point'],  // A's 1st attack (their break-point counter-attack)
      [9, 'transition_point'],  // B's dig — not in B's point list
      [10, 'transition_point'], // B's 2nd set
      [11, 'transition_point'], // B's 2nd attack
    ];

    for (const [seq, phase] of expected) {
      const touch = rally.touches.find((t) => t.sequenceNumber === seq)!;
      assert.strictEqual(phases.get(touch.id), phase, `touch #${seq} (${touch.skill})`);
    }
  });

  it('treats freeball as sharing the dig occurrence counter for the serving team', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 2,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        // Serving team's first defensive touch is a freeball, not a dig — still break_point.
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 4, teamSide: 'home', skill: 'freeball' }),
        // A subsequent dig by the serving team is a 2nd occurrence of the same counter → transition.
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 5, teamSide: 'home', skill: 'dig' }),
      ],
    });

    const phases = classifyRallyTouchPhases(rally);
    const byId = (seq: number) => rally.touches.find((t) => t.sequenceNumber === seq)!.id;

    assert.strictEqual(phases.get(byId(4)), 'break_point');
    assert.strictEqual(phases.get(byId(5)), 'transition_break_point');
  });

  it('classifies first cover as break_point for the serving team and point for the receiving team', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 3,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 4, teamSide: 'away', skill: 'cover' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 5, teamSide: 'home', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 6, teamSide: 'home', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 7, teamSide: 'home', skill: 'cover' }),
      ],
    });

    const phases = classifyRallyTouchPhases(rally);
    const byId = (seq: number) => rally.touches.find((t) => t.sequenceNumber === seq)!.id;

    assert.strictEqual(phases.get(byId(4)), 'point');       // away's 1st cover
    assert.strictEqual(phases.get(byId(7)), 'break_point'); // home's 1st cover
  });

  it('returns an empty map when servingTeam is missing', () => {
    const rally = makeRally({ setNumber: 1, rallyNumber: 4, touches: [], servingTeam: null });
    assert.strictEqual(classifyRallyTouchPhases(rally).size, 0);
  });
});

describe('filterTouchesByPhase', () => {
  it('returns all touches unfiltered when phase is "all"', () => {
    const rally = makeRally({
      setNumber: 1,
      rallyNumber: 5,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 5, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 5, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
      ],
    });
    assert.strictEqual(filterTouchesByPhase([rally], 'all').length, 2);
  });

  it('filters touches across rallies down to the requested phase', () => {
    const rallyA = makeRally({
      setNumber: 1,
      rallyNumber: 6,
      servingTeam: 'home',
      pointWinner: 'home',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 6, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 6, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
      ],
    });
    const rallyB = makeRally({
      setNumber: 1,
      rallyNumber: 7,
      servingTeam: 'away',
      pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 7, sequenceNumber: 1, teamSide: 'away', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 7, sequenceNumber: 2, teamSide: 'home', skill: 'receive' }),
      ],
    });

    const breakPointTouches = filterTouchesByPhase([rallyA, rallyB], 'break_point');
    assert.strictEqual(breakPointTouches.length, 2);
    assert.ok(breakPointTouches.every((t) => t.skill === 'serve'));

    const pointTouches = filterTouchesByPhase([rallyA, rallyB], 'point');
    assert.strictEqual(pointTouches.length, 2);
    assert.ok(pointTouches.every((t) => t.skill === 'receive'));
  });
});
