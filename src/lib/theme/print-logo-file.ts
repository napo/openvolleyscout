// SPDX-License-Identifier: AGPL-3.0-or-later
import { isPrintLogo, MAX_LOGO_LENGTH } from './print-theme';

/** Longest side of a stored logo: plenty for a 2 cm band, small enough for every document. */
export const LOGO_SIZE = 256;
/** Wider (or taller) than this, the logo shrinks a lot in the square place of the band. */
export const LOGO_MAX_RATIO = 1.6;

export interface PreparedLogo {
  dataUrl: string;
  /** Width / height after trimming the empty border. */
  ratio: number;
  /** True when the border around the drawing was cut away. */
  trimmed: boolean;
}

/**
 * The box of the drawing inside an image: what differs from the background, which is transparency or the colour
 * of the top-left corner. Null when the whole image is background.
 */
export function drawingBox(pixels: Uint8ClampedArray, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  const [r0, g0, b0, a0] = [pixels[0], pixels[1], pixels[2], pixels[3]];
  const transparent = a0 < 16;
  const isBackground = (index: number) => {
    const alpha = pixels[index + 3];
    if (alpha < 16) return true;
    if (transparent) return false;
    return Math.abs(pixels[index] - r0) + Math.abs(pixels[index + 1] - g0) + Math.abs(pixels[index + 2] - b0) <= 30;
  };
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isBackground((y * width + x) * 4)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Reads an image file (PNG, JPEG, WebP or SVG), cuts the empty border around the drawing, and returns it as a
 * small PNG (or a JPEG when the PNG is too heavy). Null when the file is not an image the browser can draw.
 */
export async function prepareLogoDataUrl(file: File): Promise<PreparedLogo | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('not an image'));
      element.src = url;
    });
    // Draw once at a workable size to find the drawing, then crop and scale it.
    const sourceWidth = image.naturalWidth || LOGO_SIZE * 2, sourceHeight = image.naturalHeight || LOGO_SIZE * 2;
    const work = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
    const probe = document.createElement('canvas');
    probe.width = Math.max(1, Math.round(sourceWidth * work));
    probe.height = Math.max(1, Math.round(sourceHeight * work));
    const probeContext = probe.getContext('2d');
    if (!probeContext) return null;
    probeContext.drawImage(image, 0, 0, probe.width, probe.height);
    const box = drawingBox(probeContext.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height)
      ?? { x: 0, y: 0, width: probe.width, height: probe.height };
    const trimmed = box.width < probe.width || box.height < probe.height;
    // A thin margin keeps the drawing from touching the edge of its place.
    const margin = Math.round(Math.max(box.width, box.height) * 0.04);
    const crop = {
      x: Math.max(0, box.x - margin), y: Math.max(0, box.y - margin),
      width: Math.min(probe.width, box.width + margin * 2), height: Math.min(probe.height, box.height + margin * 2),
    };
    const scale = Math.min(1, LOGO_SIZE / Math.max(crop.width, crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width * scale));
    canvas.height = Math.max(1, Math.round(crop.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(probe, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    const ratio = canvas.width / canvas.height;
    const png = canvas.toDataURL('image/png');
    if (png.length <= MAX_LOGO_LENGTH && isPrintLogo(png)) return { dataUrl: png, ratio, trimmed };
    const jpeg = canvas.toDataURL('image/jpeg', 0.85);
    return isPrintLogo(jpeg) ? { dataUrl: jpeg, ratio, trimmed } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
