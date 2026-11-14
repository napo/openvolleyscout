/**
 * Opponent report PDF (A4, pdfmake): cover, then the enabled sheets in their
 * order. Same wording and colours as the screen (report-view).
 */
import { BOOKLET_WIDTH, BOOKLET_HEIGHT, imposeBooklet, type ReportBookletPlan } from './report-booklet';
import { APP_METADATA } from '@src/lib/constants/app';
import type { OpponentReport, OpponentReportSheetId } from '@src/domain/opponent-report/types';
import { buildQrSvg } from './qr-svg';

export { buildQrSvg };
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
import { formatViewCell, type ReportView, type ViewCell, type ViewT, type ViewTable } from './report-view';
import { prepareRtlReportPdf } from './rtl-pdf';
import type { TrafficBand } from './traffic-light';
import { videoLinkWatchKey } from './attacker-video-links';

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
  sampleActions?: number;
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
    text: formatViewCell(value),
    style: 'td',
    ...(value.band && value.band !== 'none' ? { fillColor: BAND_FILL[value.band] } : {}),
    ...(value.few ? { color: COLOR_MUTED, italics: true } : {}),
  };
}

function table(view: ViewTable): Record<string, unknown> {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
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

function pieceContent(piece: ResolvedBoardPiece, t: ViewT): Record<string, unknown>[] {
  switch (piece.kind) {
    case 'ordered-list':
      return [
        subheading(piece.title),
        piece.items && piece.items.length > 0
          ? {
            table: {
              headerRows: 1,
              dontBreakRows: true,
              keepWithHeaderRows: 1,
              widths: [42, '*'],
              body: [
                [
                  { text: t('tacticalPriorityColumn'), bold: true, fontSize: 9, color: '#ffffff', fillColor: COLOR_PRIMARY, alignment: 'center' },
                  { text: t('tacticalAdviceColumn'), bold: true, fontSize: 9, color: '#ffffff', fillColor: COLOR_PRIMARY },
                ],
                ...piece.items.map((text, index) => [
                  { text: String(index + 1), bold: true, fontSize: 12, alignment: 'center', color: COLOR_PRIMARY, fillColor: index % 2 === 0 ? COLOR_SOFT_BG : '#ffffff' },
                  { text, fontSize: 10, lineHeight: 1.2, color: COLOR_TEXT, fillColor: index % 2 === 0 ? COLOR_SOFT_BG : '#ffffff' },
                ]),
              ],
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0,
              hLineColor: () => COLOR_BORDER,
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 7,
              paddingBottom: () => 7,
            },
            margin: [0, 4, 0, 10],
          }
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
          table: {
            headerRows: 1,
            dontBreakRows: true,
            keepWithHeaderRows: 1,
            widths: ['*'],
            body: [
              [{ stack: [
                subheading(piece.title),
                ...(piece.subtitle ? [{ text: piece.subtitle, style: 'legend', margin: [0, 0, 0, 4] }] : []),
              ] }],
              ...chunk(courts, 3).map((row) => [{
                columns: [0, 1, 2].map((index) => row[index]
                  ? {
                    stack: [
                      { svg: row[index].svg, width: 155 },
                      ...(row[index].sample ? [{ text: row[index].sample, fontSize: 6, color: COLOR_MUTED, alignment: 'center' }] : []),
                    ],
                    width: '*',
                  }
                  : { text: '', width: '*' }),
                columnGap: 6,
                margin: [0, 0, 0, 6],
              }]),
            ],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
          margin: [0, 2, 0, 8],
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
            ...(piece.subtitle ? [{ text: piece.subtitle, fontSize: 9, margin: [0, 2, 0, 6] }] : []),
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
                    subheading(t(videoLinkWatchKey(piece.videoLink))),
                    { text: t('tacticalVideoCoverage', { available: piece.videoLink.actions ?? piece.videoLink.clips, total: piece.videoLink.totalActions ?? piece.videoLink.clips }), fontSize: 8 },
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
            ],
        },
        ...notes(t('opponentReportPlayerNotes'), piece.note),
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
          ],
        },
        ...notes(t('opponentReportBoardSheetNote'), piece.note),
      ];
  }
}

