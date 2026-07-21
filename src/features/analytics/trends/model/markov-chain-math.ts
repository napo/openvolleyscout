const EPSILON = 1e-10;

/**
 * Inverts a square matrix via Gauss-Jordan elimination with partial pivoting.
 * Returns null if the matrix is singular (or not square).
 */
export function invertMatrix(matrix: readonly (readonly number[])[]): number[][] | null {
  const n = matrix.length;
  if (n === 0 || matrix.some((row) => row.length !== n)) {
    return null;
  }

  const augmented: number[][] = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(augmented[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const value = Math.abs(augmented[row][col]);
      if (value > pivotValue) {
        pivotRow = row;
        pivotValue = value;
      }
    }

    if (pivotValue < EPSILON) {
      return null;
    }

    if (pivotRow !== col) {
      [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];
    }

    const pivot = augmented[col][col];
    for (let j = 0; j < 2 * n; j += 1) {
      augmented[col][j] /= pivot;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  return augmented.map((row) => row.slice(n));
}

/** Multiplies an n×n matrix by an n×m matrix. */
export function multiplyMatrix(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const n = a.length;
  const m = b[0]?.length ?? 0;
  const k = b.length;
  const result: number[][] = Array.from({ length: n }, () => Array(m).fill(0));

  for (let i = 0; i < n; i += 1) {
    for (let col = 0; col < m; col += 1) {
      let sum = 0;
      for (let p = 0; p < k; p += 1) {
        sum += a[i][p] * b[p][col];
      }
      result[i][col] = sum;
    }
  }

  return result;
}

/** Row sums of a matrix — used to derive expected steps-to-absorption from the fundamental matrix. */
export function rowSums(matrix: readonly (readonly number[])[]): number[] {
  return matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
}
