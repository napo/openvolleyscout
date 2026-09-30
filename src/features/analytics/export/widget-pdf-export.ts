import { toPng } from 'html-to-image';
import { saveFile } from '@src/lib/utils/save-file';
import {
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_SOFT_BG,
  preparePdfFont,
  type PdfFontFamily,
  buildPdfLogo,
  loadPdfMakeApi,
} from '@src/features/scouting/model/pdf-branding';
import type { RegisteredWidget } from './widget-export-registry';
import { buildVectorWidgetContent } from './widget-vector-content';

export interface WidgetPdfMeta {
  /** e.g. "Home Team vs Away Team". */
  matchLabel?: string;
  /** Pre-formatted match date, if known. */
  matchDate?: string;
  generatedAtLabel: string;
  /** Pre-translated attribution line, e.g. "A project by Maurizio Napolitano". */
  footerLabel: string;
}

/**
 * Rasterizes a widget's DOM subtree (mixed HTML + inline SVG — recharts
 * output, custom court SVGs, tables) to a PNG data URL. A white background is
 * forced regardless of on-screen styling since the app has no theme system
 * and a transparent capture would read badly against a white PDF page.
 */
export async function rasterizeWidgetElement(el: HTMLElement): Promise<string> {
  return toPng(el, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
    // Skip the widget's own "export as PDF" button/toolbar so it doesn't end
    // up baked into the exported image.
    filter: (node) => !(node instanceof HTMLElement && node.dataset.htmlToImageIgnore === 'true'),
  });
}

/** Text that decides the PDF font: widget contents plus the header/footer labels. */
function collectPdfText(elements: HTMLElement[], titles: string[], meta: WidgetPdfMeta): string {
  return [
    ...elements.map((el) => el.textContent ?? ''),
    ...titles,
    meta.matchLabel ?? '',
    meta.matchDate ?? '',
    meta.generatedAtLabel,
    meta.footerLabel,
  ].join('\n');
}

/**
 * A widget as pdfmake content: vector (SVG charts, text, tables) whenever the
 * widget has something drawable, otherwise a raster capture as a fallback.
 */
async function buildWidgetBody(el: HTMLElement, font: PdfFontFamily): Promise<Record<string, unknown>[]> {
  const vector = buildVectorWidgetContent(el, font);
  if (vector) {
    return vector.map((node) => (typeof node === 'string' ? { text: node } : node));
  }
  return [{ image: await rasterizeWidgetElement(el), fit: [750, 480], alignment: 'center' }];
}

function buildPdfHeader(title: string, meta: WidgetPdfMeta): Record<string, unknown>[] {
  return [
    {
      columns: [
        buildPdfLogo(20, 16),
        {
          width: '*',
          stack: [
            { text: title, style: 'pdfWidgetTitle' },
            ...(meta.matchLabel || meta.matchDate
              ? [{
                text: [meta.matchLabel, meta.matchDate].filter(Boolean).join(' · '),
                style: 'pdfWidgetMeta',
              }]
              : []),
          ],
          margin: [8, 0, 0, 0],
        },
        { width: 'auto', text: meta.generatedAtLabel, style: 'pdfWidgetMeta', alignment: 'right' },
      ],
      margin: [0, 0, 0, 8],
    },
  ];
}

function buildPdfFooter(meta: WidgetPdfMeta): Record<string, unknown> {
  const logoColumn = [buildPdfLogo(14, 11)];

  return {
    margin: [24, 6, 24, 0],
    columns: [
      ...logoColumn,
      { width: '*', text: meta.footerLabel, style: 'pdfWidgetFooter', margin: [4, 2, 0, 0] },
    ],
  };
}

const PDF_WIDGET_STYLES = {
  pdfWidgetTitle: { fontSize: 12, bold: true, color: COLOR_PRIMARY },
  pdfWidgetMeta: { fontSize: 7, color: COLOR_MUTED },
  pdfWidgetSectionHeading: { fontSize: 10, bold: true, color: COLOR_PRIMARY, fillColor: COLOR_SOFT_BG },
  pdfWidgetFooter: { fontSize: 6, color: COLOR_MUTED },
};

/** Saves one widget as a single-page A4 PDF (vector when possible). */
export async function exportWidgetAsPdf(el: HTMLElement, title: string, meta: WidgetPdfMeta): Promise<void> {
  const font = await preparePdfFont(collectPdfText([el], [title], meta));
  const [pdfMake, body] = await Promise.all([loadPdfMakeApi(), buildWidgetBody(el, font)]);

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 24, 24, 30],
    defaultStyle: { font, fontSize: 8 },
    styles: PDF_WIDGET_STYLES,
    footer: () => buildPdfFooter(meta),
    content: [
      ...buildPdfHeader(title, meta),
      ...body,
    ],
  };

  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  const fileNamePart = title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'widget';
  await saveFile(`${fileNamePart}.pdf`, blob, 'application/pdf');
}

/**
 * Composes every currently-registered widget (in registration/DOM order)
 * into a single multi-page PDF, one widget per page.
 */
export async function exportTabAsPdf(widgets: RegisteredWidget[], tabTitle: string, meta: WidgetPdfMeta): Promise<void> {
  const renderable = widgets.filter((widget): widget is RegisteredWidget & { ref: { current: HTMLElement } } => (
    widget.ref.current !== null
  ));
  if (renderable.length === 0) return;

  const font = await preparePdfFont(collectPdfText(
    renderable.map((widget) => widget.ref.current),
    [tabTitle, ...renderable.map((widget) => widget.title)],
    meta,
  ));
  const [pdfMake, bodies] = await Promise.all([
    loadPdfMakeApi(),
    Promise.all(renderable.map((widget) => buildWidgetBody(widget.ref.current, font))),
  ]);

  const content = renderable.flatMap((widget, index) => [
    ...buildPdfHeader(widget.title, meta),
    ...bodies[index],
    ...(index < renderable.length - 1 ? [{ text: '', pageBreak: 'after' as const }] : []),
  ]);

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 24, 24, 30],
    defaultStyle: { font, fontSize: 8 },
    styles: PDF_WIDGET_STYLES,
    footer: () => buildPdfFooter(meta),
    content: [
      { text: tabTitle, style: 'pdfWidgetSectionHeading', margin: [0, 0, 0, 10] },
      ...content,
    ],
  };

  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  const fileNamePart = tabTitle.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'tab';
  await saveFile(`${fileNamePart}.pdf`, blob, 'application/pdf');
}
