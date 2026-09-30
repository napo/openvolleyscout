import ubuntuRegularUrl from '../../../assets/fonts/ubuntu/Ubuntu-Regular.ttf?url';
import ubuntuBoldUrl from '../../../assets/fonts/ubuntu/Ubuntu-Bold.ttf?url';
import ubuntuItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-Italic.ttf?url';
import ubuntuBoldItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-BoldItalic.ttf?url';
import notoSansJpRegularUrl from '../../../assets/fonts/noto-cjk/NotoSansJP-Regular.ttf?url';
import notoSansJpBoldUrl from '../../../assets/fonts/noto-cjk/NotoSansJP-Bold.ttf?url';
import notoSansScRegularUrl from '../../../assets/fonts/noto-cjk/NotoSansSC-Regular.ttf?url';
import notoSansScBoldUrl from '../../../assets/fonts/noto-cjk/NotoSansSC-Bold.ttf?url';
import openVolleyScoutLogoSvgSource from '@src/assets/openvolleyscout.svg?raw';

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
  if (!response.ok) {
    throw new Error(`Could not load PDF asset ${url} (HTTP ${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

// Editor metadata (Inkscape/Sodipodi) means nothing to the PDF renderer.
const LOGO_SVG = openVolleyScoutLogoSvgSource
  .replace(/<\?xml[^>]*>/, '')
  .replace(/<sodipodi:namedview[\s\S]*?(?:\/>|<\/sodipodi:namedview>)/g, '')
  .replace(/\s(?:inkscape|sodipodi):[\w-]+="[^"]*"/g, '');
let pdfAssetsReady: Promise<void> | null = null;

export async function ensurePdfAssetsReady(): Promise<void> {
  if (!pdfAssetsReady) {
    pdfAssetsReady = (async () => {
      const pdfMake = await loadPdfMakeApi();
      const [regular, bold, italic, boldItalic] = await Promise.all([
        fetchAsBase64(ubuntuRegularUrl),
        fetchAsBase64(ubuntuBoldUrl),
        fetchAsBase64(ubuntuItalicUrl),
        fetchAsBase64(ubuntuBoldItalicUrl),
      ]);

      pdfMake.addVirtualFileSystem({
        'Ubuntu-Regular.ttf': regular,
        'Ubuntu-Bold.ttf': bold,
        'Ubuntu-Italic.ttf': italic,
        'Ubuntu-BoldItalic.ttf': boldItalic,
      });
      pdfMake.addFonts({
        [PDF_FONT_LATIN]: {
          normal: 'Ubuntu-Regular.ttf',
          bold: 'Ubuntu-Bold.ttf',
          italics: 'Ubuntu-Italic.ttf',
          bolditalics: 'Ubuntu-BoldItalic.ttf',
        },
      });
    })();
    pdfAssetsReady.catch(() => {
      pdfAssetsReady = null;
    });
  }
  return pdfAssetsReady;
}

/** Font family names registered with pdfmake. */
export const PDF_FONT_LATIN = 'Ubuntu';
export const PDF_FONT_JAPANESE = 'NotoSansJP';
export const PDF_FONT_CHINESE = 'NotoSansSC';

export type PdfFontFamily = typeof PDF_FONT_LATIN | typeof PDF_FONT_JAPANESE | typeof PDF_FONT_CHINESE;

// Ubuntu has no CJK glyphs, so Japanese/Chinese text (UI strings or team and
// player names) would print as blanks. pdfmake cannot fall back per glyph, so
// a document containing CJK text is typeset entirely in a Noto Sans CJK font,
// which also covers Latin. Those fonts are ~2.5 MB per weight (subset by
// scripts/subset-cjk-fonts.py) and only fetched the first time they are needed.
const KANA_PATTERN = /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/;
const CJK_PATTERN = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** The font family able to render `text`: Japanese if it has kana, Chinese for other CJK text. */
export function pickPdfFontFamily(text: string): PdfFontFamily {
  if (KANA_PATTERN.test(text)) return PDF_FONT_JAPANESE;
  if (CJK_PATTERN.test(text)) return PDF_FONT_CHINESE;
  return PDF_FONT_LATIN;
}

const CJK_FONT_FILES: Record<Exclude<PdfFontFamily, typeof PDF_FONT_LATIN>, { regular: string; bold: string }> = {
  [PDF_FONT_JAPANESE]: { regular: notoSansJpRegularUrl, bold: notoSansJpBoldUrl },
  [PDF_FONT_CHINESE]: { regular: notoSansScRegularUrl, bold: notoSansScBoldUrl },
};

const cjkFontsReady = new Map<PdfFontFamily, Promise<void>>();

function ensureCjkFontReady(family: Exclude<PdfFontFamily, typeof PDF_FONT_LATIN>): Promise<void> {
  let ready = cjkFontsReady.get(family);
  if (!ready) {
    ready = (async () => {
      const pdfMake = await loadPdfMakeApi();
      const files = CJK_FONT_FILES[family];
      const [regular, bold] = await Promise.all([fetchAsBase64(files.regular), fetchAsBase64(files.bold)]);
      pdfMake.addVirtualFileSystem({
        [`${family}-Regular.ttf`]: regular,
        [`${family}-Bold.ttf`]: bold,
      });
      // No CJK italics exist: italic styles reuse the upright faces.
      pdfMake.addFonts({
        [family]: {
          normal: `${family}-Regular.ttf`,
          bold: `${family}-Bold.ttf`,
          italics: `${family}-Regular.ttf`,
          bolditalics: `${family}-Bold.ttf`,
        },
      });
    })();
    ready.catch(() => cjkFontsReady.delete(family));
    cjkFontsReady.set(family, ready);
  }
  return ready;
}

/**
 * Registers the fonts needed to typeset `text` and returns the family to use
 * as the document's default font.
 */
export async function preparePdfFont(text: string): Promise<PdfFontFamily> {
  await ensurePdfAssetsReady();
  const family = pickPdfFontFamily(text);
  if (family !== PDF_FONT_LATIN) {
    await ensureCjkFontReady(family);
  }
  return family;
}

/**
 * The OVS logo as a vector pdfmake node fitting a `width` × `height` box (in
 * points). A few KB and sharp at any zoom, where the PNG logo added ~400 KB
 * to every PDF for an image shown at 16-20 pt.
 */
export function buildPdfLogo(width: number, height: number): Record<string, unknown> {
  return { width, svg: LOGO_SVG, fit: [width, height] };
}
