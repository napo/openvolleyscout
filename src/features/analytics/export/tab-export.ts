import { strToU8, unzipSync, zipSync } from 'fflate';
import { toPng } from 'html-to-image';
import { APP_METADATA } from '@src/lib/constants/app';
import { saveFile } from '@src/lib/utils/save-file';
import { buildReportPptx } from '@src/features/opponent-reports/model/report-presentation-export';
import { buildPdfLogo, loadPdfMakeApi, preparePdfFont } from '@src/features/scouting/model/pdf-branding';
import type { WidgetPdfMeta } from './widget-pdf-export';
import { inlineSvgStylesForCapture, serializeSvgForPdf } from './widget-vector-content';

export type TabExportFormat = 'pdf' | 'pptx' | 'ods' | 'svg';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const TACTICAL_COLOR = '#142e42';
const defaultTacticalFooter = () => `${APP_METADATA.name} · ${APP_METADATA.author.name} · ${APP_METADATA.urls.webApp} · GNU AGPL v3 or later (${APP_METADATA.license})`;
const xml = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]!));
const ignored = 'button, input, select, textarea, script, style, [data-html-to-image-ignore="true"]';
const svgColor = (value: string) => value.replace(
  /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/,
  (_, r, g, b, a) => {
    const rgb = [r, g, b].map(n => Math.round(Number(n) * 255)).join(', ');
    return a === undefined ? `rgb(${rgb})` : `rgba(${rgb}, ${a})`;
  },
);

