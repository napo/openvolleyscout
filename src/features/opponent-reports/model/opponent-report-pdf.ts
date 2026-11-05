/**
 * Opponent report PDF (A4, pdfmake): cover, then the enabled sheets in their
 * order. Same wording and colours as the screen (report-view).
 */
import type { OpponentReport, OpponentReportSheetId } from '@src/domain/opponent-report/types';
import { create as createQrCode } from 'qrcode';
import { saveFile } from '@src/lib/utils/save-file';
import {
  COLOR_BORDER,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_SOFT_BG,
  COLOR_TEXT,
  buildPdfLogo,
  loadPdfMakeApi,
  preparePdfFont,
} from '@src/features/scouting/model/pdf-branding';
import { resolveBoardPieces, type ResolvedBoardPiece } from './board-pieces';
import type { ReportView, ViewCell, ViewT, ViewTable } from './report-view';
import type { TrafficBand } from './traffic-light';
const MAX_QR_URL_BYTES = 2900;

const BAND_FILL: Record<Exclude<TrafficBand, 'none'>, string> = {
  green: '#dcfce7',
  yellow: '#fef9c3',
  red: '#fee2e2',
};

export interface OpponentReportPdfInput {
  report: OpponentReport;
  view: ReportView;
  /** One line per included match: date · vs team · competition · result. */
  matchLines: string[];
  sampleLine: string;
  generatedOn: string;
}

const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => COLOR_BORDER,
  vLineColor: () => COLOR_BORDER,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 2.5,
  paddingBottom: () => 2.5,
};

function cell(value: ViewCell): Record<string, unknown> {
  return {
    text: value.text,
    style: 'td',
    ...(value.band && value.band !== 'none' ? { fillColor: BAND_FILL[value.band] } : {}),
    ...(value.few ? { color: COLOR_MUTED, italics: true } : {}),
  };
}

