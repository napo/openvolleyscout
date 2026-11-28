// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  SQUARE_PHOTO_MAX_LENGTH,
  SQUARE_PHOTO_PNG_MAX_LENGTH,
  isSquarePhotoDataUrl,
  pickSquarePhotoEncoding,
  squareCropBox,
} from './square-photo-file';

const dataUrl = (type: 'png' | 'jpeg', length: number) => {
  const prefix = `data:image/${type};base64,`;
  return prefix + 'A'.repeat(Math.max(4, length - prefix.length));
};

describe('square photo crop', () => {
  it('keeps the centred square of a landscape, portrait or square image', () => {
    expect(squareCropBox(400, 300)).toEqual({ x: 50, y: 0, size: 300 });
    expect(squareCropBox(300, 500)).toEqual({ x: 0, y: 100, size: 300 });
    expect(squareCropBox(256, 256)).toEqual({ x: 0, y: 0, size: 256 });
    expect(squareCropBox(301, 300)).toEqual({ x: 0, y: 0, size: 300 });
  });

  it('never gives an empty square', () => {
    expect(squareCropBox(0, 0)).toEqual({ x: 0, y: 0, size: 1 });
  });
});

describe('square photo encoding', () => {
  it('keeps a light PNG', () => {
    const png = dataUrl('png', 5_000);
    expect(pickSquarePhotoEncoding(() => png, () => { throw new Error('no JPEG needed'); })).toBe(png);
  });

  it('turns a heavy PNG into a JPEG, at a lower quality when needed', () => {
    const qualities: number[] = [];
    const result = pickSquarePhotoEncoding(
      () => dataUrl('png', SQUARE_PHOTO_PNG_MAX_LENGTH + 1),
      (quality) => {
        qualities.push(quality);
        return dataUrl('jpeg', quality > 0.8 ? SQUARE_PHOTO_MAX_LENGTH + 1 : 30_000);
      },
    );
    expect(qualities).toEqual([0.85, 0.7]);
    expect(result?.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(isSquarePhotoDataUrl(result)).toBe(true);
  });

  it('gives nothing when no encoding fits or the canvas gives another format', () => {
    expect(pickSquarePhotoEncoding(() => dataUrl('png', SQUARE_PHOTO_MAX_LENGTH * 2), () => dataUrl('jpeg', SQUARE_PHOTO_MAX_LENGTH * 2))).toBeNull();
    expect(pickSquarePhotoEncoding(() => 'data:,', () => 'data:,')).toBeNull();
  });

  it('checks stored photos', () => {
    expect(isSquarePhotoDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSquarePhotoDataUrl('data:image/gif;base64,R0lGOD==')).toBe(false);
    expect(isSquarePhotoDataUrl(dataUrl('jpeg', 2_000), 1_000)).toBe(false);
  });
});
