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
import { buildServeTargetCourtSvg, type ReportView, type ViewCell, type ViewT, type ViewTable } from './report-view';
import { buildReceptionFormationSvg } from './reception-formation';
import type { TrafficBand } from './traffic-light';

/** Sheets this phase can print. */
const PRINTABLE: ReadonlySet<OpponentReportSheetId> = new Set(['keys', 'overview', 'reception', 'attackers', 'setter']);
const NEWLY_PRINTABLE: ReadonlySet<OpponentReportSheetId> = new Set(['attackers', 'setter']);
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
        ...(view.reception.formations.length > 0 ? [{
          unbreakable: true,
          stack: [
            subheading(t('opponentReportFormations')),
            { text: view.reception.formationSystem, style: 'legend', margin: [0, 0, 0, 4] },
            ...chunk(view.reception.formations, 3).map((row) => ({
              columns: [0, 1, 2].map((index) => (row[index]
                ? { svg: buildReceptionFormationSvg(row[index].formation, { title: row[index].title, net: t('opponentReportNet') }), width: 160 }
                : { text: '', width: 160 })),
              columnGap: 10,
              margin: [0, 0, 0, 6],
            })),
          ],
        }] : []),
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
    case 'attackers':
      return [
        heading(t('opponentReportSheet_attackers')),
        legend,
        ...(view.attackers.length === 0
          ? [{ text: t('opponentReportNothingNotable'), color: COLOR_MUTED, italics: true }]
          : view.attackers.flatMap((attacker, index) => {
            const qr = attacker.videoLink ? buildQrSvg(attacker.videoLink.url) : null;
            return [
              ...(index > 0 ? [{ text: '', pageBreak: 'before' }] : []),
              subheading([attacker.player.jersey ? `#${attacker.player.jersey}` : '', attacker.player.name].filter(Boolean).join(' ')),
              {
                columns: [
                  {
                    stack: [
                      { svg: attacker.courtSvg, width: 185 },
                      { text: attacker.courtSample, style: 'legend', margin: [0, 2, 0, 0] },
                    ],
                    width: 185,
                  },
                  { stack: [subheading(t('opponentReportAttackPerformance')), table(attacker.highlights)], width: '*' },
                ],
                columnGap: 10,
                margin: [0, 0, 0, 4],
              },
              subheading(t('opponentReportAttackDetailedMetrics')),
              subheading(t('opponentReportAttackPerformance')),
              table(attacker.performance),
              subheading(t('opponentReportAttackDistributions')),
              table(attacker.distribution),
              ...(attacker.videoLink ? [{
                columns: [
                  {
                    stack: [
                      subheading(t('opponentReportVideoLink', {
                        date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(attacker.videoLink.expiresAt),
                      })),
                      { text: attacker.videoLink.url, link: attacker.videoLink.url, color: COLOR_PRIMARY, fontSize: 6, decoration: 'underline' },
                      ...(qr ? [] : [{ text: t('opponentReportVideoQrUnavailable'), color: COLOR_MUTED, fontSize: 7 }]),
                    ],
                    width: '*',
                  },
                  ...(qr ? [{ svg: qr, width: 88 }] : []),
                ],
                columnGap: 12,
                margin: [0, 4, 0, 6],
              }] : []),
              ...notes(t('opponentReportPlayerNotes'), attacker.notes),
            ];
          })),
      ];
    case 'setter':
      return [
        heading(t('opponentReportSheet_setter')),
        legend,
        { text: t('opponentReportSetterHelp'), style: 'legend', margin: [0, 0, 0, 4] },
        view.setter.distribution.rows.length > 0
          ? table(view.setter.distribution)
          : { text: t('opponentReportNothingNotable'), color: COLOR_MUTED, italics: true },
        ...notes(t('opponentReportSheetNotes'), view.setter.notes),
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
    .filter((sheet) => PRINTABLE.has(sheet.id) && (sheet.enabled || NEWLY_PRINTABLE.has(sheet.id)))
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