function table(view: ViewTable): Record<string, unknown> {
  return {
    table: {
      headerRows: 1,
      widths: view.columns.map((_, index) => (index === 0 ? '*' : 'auto')),
      body: [
        view.columns.map((column) => ({ text: column, style: 'th' })),
        ...view.rows.map((row) => row.map(cell)),
      ],
    },
    layout: tableLayout,
    margin: [0, 2, 0, 8],
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

const heading = (text: string) => ({ text, style: 'sectionHeading', margin: [0, 6, 0, 4] });
const subheading = (text: string) => ({ text, style: 'subheading', margin: [0, 4, 0, 2] });

function bullets(title: string, items: string[], empty: string, color: string): Record<string, unknown> {
  return {
    stack: [
      { text: title, bold: true, color, margin: [0, 0, 0, 2] },
      items.length > 0 ? { ul: items, fontSize: 9 } : { text: empty, color: COLOR_MUTED, italics: true },
    ],
  };
}

function notes(title: string, text: string): Record<string, unknown>[] {
  return text.trim() ? [subheading(title), { text, fontSize: 9, margin: [0, 0, 0, 6] }] : [];
}

export function buildQrSvg(url: string): string | null {
  if (new TextEncoder().encode(url).length > MAX_QR_URL_BYTES) return null;
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

function pieceContent(piece: ResolvedBoardPiece, t: ViewT): Record<string, unknown>[] {
  switch (piece.kind) {
    case 'ordered-list':
      return [
        subheading(piece.title),
        piece.items && piece.items.length > 0
          ? { ol: piece.items.map((text) => ({ text, fontSize: 12, margin: [0, 4, 0, 6] })), margin: [0, 4, 0, 6] }
          : { text: t('opponentReportKeysNoProposals'), color: COLOR_MUTED, italics: true },
        ...notes(t('opponentReportSheetNotes'), piece.note),
      ];
    case 'table':
      return [
        subheading(piece.title),
        ...(piece.subtitle ? [{ text: piece.subtitle, style: 'legend', margin: [0, 0, 0, 4] }] : []),
        ...(piece.table ? [table(piece.table)] : []),
        ...notes(t('opponentReportSheetNotes'), piece.note),
      ];
    case 'dual-bullets':
      return [
        subheading(piece.title),
        ...(piece.subtitle ? [{ text: piece.subtitle, bold: true, margin: [0, 0, 0, 6] }] : []),
        {
          columns: [
            bullets(piece.itemsTitle ?? '', piece.items ?? [], t('opponentReportNothingNotable'), '#166534'),
            bullets(piece.secondaryItemsTitle ?? '', piece.secondaryItems ?? [], t('opponentReportNothingNotable'), '#991b1b'),
          ],
          columnGap: 16,
          margin: [0, 2, 0, 8],
        },
        ...notes(t('opponentReportSheetNotes'), piece.note),
      ];
    case 'court-grid': {
      const courts = piece.courts ?? [];
      return [
        ...(courts.length > 0 ? [{
          unbreakable: true,
          stack: [
            subheading(piece.title),
            ...(piece.subtitle ? [{ text: piece.subtitle, style: 'legend', margin: [0, 0, 0, 4] }] : []),
            ...chunk(courts, 3).map((row) => ({
              columns: [0, 1, 2].map((index) => (row[index]
                ? {
                  stack: [
                    { svg: row[index].svg, width: 155 },
                    ...(row[index].sample ? [{ text: row[index].sample, fontSize: 6, color: COLOR_MUTED, alignment: 'center' }] : []),
                  ],
                  width: '*',
                }
                : { text: '', width: '*' })),
              columnGap: 6,
              margin: [0, 0, 0, 6],
            })),
          ],
        }] : []),
        ...notes(t('opponentReportSheetNotes'), piece.note),
      ];
    }
    case 'court-with-bullets':
      return [
        {
          unbreakable: true,
          stack: [
            subheading(piece.title),
            ...(piece.court ? [{
              columns: [
                { svg: piece.court.svg, width: 180 },
                piece.items && piece.items.length > 0
                  ? { ul: piece.items, fontSize: 9, margin: [8, 10, 0, 0] }
                  : { text: t('opponentReportNothingNotable'), color: COLOR_MUTED, italics: true },
              ],
              columnGap: 12,
            }] : [
              piece.items && piece.items.length > 0
                ? { ul: piece.items, fontSize: 9, margin: [0, 4, 0, 6] }
                : { text: t('opponentReportNothingNotable'), color: COLOR_MUTED, italics: true },
            ]),
          ],
        },
        ...notes(t('opponentReportSheetNotes'), piece.note),
      ];
    case 'player-card': {
      const qr = piece.videoLink ? buildQrSvg(piece.videoLink.url) : null;
      const courtWidth = piece.sheetId === 'serve' ? 165 : 185;
      return [
        {
          unbreakable: true,
          margin: [0, 0, 0, 10],
          stack: [
            subheading(piece.title),
            {
              columns: [
                ...(piece.court ? [{
                  stack: [
                    { svg: piece.court.svg, width: courtWidth },
                    ...(piece.court.sample ? [{ text: piece.court.sample, style: 'legend', margin: [0, 2, 0, 0] }] : []),
                  ],
                  width: courtWidth,
                }] : []),
                ...(piece.table ? [{
                  stack: [
                    ...(piece.tableTitle ? [subheading(piece.tableTitle)] : []),
                    table(piece.table),
                  ],
                  width: '*',
                }] : []),
              ],
              columnGap: 10,
              margin: [0, 0, 0, 4],
            },
            ...(piece.videoLink ? [{
              columns: [
                {
                  stack: [
                    subheading(t('opponentReportVideoLink', {
                      date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(piece.videoLink.expiresAt),
                    })),
                    { text: piece.videoLink.url, link: piece.videoLink.url, color: COLOR_PRIMARY, fontSize: 6, decoration: 'underline' },
                    ...(qr ? [] : [{ text: t('opponentReportVideoQrUnavailable'), color: COLOR_MUTED, fontSize: 7 }]),
                  ],
                  width: '*',
                },
                ...(qr ? [{ svg: qr, width: 88 }] : []),
              ],
              columnGap: 12,
              margin: [0, 4, 0, 6],
            }] : []),
            ...notes(t('opponentReportPlayerNotes'), piece.note),
          ],
        },
      ];
    }
    case 'extra-sheet':
      return [
        {
          unbreakable: true,
          margin: [0, 0, 0, 12],
          stack: [
            subheading(piece.title),
            ...(piece.court ? [{
              svg: piece.court.svg,
              width: piece.drawing?.court === 'full' && piece.drawing?.orientation === 'horizontal' ? 380 : 250,
              margin: [0, 4, 0, 4],
            }] : []),
            ...notes(t('opponentReportBoardSheetNote'), piece.note),
          ],
        },
      ];
  }
}

export function buildOpponentReportPdfDocDefinition(input: OpponentReportPdfInput, t: ViewT): Record<string, unknown> {
  const { report, view } = input;
  const cover = [
    { columns: [buildPdfLogo(60, 60), { text: 'OpenVolleyScout', color: COLOR_MUTED, alignment: 'right', fontSize: 9 }] },
    { text: report.title, style: 'title', margin: [0, 60, 0, 8] },
    { text: t('opponentReportPdfOpponent', { team: report.opponent.name }), fontSize: 14, margin: [0, 0, 0, 4] },
    ...(report.ownTeam ? [{ text: t('opponentReportPdfOwnTeam', { team: report.ownTeam.name }), fontSize: 11, color: COLOR_MUTED }] : []),
    { text: t('opponentReportPdfGenerated', { date: input.generatedOn }), color: COLOR_MUTED, margin: [0, 4, 0, 24] },
    heading(t('opponentReportPdfMatches')),
    { ul: input.matchLines, fontSize: 9 },
    { text: input.sampleLine, margin: [0, 8, 0, 0], color: COLOR_TEXT },
  ];

  const pieces = resolveBoardPieces(report, view, t);
  const legend = { text: t('opponentReportLegend', { n: view.minSample }), style: 'legend', margin: [0, 0, 0, 4] };
  const bodyBlocks: Record<string, unknown>[] = [];
  let lastSheetId: OpponentReportSheetId | null = null;
  for (const piece of pieces) {
    if (piece.sheetId !== lastSheetId) {
      lastSheetId = piece.sheetId;
      bodyBlocks.push(
        { text: '', pageBreak: 'before' },
        heading(t(`opponentReportSheet_${piece.sheetId}`)),
      );
      if (piece.sheetId !== 'keys' && piece.sheetId !== 'board') {
        bodyBlocks.push(legend);
      }
      if (piece.sheetId === 'setter') {
        bodyBlocks.push({ text: view.setter.legend, style: 'legend', margin: [0, 0, 0, 4] });
      }
    }
    bodyBlocks.push(...pieceContent(piece, t));
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [36, 36, 36, 44],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `${report.title} · ${report.opponent.name}`, style: 'footer' },
        { text: `${currentPage} / ${pageCount}`, style: 'footer', alignment: 'right' },
      ],
      margin: [36, 12, 36, 0],
    }),
    styles: {
      title: { fontSize: 24, bold: true, color: COLOR_PRIMARY },
      sectionHeading: { fontSize: 15, bold: true, color: COLOR_PRIMARY },
      subheading: { fontSize: 10.5, bold: true, color: COLOR_PRIMARY },
      th: { fontSize: 8, bold: true, color: COLOR_PRIMARY, fillColor: COLOR_SOFT_BG },
      td: { fontSize: 8.5, color: COLOR_TEXT },
      legend: { fontSize: 7.5, color: COLOR_MUTED, italics: true },
      footer: { fontSize: 7, color: COLOR_MUTED },
    },
    content: [...cover, ...bodyBlocks],
  };
}

export function opponentReportFileName(report: OpponentReport, date: string): string {
  const slug = (report.title || report.opponent.name || 'report')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'report';
  return `${slug}-${date}.pdf`;
}

export async function exportOpponentReportPdf(input: OpponentReportPdfInput, t: ViewT, fileName: string): Promise<void> {
  const draft = buildOpponentReportPdfDocDefinition(input, t);
  // Names and translated labels decide whether a CJK font is needed.
  const font = await preparePdfFont(JSON.stringify(draft.content));
  const pdfMake = await loadPdfMakeApi();
  // Rebuilt after the font is loaded, so the logo is in place too.
  const docDefinition = { ...buildOpponentReportPdfDocDefinition(input, t), defaultStyle: { font, fontSize: 9 } };
  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  await saveFile(fileName, blob, 'application/pdf');
}
