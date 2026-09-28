/**
 * Converts a widget's rendered DOM into vector pdfmake content: charts stay
 * SVG, headings and labels stay text, tables stay tables. The resulting PDF
 * is small, sharp at any zoom and its text can be selected and searched,
 * unlike a screenshot embedded as an image.
 *
 * Interactive controls (buttons, inputs, selects) and anything marked with
 * data-html-to-image-ignore are left out, as they mean nothing on paper.
 */

type PdfContent = Record<string, unknown> | string;

/** Printable width of an A4 landscape page with the widget PDF margins, in points. */
export const PDF_CONTENT_WIDTH = 794;
// Room left for a chart below the page header, in points.
const PDF_CHART_MAX_HEIGHT = 440;
// Charts are drawn for the screen; on paper they may grow up to this factor.
const MAX_CHART_UPSCALE = 2;

// Small SVGs are icons (legend swatches, markers), drawn inline next to their label.
const ICON_MAX_SIZE_PX = 24;
const CSS_PX_TO_PT = 0.75;

const SKIPPED_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'SCRIPT', 'STYLE', 'NOSCRIPT']);

// Presentation properties SVG-to-PDF renderers read from attributes, not from CSS classes.
const SVG_STYLE_PROPERTIES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
] as const;

function isHidden(element: Element): boolean {
  if (element instanceof HTMLElement && element.dataset.htmlToImageIgnore === 'true') return true;
  const style = window.getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden';
}

function isSkipped(element: Element): boolean {
  return SKIPPED_TAGS.has(element.tagName) || isHidden(element);
}

function cssColorToHex(value: string): string | undefined {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value.trim());
  if (!match) return undefined;
  if (match[4] !== undefined && Number(match[4]) === 0) return undefined;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

/** Serializes an on-screen SVG with its computed presentation styles inlined as attributes. */
export function serializeSvgForPdf(svg: SVGSVGElement, fontFamily: string): { markup: string; width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  const width = Math.round(rect.width) || Number(svg.getAttribute('width')) || 300;
  const height = Math.round(rect.height) || Number(svg.getAttribute('height')) || 150;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sourceNodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];

  sourceNodes.forEach((source, index) => {
    const target = cloneNodes[index];
    if (!target) return;
    const computed = window.getComputedStyle(source);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      target.setAttribute('display', 'none');
      return;
    }
    for (const property of SVG_STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value && value !== 'normal' && value !== 'auto') {
        target.setAttribute(property, value);
      }
    }
    if (source instanceof SVGTextElement || source instanceof SVGTSpanElement) {
      target.setAttribute('font-family', fontFamily);
    }
    target.removeAttribute('class');
    target.removeAttribute('style');
  });

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  return { markup: new XMLSerializer().serializeToString(clone), width, height };
}

