// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Turns an image file chosen by the user (a photo of an athlete) into a small
 * square picture: the centred square of the image, reduced to 256 px, as a PNG
 * data URL, or a JPEG one when the PNG is heavy (as photos are).
 */

/** Side of a stored square photo: plenty for a 2 cm square printed at 300 dpi. */
export const SQUARE_PHOTO_SIZE = 256;
/** Largest stored square photo (a 256 px JPEG is usually 20-50 thousand characters). */
export const SQUARE_PHOTO_MAX_LENGTH = 150_000;
/** Above this a PNG is too heavy to keep: the JPEG is used instead. */
export const SQUARE_PHOTO_PNG_MAX_LENGTH = 80_000;
/** JPEG qualities tried in turn until the picture is small enough. */
export const SQUARE_PHOTO_JPEG_QUALITIES: readonly number[] = [0.85, 0.7, 0.55];

export interface CropBox {
  x: number;
  y: number;
  size: number;
}

/** The largest centred square inside a width x height image. */
export function squareCropBox(width: number, height: number): CropBox {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const size = Math.min(w, h);
  return { x: Math.floor((w - size) / 2), y: Math.floor((h - size) / 2), size };
}

const DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

/** A square photo as stored: a PNG or JPEG data URL of at most `maxLength` characters. */
export function isSquarePhotoDataUrl(value: unknown, maxLength = SQUARE_PHOTO_MAX_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maxLength && DATA_URL.test(value);
}

/**
 * Picks the encoding to keep: the PNG when it is light, else the first JPEG
 * quality small enough (both come from the canvas `toDataURL`). Null when
 * nothing fits.
 */
export function pickSquarePhotoEncoding(
  encodePng: () => string,
  encodeJpeg: (quality: number) => string,
  maxLength = SQUARE_PHOTO_MAX_LENGTH,
): string | null {
  const png = encodePng();
  if (png.length <= Math.min(maxLength, SQUARE_PHOTO_PNG_MAX_LENGTH) && isSquarePhotoDataUrl(png, maxLength)) return png;
  for (const quality of SQUARE_PHOTO_JPEG_QUALITIES) {
    const jpeg = encodeJpeg(quality);
    if (isSquarePhotoDataUrl(jpeg, maxLength)) return jpeg;
  }
  return null;
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('not an image'));
      element.src = url;
    });
  } finally {
    // The decoded image stays usable after the URL is revoked.
    URL.revokeObjectURL(url);
  }
}

/**
 * Reads an image file (PNG, JPEG, WebP or SVG), keeps its centred square and
 * returns it as a data URL of `size` px (smaller images are not enlarged).
 * Null when the file is not an image the browser can draw, or the picture
 * stays too heavy.
 */
export async function prepareSquarePhotoDataUrl(
  file: Blob,
  { size = SQUARE_PHOTO_SIZE, maxLength = SQUARE_PHOTO_MAX_LENGTH }: { size?: number; maxLength?: number } = {},
): Promise<string | null> {
  try {
    const image = await loadImage(file);
    const crop = squareCropBox(image.naturalWidth || size, image.naturalHeight || size);
    const side = Math.max(1, Math.min(size, crop.size));
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, side, side);
    let flat: HTMLCanvasElement | null = null;
    return pickSquarePhotoEncoding(
      () => canvas.toDataURL('image/png'),
      (quality) => {
        if (!flat) {
          // A JPEG has no transparency: what is transparent becomes white, not black.
          flat = document.createElement('canvas');
          flat.width = side;
          flat.height = side;
          const flatContext = flat.getContext('2d');
          if (!flatContext) return '';
          flatContext.fillStyle = '#ffffff';
          flatContext.fillRect(0, 0, side, side);
          flatContext.drawImage(canvas, 0, 0);
        }
        return flat.toDataURL('image/jpeg', quality);
      },
      maxLength,
    );
  } catch {
    return null;
  }
}
