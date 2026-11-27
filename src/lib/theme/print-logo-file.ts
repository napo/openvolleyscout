// SPDX-License-Identifier: AGPL-3.0-or-later
import { isPrintLogo, MAX_LOGO_LENGTH } from './print-theme';

/** Longest side of a stored logo: plenty for a 2 cm band, small enough for every document. */
const LOGO_SIZE = 256;

/**
 * Reads an image file (PNG, JPEG, WebP or SVG) and returns it as a small PNG, or a JPEG when the PNG is too heavy.
 * Null when the file is not an image the browser can draw.
 */
export async function prepareLogoDataUrl(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('not an image'));
      element.src = url;
    });
    const width = image.naturalWidth || LOGO_SIZE, height = image.naturalHeight || LOGO_SIZE;
    const scale = Math.min(1, LOGO_SIZE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    if (png.length <= MAX_LOGO_LENGTH && isPrintLogo(png)) return png;
    const jpeg = canvas.toDataURL('image/jpeg', 0.85);
    return isPrintLogo(jpeg) ? jpeg : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
