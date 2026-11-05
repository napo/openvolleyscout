/**
 * Opponent report PDF (A4, pdfmake): cover, then the enabled sheets in their
 * order. Same wording and colours as the screen (report-view).
 */
import type { OpponentReport, OpponentReportSheetId } from '@src/domain/opponent-report/types';
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
import { buildServeTargetCourtSvg, type ReportView, type ViewCell, type ViewT, type ViewTable } from './report-view';
import type { TrafficBand } from './traffic-light';

/** Sheets this phase can print. */
const PRINTABLE: ReadonlySet<OpponentReportSheetId> = new Set(['keys', 'overview', 'reception']);

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

function sheetContent(id: OpponentReportSheetId, input: OpponentReportPdfInput, t: ViewT): Record<string, unknown>[] {
  const { view } = input;
  const legend = { text: t('opponentReportLegend', { n: view.minSample }), style: 'legend', margin: [0, 0, 0, 4] };
  switch (id) {
    case 'keys':
      return [
        heading(t('opponentReportSheet_keys')),
        view.keys.length > 0
          ? { ol: view.keys.map((key) => ({ text: key.text, fontSize: 13, margin: [0, 4, 0, 6] })), margin: [0, 6, 0, 0] }
          : { text: t('opponentReportKeysNoProposals'), color: COLOR_MUTED, italics: true },
      ];
    case 'overview':
      return [
        heading(t('opponentReportSheet_overview')),
        legend,
        subheading(t('opponentReportRotations')),
        table(view.overview.rotations),
        {
          columns: [
            bullets(t('opponentReportStrengths'), view.overview.strengths, t('opponentReportNothingNotable'), '#166534'),
            bullets(t('opponentReportWeaknesses'), view.overview.weaknesses, t('opponentReportNothingNotable'), '#991b1b'),
          ],
          columnGap: 16,
          margin: [0, 2, 0, 8],
        },
        subheading(t('opponentReportErrors')),
        table(view.overview.errors),
        ...notes(t('opponentReportNotes'), view.overview.notes),
      ];
    case 'reception':
      return [
        heading(t('opponentReportSheet_reception')),
        legend,
        { text: view.reception.summary, bold: true, margin: [0, 0, 0, 6] },
        {
          columns: [
            bullets(t('opponentReportDoesWell'), view.reception.good, t('opponentReportNothingNotable'), '#166534'),
            bullets(t('opponentReportDoesBadly'), view.reception.bad, t('opponentReportNothingNotable'), '#991b1b'),
          ],
          columnGap: 16,
          margin: [0, 0, 0, 8],
        },
        subheading(t('opponentReportReceivers')),
        table(view.reception.receivers),
        subheading(t('opponentReportFirstBall')),
        table(view.reception.firstBall),
        subheading(t('opponentReportPositiveReception')),
        table(view.reception.positiveReception),
        {
          unbreakable: true,
          stack: [subheading(t('opponentReportServeTargets')), {
          columns: [
            { svg: buildServeTargetCourtSvg(view.reception.targets, t('opponentReportNet')), width: 180 },
            view.reception.serveTargets.length > 0
              ? { ul: view.reception.serveTargets, fontSize: 9, margin: [8, 10, 0, 0] }
              : { text: t('opponentReportNothingNotable'), color: COLOR_MUTED, italics: true },
          ],
          columnGap: 12,
        }],
        },
        ...notes(t('opponentReportSheetNotes'), view.reception.notes),
      ];
    default:
      return [];
  }
}

export function buildOpponentReportPdfDocDefinition(input: OpponentReportPdfInput, t: ViewT): Record<string, unknown> {
  const { report } = input;
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

  const sheets = report.sheets
    .filter((sheet) => sheet.enabled && PRINTABLE.has(sheet.id))
    .map((sheet) => [{ text: '', pageBreak: 'before' }, ...sheetContent(sheet.id, input, t)]);

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
    content: [...cover, ...sheets.flat()],
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
