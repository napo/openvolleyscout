// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { estimateFrameDuration } from './VideoPlayerView';

describe('estimateFrameDuration', () => {
  it('reads the frame rate of the video from consecutive frames', () => {
    expect(estimateFrameDuration([0.02, 0.02, 0.04, 0.02, 0.02, 0.02])).toBeCloseTo(1 / 50);
    expect(estimateFrameDuration(Array(8).fill(1 / 25))).toBeCloseTo(1 / 25);
  });
  it('waits for enough clean samples', () => {
    expect(estimateFrameDuration([0.04, 0.04])).toBeNull();
    expect(estimateFrameDuration([0, 0, 2, 3, 0.5, 9])).toBeNull();
  });
});
