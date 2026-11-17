// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAG_ZONE_ROTATION,
  PICKER_SUBZONE_ROWS,
  PICKER_ZONE_ROWS,
  rotateGrid90CW,
} from './TagZonePicker';

describe('TagZonePicker rotation', () => {
  it('defaults to horizontal orientation (1 step = 90° clockwise)', () => {
    expect(DEFAULT_TAG_ZONE_ROTATION).toBe(1);
  });

  it('rotates zone and subzone grids in 90-degree clockwise steps and returns to original after 4 steps', () => {
    const rot1 = rotateGrid90CW(PICKER_ZONE_ROWS, 1);
    expect(rot1).toEqual([
      [2, 9, 1],
      [3, 8, 6],
      [4, 7, 5],
    ]);

    const rot2 = rotateGrid90CW(PICKER_ZONE_ROWS, 2);
    expect(rot2).toEqual([
      [4, 3, 2],
      [7, 8, 9],
      [5, 6, 1],
    ]);

    const rot3 = rotateGrid90CW(PICKER_ZONE_ROWS, 3);
    expect(rot3).toEqual([
      [5, 7, 4],
      [6, 8, 3],
      [1, 9, 2],
    ]);

    const rot0 = rotateGrid90CW(PICKER_ZONE_ROWS, 0);
    expect(rot0).toEqual(PICKER_ZONE_ROWS.map((r) => [...r]));

    expect(rotateGrid90CW(PICKER_SUBZONE_ROWS, 1)).toEqual([
      ['B', 'A'],
      ['C', 'D'],
    ]);
  });
});
