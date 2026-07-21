import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invertMatrix, multiplyMatrix, rowSums } from './markov-chain-math';

test('invertMatrix returns null for a singular matrix', () => {
  const result = invertMatrix([
    [1, 2],
    [2, 4],
  ]);
  assert.equal(result, null);
});

test('invertMatrix returns null for a non-square matrix', () => {
  const result = invertMatrix([
    [1, 2, 3],
    [4, 5, 6],
  ]);
  assert.equal(result, null);
});

test('invertMatrix inverts a simple 2x2 matrix correctly', () => {
  const inverse = invertMatrix([
    [4, 7],
    [2, 6],
  ]);
  assert.ok(inverse);
  // Known inverse of [[4,7],[2,6]] is (1/10) * [[6,-7],[-2,4]]
  assert.ok(Math.abs(inverse[0][0] - 0.6) < 1e-9);
  assert.ok(Math.abs(inverse[0][1] - -0.7) < 1e-9);
  assert.ok(Math.abs(inverse[1][0] - -0.2) < 1e-9);
  assert.ok(Math.abs(inverse[1][1] - 0.4) < 1e-9);
});

test('symmetric gambler\'s ruin (N=3): absorption probabilities and expected steps match closed-form', () => {
  // States: 1, 2 transient (positions along the path); absorbing columns: [lose, win]
  // From position 1: 0.5 -> lose, 0.5 -> position 2
  // From position 2: 0.5 -> position 1, 0.5 -> win
  const Q = [
    [0, 0.5],
    [0.5, 0],
  ];
  const R = [
    [0.5, 0],
    [0, 0.5],
  ];
  const identity = [
    [1, 0],
    [0, 1],
  ];
  const iMinusQ = identity.map((row, i) => row.map((value, j) => value - Q[i][j]));

  const N = invertMatrix(iMinusQ);
  assert.ok(N);

  const B = multiplyMatrix(N, R);

  // Closed-form for symmetric gambler's ruin with barrier distance N=3: P(win from position i) = i/N
  assert.ok(Math.abs(B[0][1] - 1 / 3) < 1e-9, 'position 1 win probability should be 1/3');
  assert.ok(Math.abs(B[1][1] - 2 / 3) < 1e-9, 'position 2 win probability should be 2/3');
  assert.ok(Math.abs(B[0][0] - 2 / 3) < 1e-9, 'position 1 lose probability should be 2/3');
  assert.ok(Math.abs(B[1][0] - 1 / 3) < 1e-9, 'position 2 lose probability should be 1/3');

  // Closed-form expected steps to absorption: i * (N - i)
  const sums = rowSums(N);
  assert.ok(Math.abs(sums[0] - 2) < 1e-9, 'expected steps from position 1 should be 1*2=2');
  assert.ok(Math.abs(sums[1] - 2) < 1e-9, 'expected steps from position 2 should be 2*1=2');
});