function textOf(element: Element): string {
  return (element instanceof HTMLElement ? element.innerText : element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function textStyleFor(element: Element): Record<string, unknown> {
  const computed = window.getComputedStyle(element);
  const style: Record<string, unknown> = {};
  const weight = Number(computed.fontWeight);
  if (weight >= 600 || computed.fontWeight === 'bold') style.bold = true;
  const fontSizePt = Math.round(parseFloat(computed.fontSize) * CSS_PX_TO_PT);
  if (fontSizePt) style.fontSize = Math.min(Math.max(fontSizePt, 6), 16);
  const color = cssColorToHex(computed.color);
  if (color) style.color = color;
  return style;
}

function tableToPdf(table: HTMLTableElement): PdfContent | null {
  const rows = Array.from(table.rows)
    .filter((row) => !isHidden(row))
    .map((row) => Array.from(row.cells).filter((cell) => !isHidden(cell)).map((cell) => ({
      text: textOf(cell),
      bold: cell.tagName === 'TH',
      colSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
    })));
  const columnCount = Math.max(0, ...rows.map((row) => row.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0)));
  if (rows.length === 0 || columnCount === 0) return null;

  // pdfmake needs every row to span the same number of columns, with
  // placeholders after a colSpan cell.
  const body = rows.map((row) => {
    const cells: Record<string, unknown>[] = [];
    row.forEach((cell) => {
      cells.push(cell);
      for (let i = 1; i < (cell.colSpan ?? 1); i += 1) cells.push({});
    });
    while (cells.length < columnCount) cells.push({ text: '' });
    return cells;
  });

  return {
    table: { headerRows: table.tHead ? table.tHead.rows.length : 0, body },
    layout: 'lightHorizontalLines',
    fontSize: 7,
    margin: [0, 4, 0, 6],
  };
}

function isSmallSvg(svg: SVGSVGElement): boolean {
  const rect = svg.getBoundingClientRect();
  return rect.width <= ICON_MAX_SIZE_PX && rect.height <= ICON_MAX_SIZE_PX;
}

function hasBlockContent(element: Element): boolean {
  if (element.querySelector('table')) return true;
  return Array.from(element.querySelectorAll('svg')).some((svg) => !isSmallSvg(svg as SVGSVGElement));
}

/** A settings panel (axis checkboxes, scale toggles…): controls without any drawing. */
function isControlPanel(element: Element): boolean {
  return !hasBlockContent(element) && element.querySelector('input, select, textarea, button') !== null;
}

function legendEntry(item: Element, fontFamily: string): PdfContent | null {
  const text = textOf(item);
  if (!text) return null;
  const icon = item.querySelector('svg');
  return {
    width: 'auto',
    columns: [
      ...(icon instanceof SVGSVGElement
        ? [{ svg: serializeSvgForPdf(icon, fontFamily).markup, width: 8, height: 8, margin: [0, 1, 0, 0] }]
        : []),
      { text, ...textStyleFor(item), width: 'auto', noWrap: true, margin: [3, 0, 10, 0] },
    ],
    columnGap: 0,
  };
}

function isInlineOnly(element: Element): boolean {
  return Array.from(element.children).every((child) => {
    if (isSkipped(child)) return true;
    if (child instanceof SVGSVGElement) return isSmallSvg(child);
    const display = window.getComputedStyle(child).display;
    return display.startsWith('inline') && isInlineOnly(child);
  });
}

function collect(element: Element, fontFamily: string, out: PdfContent[]): void {
  if (isSkipped(element)) return;

  if (element instanceof SVGSVGElement) {
    if (isSmallSvg(element)) return;
    const { markup, width, height } = serializeSvgForPdf(element, fontFamily);
    const scale = Math.min(
      MAX_CHART_UPSCALE,
      PDF_CONTENT_WIDTH / (width * CSS_PX_TO_PT),
      PDF_CHART_MAX_HEIGHT / (height * CSS_PX_TO_PT),
    );
    out.push({
      svg: markup,
      width: Math.round(width * CSS_PX_TO_PT * scale),
      height: Math.round(height * CSS_PX_TO_PT * scale),
      alignment: 'center',
      margin: [0, 4, 0, 4],
    });
    return;
  }

  if (element instanceof HTMLTableElement) {
    const table = tableToPdf(element);
    if (table) out.push(table);
    return;
  }

  if (isControlPanel(element)) return;

  // Lists of short entries (chart legends) stay on one row, each with its swatch.
  if ((element.tagName === 'UL' || element.tagName === 'OL') && !hasBlockContent(element)) {
    const entries = Array.from(element.children)
      .filter((child) => !isSkipped(child))
      .map((child) => legendEntry(child, fontFamily))
      .filter((entry): entry is PdfContent => entry !== null);
    if (entries.length > 0) {
      out.push({ columns: [{ width: '*', text: '' }, ...entries, { width: '*', text: '' }], margin: [0, 2, 0, 2] });
    }
    return;
  }

  // A label with its colored swatch (e.g. a chart legend entry).
  const icons = Array.from(element.children).filter((child): child is SVGSVGElement => child instanceof SVGSVGElement && isSmallSvg(child));
  if (!hasBlockContent(element) && isInlineOnly(element)) {
    const text = textOf(element);
    if (!text) return;
    if (icons.length === 1) {
      const icon = serializeSvgForPdf(icons[0], fontFamily);
      out.push({
        columns: [
          { svg: icon.markup, width: 8, height: 8, margin: [0, 1, 0, 0] },
          { text, ...textStyleFor(element), width: '*', margin: [4, 0, 0, 0] },
        ],
        columnGap: 0,
        margin: [0, 1, 0, 1],
      });
    } else {
      out.push({ text, ...textStyleFor(element), margin: [0, 1, 0, 1] });
    }
    return;
  }

  for (const child of Array.from(element.children)) {
    collect(child, fontFamily, out);
  }
}

/**
 * Vector pdfmake content for a widget, or null when it has nothing that can be
 * drawn as vectors (the caller then falls back to a raster capture).
 */
export function buildVectorWidgetContent(el: HTMLElement, fontFamily: string): PdfContent[] | null {
  const content: PdfContent[] = [];
  for (const child of Array.from(el.children)) {
    collect(child, fontFamily, content);
  }
  const hasDrawing = content.some((node) => typeof node === 'object' && ('svg' in node || 'table' in node));
  return hasDrawing ? content : null;
}