export function buildOpponentReportPdfDocDefinition(input: OpponentReportPdfInput, t: ViewT): Record<string, unknown> {
  const { report, view } = input;
  const cover = [
    { text: report.title, style: 'title', margin: [0, 0, 0, 6] },
    { text: t('opponentReportPdfOpponent', { team: report.opponent.name }), fontSize: 11, margin: [0, 0, 0, 3] },
    ...(report.ownTeam ? [{ text: t('opponentReportPdfOwnTeam', { team: report.ownTeam.name }), fontSize: 11, color: COLOR_MUTED }] : []),
    { text: t('opponentReportPdfGenerated', { date: input.generatedOn }), fontSize: 8, color: COLOR_MUTED, margin: [0, 2, 0, 6] },
    { text: t('opponentReportPdfMatches'), bold: true, fontSize: 8, margin: [0, 2, 0, 2] },
    { text: input.matchLines.join('\n'), fontSize: 8, color: COLOR_MUTED, margin: [0, 0, 0, 10] },
    ...(input.sampleActions !== undefined && input.sampleActions < view.minSample
      ? [{ text: t('opponentReportLowSampleWarning', { n: view.minSample }), color: COLOR_MUTED, italics: true, margin: [0, 4, 0, 0] }]
      : []),
  ];

  const pieces = resolveBoardPieces(report, view, t);
  const legend = { text: t('opponentReportLegend', { n: view.minSample }), style: 'legend', margin: [0, 0, 0, 4] };
  const bodyBlocks: Record<string, unknown>[] = [];
  let lastSheetId: OpponentReportSheetId | null = null;
  for (const piece of pieces) {
    const intro: Record<string, unknown>[] = [];
    if (piece.sheetId !== lastSheetId) {
      lastSheetId = piece.sheetId;
      intro.push(
        ...(piece.title === t(`opponentReportSheet_${piece.sheetId}`) ? [] : [heading(t(`opponentReportSheet_${piece.sheetId}`))]),
      );
      if (piece.sheetId !== 'keys' && piece.sheetId !== 'board') {
        intro.push(legend);
      }
      if (piece.sheetId === 'setter') {
        intro.push({ text: view.setter.legend, style: 'legend', margin: [0, 0, 0, 4] });
      }
      if (input.sampleActions !== undefined && input.sampleActions < view.minSample) {
        intro.push({
          text: t('opponentReportLowSampleWarning', { n: view.minSample }),
          color: COLOR_MUTED,
          italics: true,
          margin: [0, 0, 0, 4],
        });
      }
    }
    const blocks = pieceContent(piece, t);
    if (intro.length > 0 && blocks[0]?.unbreakable && Array.isArray(blocks[0].stack)) {
      blocks[0] = { ...blocks[0], stack: [...intro, ...blocks[0].stack] };
      bodyBlocks.push(...blocks);
    } else if (intro.length > 0) {
      // A spanning table header keeps section titles with the first row and
      // repeats their context when the table continues on the following page.
      const tableIndex = blocks.findIndex((block) => block.table);
      if (tableIndex >= 0 && blocks.slice(0, tableIndex).every((block) => typeof block.text === 'string')) {
        const block = blocks[tableIndex];
        const data = block.table as { body: Record<string, unknown>[][]; headerRows: number; widths: unknown[] };
        const columns = data.widths.length;
        const contextRow = [{ stack: [...intro, ...blocks.slice(0, tableIndex)], colSpan: columns }, ...Array.from({ length: columns - 1 }, () => ({}))];
        bodyBlocks.push({ ...block, table: { ...data, headerRows: data.headerRows + 1, body: [contextRow, ...data.body] } }, ...blocks.slice(tableIndex + 1));
      } else {
        bodyBlocks.push(...intro, ...blocks);
      }
    } else {
      bodyBlocks.push(...blocks);
    }
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [36, 86, 36, 54],
    header: () => ({
      margin: [36, 14, 36, 8],
      columns: [buildPdfLogo(30, 30), {
        stack: [
          { text: t('tacticalGeneratedHeader'), fontSize: 9, bold: true },
          { text: report.opponent.name, fontSize: 8 },
          { text: input.sampleLine, fontSize: 8 },
          { text: t('tacticalDownloadSoftware'), link: APP_METADATA.urls.releases, fontSize: 8, color: COLOR_PRIMARY },
        ],
      }], columnGap: 8,
    }),
    footer: (currentPage: number, pageCount: number) => ({
      stack: [
        {
          columns: [
            { width: '*', text: t('tacticalCreatedFooter', { date: input.generatedOn, author: APP_METADATA.author.displayName }), style: 'footer' },
            { width: 'auto', text: `${currentPage} / ${pageCount}`, style: 'footer', alignment: 'right' },
          ],
        },
        { text: t('tacticalAttributionFooter'), style: 'footerSmall', margin: [0, 2, 0, 0] },
      ],
      margin: [36, 8, 36, 0],
    }),
    styles: {
      title: { fontSize: 18, bold: true, color: COLOR_PRIMARY },
      sectionHeading: { fontSize: 15, bold: true, color: COLOR_PRIMARY },
      subheading: { fontSize: 10.5, bold: true, color: COLOR_PRIMARY },
      th: { fontSize: 8, bold: true, color: COLOR_PRIMARY, fillColor: COLOR_SOFT_BG },
      td: { fontSize: 8.5, color: COLOR_TEXT },
      legend: { fontSize: 7.5, color: COLOR_MUTED, italics: true },
      footer: { fontSize: 7, color: COLOR_MUTED },
      footerSmall: { fontSize: 6, color: COLOR_MUTED },
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
  const docDefinition = await prepareRtlReportPdf({ ...buildOpponentReportPdfDocDefinition(input, t), defaultStyle: { font, fontSize: 9 } });
  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  await saveFile(fileName, blob, 'application/pdf');
}

/** A5 reading order or A4 imposed faces, both from the same verified logical pages. */
export async function exportReportBooklet(plan: ReportBookletPlan, imposed: boolean, fileName: string): Promise<void> {
  const pages = imposed ? imposeBooklet(plan) : plan.pages;
  const font = await preparePdfFont(pages.join(''));
  const pdfMake = await loadPdfMakeApi();
  const width = imposed ? 841.89 : plan.width ?? BOOKLET_WIDTH;
  const definition = await prepareRtlReportPdf({
    pageSize: { width, height: (imposed ? BOOKLET_HEIGHT : plan.height ?? BOOKLET_HEIGHT) + 0.01 },
    pageMargins: [0, 0, 0, 0],
    defaultStyle: { font, fontSize: 8 },
    content: pages.map((svg, index) => ({ svg, width, ...(index ? { pageBreak: 'before' } : {}) })),
  });
  await saveFile(fileName.replace(/\.pdf$/, imposed ? '-booklet-a4.pdf' : plan.width === 595.276 ? '-a4.pdf' : '-a5.pdf'), await pdfMake.createPdf(definition).getBlob(), 'application/pdf');
}
