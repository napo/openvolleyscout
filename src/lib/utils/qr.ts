import { create as createQrCode, toDataURL } from 'qrcode';

export const MAX_QR_URL_BYTES = 2900;

function isQrUrlEncodable(url: string): boolean {
  return new TextEncoder().encode(url).length <= MAX_QR_URL_BYTES;
}

/** QR code as a standalone SVG; null when the URL is too long to encode. */
export function buildQrSvg(url: string): string | null {
  if (!isQrUrlEncodable(url)) return null;
  const matrix = createQrCode(url, { errorCorrectionLevel: 'L' }).modules;
  const quietZone = 4;
  const size = matrix.size + quietZone * 2;
  const modules: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.get(row, column)) {
        modules.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${modules.join(' ')}" fill="#000"/></svg>`;
}

/** PNG bytes for saving or sharing; null when the URL is too long to encode. */
export async function buildQrPng(url: string): Promise<Uint8Array | null> {
  if (!isQrUrlEncodable(url)) return null;
  const dataUrl = await toDataURL(url, { errorCorrectionLevel: 'L', margin: 4, width: 720 });
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
