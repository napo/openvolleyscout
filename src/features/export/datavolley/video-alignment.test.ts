import { describe, expect, it } from 'vitest';
import { alignVideoTimesToFirstServe } from './index';
import type { DataVolleyScoutRow } from './types';

function row(code: string, videoTime?: number): DataVolleyScoutRow {
  return { code, videoTime, time: '10.00.00', setNumber: 1, homeLineup: [], awayLineup: [] };
}

describe('alignVideoTimesToFirstServe', () => {
  it('shifts all rows so the first serve lands at the given video second', () => {
    const rows = [row('*P01>LUp', 0), row('*07SH+', 40), row('a12RH-', 42), row('*07SQ=', 80)];
    const aligned = alignVideoTimesToFirstServe(rows, 125);
    expect(aligned.map((r) => r.videoTime)).toEqual([85, 125, 127, 165]);
  });

  it('never produces negative times', () => {
    const aligned = alignVideoTimesToFirstServe([row('*z1', 0), row('a05SM#', 60)], 10);
    expect(aligned.map((r) => r.videoTime)).toEqual([0, 10]);
  });

  it('leaves rows untouched when there is no serve', () => {
    const rows = [row('*z1', 3), row('a12RH-', 4)];
    expect(alignVideoTimesToFirstServe(rows, 100)).toBe(rows);
  });
});
