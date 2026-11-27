// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { drawingBox } from './print-logo-file';

/** A width x height image filled with `background`, with a `mark` rectangle drawn in it. */
function image(width: number, height: number, background: number[], mark: { x: number; y: number; w: number; h: number; color: number[] }) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= mark.x && x < mark.x + mark.w && y >= mark.y && y < mark.y + mark.h;
      pixels.set(inside ? mark.color : background, (y * width + x) * 4);
    }
  }
  return pixels;
}

describe('logo trimming', () => {
  it('finds the drawing inside a transparent border', () => {
    expect(drawingBox(image(40, 30, [0, 0, 0, 0], { x: 10, y: 5, w: 12, h: 8, color: [120, 20, 40, 255] }), 40, 30)).toEqual({ x: 10, y: 5, width: 12, height: 8 });
  });

  it('finds the drawing inside a white border, and keeps a white logo on a transparent one', () => {
    expect(drawingBox(image(40, 30, [255, 255, 255, 255], { x: 3, y: 4, w: 30, h: 20, color: [0, 37, 84, 255] }), 40, 30)).toEqual({ x: 3, y: 4, width: 30, height: 20 });
    expect(drawingBox(image(20, 20, [0, 0, 0, 0], { x: 2, y: 2, w: 16, h: 16, color: [255, 255, 255, 255] }), 20, 20)).toEqual({ x: 2, y: 2, width: 16, height: 16 });
  });

  it('gives nothing for an empty image', () => {
    expect(drawingBox(image(10, 10, [0, 0, 0, 0], { x: 0, y: 0, w: 0, h: 0, color: [0, 0, 0, 0] }), 10, 10)).toBeNull();
  });
});
