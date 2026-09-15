import ubuntuRegularUrl from '../../../assets/fonts/ubuntu/Ubuntu-Regular.ttf?url';
import ubuntuBoldUrl from '../../../assets/fonts/ubuntu/Ubuntu-Bold.ttf?url';
import ubuntuItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-Italic.ttf?url';
import ubuntuBoldItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-BoldItalic.ttf?url';
import openVolleyScoutLogoUrl from '@src/assets/openvolleyscout.png?url';

/**
 * Shared PDF branding: colors, fonts and the OVS logo, plus the pdfmake
 * loading/registration plumbing. Used by the match report PDF and by the
 * analytics widget/tab PDF export, so every PDF produced by the app looks
 * visually consistent regardless of which feature generated it.
 */

export const COLOR_PRIMARY = '#002554';
export const COLOR_ACCENT = '#0169D8';
export const COLOR_SOFT_BG = '#eef5ff';
export const COLOR_BORDER = '#7f93b4';
export const COLOR_TEXT = '#111827';
export const COLOR_TOTALS_BG = '#dfe8f7';
export const COLOR_STARTER_BG = '#444444';
export const COLOR_MUTED = '#6b7280';

export type PdfMakeApi = {
  createPdf: (docDefinition: unknown) => { getBlob: () => Promise<Blob> };
  addFonts: (fonts: Record<string, unknown>) => void;
  addVirtualFileSystem: (vfs: Record<string, string>) => void;
};

let pdfMakeApiPromise: Promise<PdfMakeApi> | null = null;

/**
 * pdfmake's browser build is a webpack/UMD bundle — its named exports don't
 * survive ESM interop reliably (both Vite's dev-time analysis and Node's
 * import() produce named bindings that resolve to `undefined` or unrelated
 * bundled internals here). The real API object is always the module's
 * `.default`, so read from there instead of destructuring named imports.
 */
export async function loadPdfMakeApi(): Promise<PdfMakeApi> {
  if (!pdfMakeApiPromise) {
    pdfMakeApiPromise = import('pdfmake/build/pdfmake').then((mod) => {
      const namespace = mod as unknown as { default?: Partial<PdfMakeApi> } & Partial<PdfMakeApi>;
      const api = typeof namespace.default?.createPdf === 'function' ? namespace.default : namespace;
      if (typeof api.createPdf !== 'function' || typeof api.addFonts !== 'function' || typeof api.addVirtualFileSystem !== 'function') {
        throw new Error('pdfmake module did not expose the expected API');
      }
      return api as PdfMakeApi;
    });
  }
  return pdfMakeApiPromise;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

let logoBase64: string | null = null;
let pdfAssetsReady: Promise<void> | null = null;

export async function ensurePdfAssetsReady(): Promise<void> {
  if (!pdfAssetsReady) {
    pdfAssetsReady = (async () => {
      const pdfMake = await loadPdfMakeApi();
      const [regular, bold, italic, boldItalic, logo] = await Promise.all([
        fetchAsBase64(ubuntuRegularUrl),
        fetchAsBase64(ubuntuBoldUrl),
        fetchAsBase64(ubuntuItalicUrl),
        fetchAsBase64(ubuntuBoldItalicUrl),
        fetchAsBase64(openVolleyScoutLogoUrl),
      ]);

      pdfMake.addVirtualFileSystem({
        'Ubuntu-Regular.ttf': regular,
        'Ubuntu-Bold.ttf': bold,
        'Ubuntu-Italic.ttf': italic,
        'Ubuntu-BoldItalic.ttf': boldItalic,
      });
      pdfMake.addFonts({
        Ubuntu: {
          normal: 'Ubuntu-Regular.ttf',
          bold: 'Ubuntu-Bold.ttf',
          italics: 'Ubuntu-Italic.ttf',
          bolditalics: 'Ubuntu-BoldItalic.ttf',
        },
      });

      logoBase64 = logo;
    })();
  }
  return pdfAssetsReady;
}

/** Only meaningful after {@link ensurePdfAssetsReady} has resolved. */
export function getLogoBase64(): string | null {
  return logoBase64;
}