function visible(element: Element): boolean {
  if (element.closest(ignored)) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

/** Preserve spans as empty cells so spreadsheet columns still line up. */
export function tableRows(table: HTMLTableElement): string[][] {
  const rows: string[][] = [];
  const occupied: boolean[][] = [];
  const visibleRows = Array.from(table.rows).filter(visible);
  visibleRows.forEach((row, r) => {
    rows[r] = [];
    occupied[r] ??= [];
    let c = 0;
    Array.from(row.cells).filter(visible).forEach(cell => {
      while (occupied[r][c]) { rows[r][c] = ''; c++; }
      rows[r][c] = (cell.innerText || cell.textContent || '').trim();
      const rowSpan = Math.min(cell.rowSpan || visibleRows.length - r, visibleRows.length - r);
      for (let dr = 0; dr < rowSpan; dr++) {
        occupied[r + dr] ??= [];
        for (let dc = 0; dc < cell.colSpan; dc++) {
          occupied[r + dr][c + dc] = true;
          if (dr === 0 && dc > 0) rows[r][c + dc] = '';
        }
      }
      c += cell.colSpan;
    });
    while (occupied[r][c]) { rows[r][c] = ''; c++; }
  });
  return rows;
}

/** Strings deliberately remain strings: scores, percentages and shirt numbers retain their display. */
export function buildTabOds(rows: readonly (readonly string[])[], title: string): Uint8Array {
  const sheetName = title.replace(/['*/\\?:[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet1';
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
  const content = `${declaration}<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3"><office:body><office:spreadsheet><table:table table:name="${xml(sheetName)}">${rows.map(row => `<table:table-row>${row.map(cell => `<table:table-cell office:value-type="string"><text:p xml:space="preserve">${xml(cell)}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table></office:spreadsheet></office:body></office:document-content>`;
  return zipSync({
    mimetype: [strToU8(ODS_MIME), { level: 0 }],
    'content.xml': strToU8(content),
    'META-INF/manifest.xml': strToU8(`${declaration}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${ODS_MIME}" manifest:version="1.3"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`),
  });
}

export function collectTabRows(root: HTMLElement, title: string, matchLabel: string, footer = defaultTacticalFooter()): string[][] {
  const rows: string[][] = [[title], [matchLabel]];
  const visit = (element: Element) => {
    if (!visible(element)) return;
    if (element instanceof HTMLTableElement) {
      rows.push([], ...tableRows(element));
      return;
    }
    if (element instanceof HTMLSelectElement) return;
    if (element instanceof SVGSVGElement) {
      const labels = Array.from(element.querySelectorAll('text')).filter(visible).map(node => node.textContent?.trim() ?? '');
      if (labels.length) rows.push(labels);
      return;
    }
    if (element instanceof HTMLCanvasElement) {
      const rawRows = element.dataset.exportRows;
      if (rawRows) {
        try {
          const parsed = JSON.parse(rawRows) as string[][];
          if (Array.isArray(parsed) && parsed.length) rows.push([], ...parsed);
        } catch {
          // Ignore malformed dataset export rows
        }
      }
      return;
    }
    if (!element.children.length) {
      const text = element.textContent?.trim();
      if (text) rows.push([text]);
      return;
    }
    for (const child of element.childNodes) {
      if (child instanceof Element) visit(child);
      else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) rows.push([child.textContent.trim()]);
    }
  };
  visit(root);
  rows.push([], [footer]);
  return rows;
}

/** Self-contained vector snapshot: HTML text and cell backgrounds become SVG objects. */
export function buildTabSvg(
  root: HTMLElement,
  title: string,
  matchLabel: string,
  options: { headerSubtitle?: string; footer?: string } = {},
): string {
  const origin = root.getBoundingClientRect();
  const width = Math.max(root.scrollWidth, origin.width);
  const height = Math.max(root.scrollHeight, origin.height);
  const offset = 92;
  const footerHeight = 48;
  const headerSubtitle = options.headerSubtitle ?? matchLabel.split(' · ')[0] ?? matchLabel;
  const footer = options.footer ?? defaultTacticalFooter();
  const objects: string[] = [];
  const visit = (element: Element) => {
    if (!visible(element)) return;
    const box = element.getBoundingClientRect();
    const x = box.left - origin.left, y = box.top - origin.top + offset;
    if (element instanceof SVGSVGElement) {
      const { markup } = serializeSvgForPdf(element, getComputedStyle(element).fontFamily);
      objects.push(`<g transform="translate(${x} ${y})">${markup}</g>`);
      return;
    }
    if (element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0) {
      objects.push(`<image x="${x}" y="${y}" width="${box.width}" height="${box.height}" href="${element.toDataURL('image/png')}"/>`);
      return;
    }
    const style = getComputedStyle(element);
    const bg = svgColor(style.backgroundColor);
    if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      objects.push(`<rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="${xml(bg)}"/>`);
    }
    if (element.matches('td, th')) objects.push(`<rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="none" stroke="#d9e2ec" stroke-width="0.5"/>`);
    for (const node of element.childNodes) {
      if (node instanceof Element) { visit(node); continue; }
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      // Group characters by rendered line, preserving wrapped headings and table cells.
      const range = document.createRange();
      let line = '', lineBox: DOMRect | undefined;
      const textColor = svgColor(style.color);
      const flush = () => {
        if (lineBox && line.trim()) objects.push(`<text x="${lineBox.left - origin.left}" y="${lineBox.top - origin.top + offset}" dominant-baseline="text-before-edge" fill="${xml(textColor)}" font-family="${xml(style.fontFamily)}" font-size="${xml(style.fontSize)}" font-weight="${xml(style.fontWeight)}" font-style="${xml(style.fontStyle)}" xml:space="preserve">${xml(line)}</text>`);
      };
      for (let i = 0; i < node.textContent.length; i++) {
        range.setStart(node, i); range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0) continue;
        if (lineBox && Math.abs(rect.top - lineBox.top) > 1) { flush(); line = ''; lineBox = undefined; }
        lineBox ??= rect;
        line += node.textContent[i];
      }
      flush();
    }
  };
  visit(root);
  const totalHeight = height + offset + footerHeight;
  const lineY = totalHeight - 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}"><title>${xml(title)}</title><rect width="100%" height="100%" fill="white"/><rect width="100%" height="65" fill="${TACTICAL_COLOR}"/><text x="20" y="20" font-family="sans-serif" font-size="11" font-weight="bold" fill="#ffffff">${xml(headerSubtitle)}</text><text x="20" y="44" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ffffff">${xml(title)}</text><text x="20" y="80" font-family="sans-serif" font-size="11" fill="${TACTICAL_COLOR}">${xml(matchLabel)}</text>${objects.join('')}<line x1="20" y1="${lineY}" x2="${Math.max(20, width - 20)}" y2="${lineY}" stroke="#cbd5e1"/><text x="20" y="${lineY + 14}" font-family="sans-serif" font-size="10" fill="${TACTICAL_COLOR}">${xml(footer)}</text><text x="20" y="${lineY + 26}" font-family="sans-serif" font-size="10" fill="${TACTICAL_COLOR}">1 / 1</text></svg>`;
}

/** Reuse the existing OOXML package, adding one visual snapshot per slide with the tactical header and footer. */
export function buildTabPptx(
  images: readonly { base64: string; width: number; height: number }[],
  title: string,
  options: { headerSubtitle?: string; context?: string; footer?: string } = {},
): Uint8Array {
  const headerSubtitle = options.headerSubtitle ?? '';
  const context = options.context ?? '';
  const footer = options.footer ?? defaultTacticalFooter();
  const files = unzipSync(buildReportPptx({
    width: 960,
    height: 540,
    pages: images.map((_, index) => [
      {
        kind: 'rect',
        x: 0,
        y: 0,
        width: 960,
        height: 44,
        paint: { fill: '142E42', fillOpacity: 1, strokeOpacity: 0, strokeWidth: 0, dashed: false },
      },
      ...(headerSubtitle ? [{
        kind: 'text' as const,
        text: headerSubtitle,
        x: 20,
        y: 4,
        width: 920,
        height: 12,
        fontSize: 8,
        bold: true,
        color: 'FFFFFF',
        rtl: false,
      }] : []),
      {
        kind: 'text',
        text: title,
        x: 20,
        y: headerSubtitle ? 16 : 10,
        width: 920,
        height: 24,
        fontSize: Math.min(15, 1650 / Math.max(title.length, 1)),
        bold: true,
        color: 'FFFFFF',
        rtl: false,
      },
      ...(context ? [{
        kind: 'text' as const,
        text: context,
        x: 20,
        y: 46,
        width: 920,
        height: 10,
        fontSize: 7,
        bold: false,
        color: '142E42',
        rtl: false,
      }] : []),
      {
        kind: 'path',
        points: [{ x: 20, y: 516 }, { x: 940, y: 516 }],
        closed: false,
        paint: { stroke: 'CBD5E1', strokeOpacity: 1, strokeWidth: 0.5, fillOpacity: 0, dashed: false },
      },
      {
        kind: 'text',
        text: footer,
        x: 20,
        y: 520,
        width: 840,
        height: 14,
        fontSize: 6.5,
        bold: false,
        color: '142E42',
        rtl: false,
      },
      {
        kind: 'text',
        text: `${index + 1} / ${images.length}`,
        x: 880,
        y: 520,
        width: 60,
        height: 14,
        fontSize: 6.5,
        bold: false,
        color: '142E42',
        rtl: false,
      },
    ]),
  }, title));
  files['[Content_Types].xml'] = strToU8(new TextDecoder().decode(files['[Content_Types].xml']).replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  images.forEach((image, index) => {
    const slide = `ppt/slides/slide${index + 1}.xml`;
    const scale = Math.min(912 / image.width, 450 / image.height);
    const w = Math.round(image.width * scale * 12700), h = Math.round(image.height * scale * 12700);
    const x = Math.round((960 * 12700 - w) / 2), y = Math.round(58 * 12700 + (450 * 12700 - h) / 2);
    const picture = `<p:pic><p:nvPicPr><p:cNvPr id="20" name="${xml(title)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    files[slide] = strToU8(new TextDecoder().decode(files[slide]).replace('</p:spTree>', `${picture}</p:spTree>`));
    const rels = `ppt/slides/_rels/slide${index + 1}.xml.rels`;
    files[rels] = strToU8(new TextDecoder().decode(files[rels]).replace('</Relationships>', `<Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/tab${index + 1}.png"/></Relationships>`));
    files[`ppt/media/tab${index + 1}.png`] = Uint8Array.from(atob(image.base64), ch => ch.charCodeAt(0));
  });
  return zipSync(files);
}

async function captureTabImages(root: HTMLElement): Promise<{ base64: string; width: number; height: number }[]> {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('.perf-dashboard__section, .heatmap-widget'));
  // Use sections only when they contain all of the dashboard's statistics.
  const isSplitBySections = Boolean(sections.length && root.querySelector('.perf-dashboard'));
  const parts = isSplitBySections ? sections : [root];
  const images = [];
  for (const part of parts) {
    const restoreSvgStyles = inlineSvgStylesForCapture(part);
    let png: string;
    try {
      png = await toPng(part, {
        pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true,
        filter: node => !(node instanceof HTMLElement && node.matches('button, input:not([type="checkbox"]):not([type="radio"]), textarea, [data-html-to-image-ignore="true"]')),
      });
    } finally {
      restoreSvgStyles();
    }
    const image = new Image();
    image.src = png;
    await image.decode();
    // Keep a single dashboard widget (such as a heatmap court canvas or radar chart) intact on one page/slide.
    if (isSplitBySections && part.querySelector('canvas, svg')) {
      images.push({ base64: png.split(',')[1], width: image.width, height: image.height });
      continue;
    }
    const bandHeight = Math.max(1, Math.floor(image.width * 450 / 912));
    const origin = part.getBoundingClientRect();
    const pixelScale = image.width / Math.max(1, origin.width);
    const lines: { top: number; bottom: number }[] = [];
    const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim() || !node.parentElement || !visible(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) lines.push({ top: (rect.top - origin.top) * pixelScale, bottom: (rect.bottom - origin.top) * pixelScale });
    }
    // Keep court cards, SVGs, canvases, and table rows intact rather than slicing them across pages/slides.
    for (const block of part.querySelectorAll<Element>('.sideout-study__rotation, .sideout-seq__col, svg, canvas, tr')) {
      if (!visible(block)) continue;
      const rect = block.getBoundingClientRect();
      const blockTop = (rect.top - origin.top) * pixelScale;
      const blockBottom = (rect.bottom - origin.top) * pixelScale;
      if (blockBottom > blockTop && blockBottom - blockTop <= bandHeight * 0.95) {
        lines.push({ top: blockTop, bottom: blockBottom });
      }
    }
    for (let top = 0; top < image.height;) {
      let bottom = Math.min(top + bandHeight, image.height);
      // Move the cut above any text line or court card it intersects, keeping continuation pages intact.
      for (let attempt = 0; attempt < lines.length; attempt++) {
        const crossing = lines.filter(line => line.top < bottom && line.bottom > bottom);
        if (!crossing.length) break;
        const before = Math.floor(Math.min(...crossing.map(line => line.top)));
        if (before <= top + 24) break;
        bottom = before;
      }
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = bottom - top;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(image, 0, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      images.push({ base64: canvas.toDataURL('image/png').split(',')[1], width: canvas.width, height: canvas.height });
      top = bottom;
    }
  }
  return images;
}

export async function exportTabDocument(root: HTMLElement, format: TabExportFormat, title: string, matchLabel: string, meta: WidgetPdfMeta): Promise<void> {
  const fileName = `${matchLabel}-${title}`.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'statistics';
  const filters = Array.from(root.querySelectorAll('select'))
    .filter(select => select.getClientRects().length > 0)
    .map(select => select.selectedOptions[0]?.textContent?.trim()).filter(Boolean);
  const context = [matchLabel, ...filters].join(' · ');
  const footer = meta.footerLabel || defaultTacticalFooter();
  if (format === 'ods') {
    await saveFile(`${fileName}.ods`, buildTabOds(collectTabRows(root, title, context, footer), title), ODS_MIME);
  } else if (format === 'svg') {
    await saveFile(`${fileName}.svg`, buildTabSvg(root, title, context, { headerSubtitle: matchLabel, footer }), 'image/svg+xml');
  } else {
    const images = await captureTabImages(root);
    if (format === 'pptx') {
      await saveFile(`${fileName}.pptx`, buildTabPptx(images, title, { headerSubtitle: matchLabel, context, footer }), PPTX_MIME);
      return;
    }
    const [pdfMake, font] = await Promise.all([
      loadPdfMakeApi(), preparePdfFont(`${title} ${matchLabel} ${context} ${meta.generatedAtLabel} ${footer}`),
    ]);
    const blob = await pdfMake.createPdf({
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [24, 68, 24, 34],
      defaultStyle: { font, fontSize: 8 },
      header: () => ({
        stack: [
          {
            table: {
              widths: ['*'],
              body: [[{
                fillColor: TACTICAL_COLOR,
                border: [false, false, false, false],
                margin: [20, 8, 20, 8],
                columns: [
                  buildPdfLogo(24, 24),
                  {
                    width: '*',
                    margin: [8, 0, 0, 0],
                    stack: [
                      { text: matchLabel, fontSize: 8, bold: true, color: '#ffffff' },
                      { text: title, fontSize: 13, bold: true, color: '#ffffff', margin: [0, 2, 0, 0] },
                    ],
                  },
                ],
              }]],
            },
          },
          { text: `${context} · ${meta.generatedAtLabel}`, fontSize: 7, color: TACTICAL_COLOR, margin: [24, 4, 24, 0] },
        ],
      }),
      footer: (currentPage: number, pageCount: number) => ({
        margin: [24, 4, 24, 0],
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 794, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }], margin: [0, 0, 0, 4] },
          {
            columns: [
              buildPdfLogo(12, 10),
              { width: '*', text: footer, fontSize: 6, color: TACTICAL_COLOR, margin: [4, 1, 0, 0] },
              { width: 'auto', text: `${currentPage} / ${pageCount}`, fontSize: 6, color: TACTICAL_COLOR, alignment: 'right', margin: [0, 1, 0, 0] },
            ],
          },
        ],
      }),
      content: images.map((image, index) => ({
        image: `data:image/png;base64,${image.base64}`,
        fit: [790, 470],
        alignment: 'center',
        ...(index ? { pageBreak: 'before' } : {}),
      })),
    }).getBlob();
    await saveFile(`${fileName}.pdf`, blob, 'application/pdf');
  }
}
