import regularUrl from '@src/assets/fonts/noto-arabic/OVSArabic-Regular.ttf?url';
import boldUrl from '@src/assets/fonts/noto-arabic/OVSArabic-Bold.ttf?url';

const ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
type PdfNode = Record<string, unknown>;
let fontsReady: Promise<void> | undefined;

/** Use the browser's bidi layout for PDF text: pdfmake itself places words LTR. */
export async function prepareRtlReportPdf(definition: PdfNode): Promise<PdfNode> {
  if (!ARABIC.test(JSON.stringify(definition.content))) return definition;
  fontsReady ??= Promise.all([
    new FontFace('OVSArabicPDF', `url(${regularUrl})`).load(),
    new FontFace('OVSArabicPDF', `url(${boldUrl})`, { weight: 'bold' }).load(),
  ]).then((fonts) => { fonts.forEach((font) => document.fonts.add(font)); });
  try { await fontsReady; } catch (error) { fontsReady = undefined; throw error; }

  const measure = document.createElement('div');
  Object.assign(measure.style, { position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', direction: 'rtl', whiteSpace: 'normal', fontFamily: 'OVSArabicPDF', lineHeight: '1.2' });
  document.body.appendChild(measure);
  const styles = (definition.styles ?? {}) as Record<string, PdfNode>;
  const defaults = (definition.defaultStyle ?? {}) as PdfNode;

  const lines = (text: string, width: number, size: number, bold: boolean): string[][] => {
    const result: string[][] = [];
    measure.style.width = `${Math.max(20, width)}px`;
    measure.style.fontSize = `${size}px`;
    measure.style.fontWeight = bold ? 'bold' : 'normal';
    for (const paragraph of text.split('\n')) {
      measure.replaceChildren();
      // Keep Arabic letter runs intact for shaping, while Latin names, numbers
      // and punctuation take their visual positions from the native bidi engine.
      const tokens = paragraph.match(/[\p{Script=Arabic}\p{Mark}]+|[\p{Letter}\p{Mark}]+|[0-9٠-٩]+(?:[.,:/-][0-9٠-٩]+)*|\s+|[^\s]/gu) ?? [' '];
      for (const token of tokens) {
        const span = document.createElement('span');
        span.textContent = token;
        if (!/^\s+$/.test(token)) span.style.whiteSpace = 'nowrap';
        measure.appendChild(span);
      }
      const positioned = [...measure.children].map((span) => ({ text: span.textContent ?? '', rect: span.getBoundingClientRect() })).filter((item) => item.rect.width > 0);
      positioned.sort((a, b) => Math.abs(a.rect.top - b.rect.top) > 2 ? a.rect.top - b.rect.top : a.rect.left - b.rect.left);
      let top: number | undefined;
      for (const item of positioned) {
        if (top === undefined || Math.abs(top - item.rect.top) > 2) { result.push([]); top = item.rect.top; }
        result[result.length - 1].push(item.text);
      }
      if (!positioned.length) result.push([' ']);
    }
    return result;
  };

  const transform = (value: unknown, width: number, inherited: PdfNode): unknown => {
    if (Array.isArray(value)) return value.map((node) => transform(node, width, inherited));
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string' && ARABIC.test(value)) return transform({ text: value }, width, inherited);
      return value;
    }
    const node = { ...value as PdfNode };
    const names = typeof node.style === 'string' ? [node.style] : Array.isArray(node.style) ? node.style as string[] : [];
    const style = { ...inherited, ...Object.assign({}, ...names.map((name) => styles[name] ?? {})), ...node };
    const size = typeof style.fontSize === 'number' ? style.fontSize : 9;
    const margin = Array.isArray(style.margin) ? style.margin as number[] : [];
    const innerWidth = Math.max(20, (typeof node.width === 'number' ? node.width : width) - (margin[0] ?? 0) - (margin.length === 2 ? margin[0] : margin[2] ?? 0));
    if (typeof node.text === 'string' && ARABIC.test(node.text)) {
      const text = node.text;
      delete node.text;
      node.stack = lines(text, innerWidth, size, Boolean(style.bold)).map((parts) => ({
        text: parts.map((part) => ({ text: part, preserveLeadingSpaces: true, preserveTrailingSpaces: true })),
        noWrap: true,
        fontFeatures: [],
        alignment: 'right',
        ...(node.link ? { link: node.link } : {}),
      }));
      return node;
    }
    if (typeof node.svg === 'string' && ARABIC.test(node.svg)) {
      const xml = new DOMParser().parseFromString(node.svg, 'image/svg+xml');
      xml.querySelectorAll('text').forEach((element) => {
        const content = element.textContent ?? '';
        if (ARABIC.test(content)) element.textContent = lines(content, 10000, Number(element.getAttribute('font-size')) || 10, element.getAttribute('font-weight') === 'bold')[0]?.join('') ?? content;
      });
      node.svg = new XMLSerializer().serializeToString(xml.documentElement);
    }
    if (Array.isArray(node.columns)) {
      const columns = node.columns as PdfNode[];
      const gap = typeof node.columnGap === 'number' ? node.columnGap : 0;
      const fixed = columns.reduce((sum, column) => sum + (typeof column.width === 'number' ? column.width : 0), 0);
      const flexible = columns.filter((column) => typeof column.width !== 'number').length;
      const flexibleWidth = Math.max(20, (innerWidth - fixed - gap * Math.max(0, columns.length - 1)) / Math.max(1, flexible));
      node.columns = columns.map((column) => transform(column, typeof column.width === 'number' ? column.width : flexibleWidth, style));
    }
    if (node.table && typeof node.table === 'object') {
      const table = node.table as PdfNode;
      const body = table.body as unknown[][];
      const count = Math.max(1, body?.[0]?.length ?? 1);
      node.table = { ...table, body: body.map((row) => row.map((cell) => {
        const span = cell && typeof cell === 'object' && typeof (cell as PdfNode).colSpan === 'number' ? Number((cell as PdfNode).colSpan) : 1;
        return transform(cell, innerWidth / count * Math.max(1, Math.min(count, span)) - 12, style);
      })) };
    }
    for (const key of ['stack', 'ul', 'ol', 'content']) if (Array.isArray(node[key])) node[key] = transform(node[key], innerWidth, style);
    return node;
  };
  try {
    const result: PdfNode = { ...definition, content: transform(definition.content, 523, defaults) };
    for (const key of ['header', 'footer']) {
      const callback = definition[key];
      if (typeof callback === 'function') result[key] = (...args: unknown[]) => {
        document.body.appendChild(measure);
        try { return transform(callback(...args), 595, defaults); }
        finally { measure.remove(); }
      };
    }
    return result;
  } finally { measure.remove(); }
}
