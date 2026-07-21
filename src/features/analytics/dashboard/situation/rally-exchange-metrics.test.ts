/**
 * Rally-exchange (CP/BP length) metrics tests.
 * Runs under Node.js via ts-node/esm.
 * Value imports use relative paths — @src/ aliases are type-only.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { BallTouch } from '@src/domain/touch/types';
import { countRallyExchanges, computeRallyExchangeStats } from './rally-exchange-metrics';

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

describe('countRallyExchanges', () => {
  it('returns 0 for a rally with no attacks (ace/serve error)', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 1, servingTeam: 'home', pointWinner: 'home',
      touches: [makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '#' })],
    });
    assert.strictEqual(countRallyExchanges(rally), 0);
  });

  it('returns 1 for a first-ball kill', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 2, servingTeam: 'home', pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 2, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(countRallyExchanges(rally), 1);
  });

  it('counts attacks from both teams across an extended rally', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 3, servingTeam: 'home', pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 4, teamSide: 'home', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 5, teamSide: 'home', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 6, teamSide: 'away', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 3, sequenceNumber: 7, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    assert.strictEqual(countRallyExchanges(rally), 3);
  });
});

describe('computeRallyExchangeStats', () => {
  it('buckets a serve ace into break-point with 0 exchanges', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 10, servingTeam: 'home', pointWinner: 'home',
      touches: [makeTouch({ setNumber: 1, rallyNumber: 10, sequenceNumber: 1, teamSide: 'home', skill: 'serve', evaluation: '#' })],
    });
    const result = computeRallyExchangeStats([rally], 'Home', 'Away');
    assert.strictEqual(result.home.breakPoint.points, 1);
    assert.strictEqual(result.home.breakPoint.distribution[0], 1);
    assert.strictEqual(result.home.breakPoint.avgExchanges, 0);
    assert.strictEqual(result.home.sideOut.points, 0);
  });

  it('buckets a first-ball kill into side-out with 1 exchange', () => {
    const rally = makeRally({
      setNumber: 1, rallyNumber: 11, servingTeam: 'home', pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 11, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 11, sequenceNumber: 2, teamSide: 'away', skill: 'receive', evaluation: '#' }),
        makeTouch({ setNumber: 1, rallyNumber: 11, sequenceNumber: 3, teamSide: 'away', skill: 'set' }),
        makeTouch({ setNumber: 1, rallyNumber: 11, sequenceNumber: 4, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    const result = computeRallyExchangeStats([rally], 'Home', 'Away');
    assert.strictEqual(result.away.sideOut.points, 1);
    assert.strictEqual(result.away.sideOut.distribution[1], 1);
    assert.strictEqual(result.away.sideOut.avgExchanges, 1);
  });

  it('averages across multiple points won in the same phase', () => {
    const oneExchange = makeRally({
      setNumber: 1, rallyNumber: 20, servingTeam: 'home', pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 20, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 20, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 20, sequenceNumber: 3, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    const threeExchanges = makeRally({
      setNumber: 1, rallyNumber: 21, servingTeam: 'home', pointWinner: 'away',
      touches: [
        makeTouch({ setNumber: 1, rallyNumber: 21, sequenceNumber: 1, teamSide: 'home', skill: 'serve' }),
        makeTouch({ setNumber: 1, rallyNumber: 21, sequenceNumber: 2, teamSide: 'away', skill: 'receive' }),
        makeTouch({ setNumber: 1, rallyNumber: 21, sequenceNumber: 3, teamSide: 'away', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 21, sequenceNumber: 4, teamSide: 'home', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 21, sequenceNumber: 5, teamSide: 'home', skill: 'attack' }),
        makeTouch({ setNumber: 1, rallyNumber: 21, sequenceNumber: 6, teamSide: 'away', skill: 'dig' }),
        makeTouch({ setNumber: 1, rallyNumber: 21, sequenceNumber: 7, teamSide: 'away', skill: 'attack', evaluation: '#' }),
      ],
    });
    const result = computeRallyExchangeStats([oneExchange, threeExchanges], 'Home', 'Away');
    assert.strictEqual(result.away.sideOut.points, 2);
    assert.strictEqual(result.away.sideOut.totalExchanges, 4);
    assert.strictEqual(result.away.sideOut.avgExchanges, 2);
  });

  it('ignores rallies with missing servingTeam/pointWinner', () => {
    const rally = makeRally({ setNumber: 1, rallyNumber: 30, touches: [] });
    const result = computeRallyExchangeStats([rally], 'Home', 'Away');
    assert.strictEqual(result.home.sideOut.points, 0);
    assert.strictEqual(result.home.breakPoint.points, 0);
    assert.strictEqual(result.away.sideOut.points, 0);
  });

  it('returns null avgExchanges when a bucket has no points', () => {
    const result = computeRallyExchangeStats([], 'Home', 'Away');
    assert.strictEqual(result.home.sideOut.avgExchanges, null);
    assert.strictEqual(result.home.breakPoint.avgExchanges, null);
  });
});
