import ubuntuRegularUrl from '../../../assets/fonts/ubuntu/Ubuntu-Regular.ttf?url';
import ubuntuBoldUrl from '../../../assets/fonts/ubuntu/Ubuntu-Bold.ttf?url';
import ubuntuItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-Italic.ttf?url';
import ubuntuBoldItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-BoldItalic.ttf?url';
import openVolleyScoutLogoUrl from '@src/assets/openvolleyscout.png?url';
import type { TranslationKey } from '@src/i18n';
import { saveFile } from '@src/lib/utils/save-file';
import {
  buildMatchTabellinoReport,
  type AttackTransitionBlock,
  type BuildMatchReportDocumentInput,
  type MatchReportBottomSummaryBlock,
  type MatchReportEntryMarker,
  type MatchReportPlayerRow,
  type MatchTabellinoReport,
  type TabellinoSetSummaryRow,
  type TabellinoTeamTable,
} from './match-report';
import {
  ROTATION_DISPLAY_ORDER,
  type CrossRotationAggregate,
  type CrossRotationMatrix,
  type CrossRotationStats,
} from './match-stats';

type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string;
type CrossRotationView = 'breakPoint' | 'sideOut';

// ---------------------------------------------------------------------------
// Color palette — matches the on-screen table and the legacy HTML print path
// (see the `htmlStyle` block in match-report.ts) so the PDF stays visually
// consistent with the rest of the app despite using a different renderer.
// ---------------------------------------------------------------------------
const COLOR_PRIMARY = '#002554';
const COLOR_ACCENT = '#0169D8';
const COLOR_SOFT_BG = '#eef5ff';
const COLOR_BORDER = '#7f93b4';
const COLOR_TEXT = '#111827';
const COLOR_TOTALS_BG = '#dfe8f7';
const COLOR_STARTER_BG = '#444444';
const COLOR_MUTED = '#6b7280';

function formatPercent(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : `${Math.round(value * 100)}%`;
}

function formatAvgExchanges(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : value.toFixed(1);
}

// ---------------------------------------------------------------------------
// Font / logo registration — lazy + memoized, mirrors the "lazy import to
// avoid bundling if unused" pattern already used for jspdf/html2canvas-pro.
// ---------------------------------------------------------------------------
let pdfAssetsReady: Promise<void> | null = null;

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

type PdfMakeApi = {
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
async function loadPdfMakeApi(): Promise<PdfMakeApi> {
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

async function ensurePdfAssetsReady(): Promise<void> {
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

// ---------------------------------------------------------------------------
// Table layout — reduced padding so narrow numeric columns stay legible at a
// small font size; this (not font size) is the primary lever for fitting the
// ~23-column tabellino into a portrait A4 page.
// ---------------------------------------------------------------------------
const compactLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => COLOR_BORDER,
  vLineColor: () => COLOR_BORDER,
  paddingLeft: () => 1.5,
  paddingRight: () => 1.5,
  paddingTop: () => 1,
  paddingBottom: () => 1,
};

// ---------------------------------------------------------------------------
// Entry-marker cells (starter / setter / captain / entry / libero)
//
// pdfmake table cells are plain rectangles — there's no border-radius, so a
// fillColor/border set directly on a TableCell always covers the cell's full
// width/height with no inset. To get a visibly smaller marker that leaves a
// gap to the surrounding grid lines, nest a single-cell table (whose own
// fillColor/border only cover *its* small footprint) inside the outer cell,
// and use the outer `margin` to push it inward from the outer cell's edges.
// ---------------------------------------------------------------------------
function insetBox(
  innerCell: Record<string, unknown>,
  options: { outerFillColor?: string; borderColor?: string; marginX?: number; marginY?: number } = {},
): Record<string, unknown> {
  const { outerFillColor, borderColor, marginX = 2.5, marginY = 1.5 } = options;

  return {
    ...(outerFillColor ? { fillColor: outerFillColor } : {}),
    table: { body: [[innerCell]], widths: ['*'] },
    layout: {
      hLineWidth: () => (borderColor ? 0.75 : 0),
      vLineWidth: () => (borderColor ? 0.75 : 0),
      hLineColor: () => borderColor ?? '#000000',
      vLineColor: () => borderColor ?? '#000000',
      paddingLeft: () => 1, paddingRight: () => 1, paddingTop: () => 0.5, paddingBottom: () => 0.5,
    },
    margin: [marginX, marginY, marginX, marginY],
  };
}

function resolveEntryMarker(row: MatchReportPlayerRow, setNumber: number): MatchReportEntryMarker | undefined {
  const markers = row.entryMarkers.filter((marker) => marker.setNumber === setNumber);
  if (markers.length === 0) return undefined;
  const priority: Record<MatchReportEntryMarker['kind'], number> = { starter: 0, entry: 1, libero: 2 };
  return [...markers].sort((a, b) => priority[a.kind] - priority[b.kind])[0];
}

function markerCell(marker: MatchReportEntryMarker | undefined): Record<string, unknown> {
  if (!marker) {
    return { text: '', alignment: 'center', fontSize: 6.5 };
  }

  if (marker.kind === 'starter') {
    if (marker.isCaptain) {
      return insetBox(
        { text: marker.label, alignment: 'center', fontSize: 6.2, bold: true, fillColor: '#ffffff', color: COLOR_TEXT, border: [true, true, true, true] },
        { borderColor: COLOR_TEXT },
      );
    }
    if (marker.isSetter) {
      return insetBox(
        { text: marker.label, alignment: 'center', fontSize: 6.2, bold: true, fillColor: COLOR_SOFT_BG, color: COLOR_PRIMARY, border: [true, true, true, true] },
        { borderColor: COLOR_ACCENT },
      );
    }
    return insetBox(
      { text: marker.label, alignment: 'center', fontSize: 6.2, bold: true, fillColor: COLOR_STARTER_BG, color: '#ffffff', border: [false, false, false, false] },
    );
  }

  // entry / libero: on screen this is a small unlabeled box; a drawn box doesn't
  // translate well to the PDF cell grid, so use a plain long dash instead.
  return { text: '—', alignment: 'center', fontSize: 6.5, color: COLOR_MUTED };
}

// ---------------------------------------------------------------------------
// Header block
// ---------------------------------------------------------------------------
function buildHeaderContent(report: MatchTabellinoReport, t: TFunction): Record<string, unknown> {
  const setSummaryTable = {
    table: {
      headerRows: 1,
      widths: ['auto', 'auto', 'auto', '*'],
      body: [
        [
          { text: t('sets'), style: 'th' },
          { text: t('setScore'), style: 'th' },
          { text: t('duration'), style: 'th' },
          { text: t('setPartials'), style: 'th' },
        ],
        ...report.setSummaries.map((set) => [
          { text: t('setLabel', { setNumber: set.setNumber }), style: 'tdLabel' },
          { text: set.scoreLabel, style: 'td' },
          { text: set.durationLabel ?? '-', style: 'td' },
          { text: set.partialScoreLabel, style: 'td' },
        ]),
      ],
    },
    layout: compactLayout,
  };

  return {
    stack: [
      { text: report.printTitle, style: 'pageTitle' },
      {
        columns: [
          {
            width: '*',
            stack: [
              {
                columns: [
                  { width: 'auto', text: [{ text: `${t('matchNumberShort')}: `, bold: true }, report.competition] },
                  { width: 'auto', text: [{ text: `  ${t('matchDate')}: `, bold: true }, report.dateLabel], margin: [8, 0, 0, 0] },
                  { width: 'auto', text: [{ text: `  ${t('venue')}: `, bold: true }, report.venue], margin: [8, 0, 0, 0] },
                ],
                style: 'metaLine',
              },
              { text: t('matchReportLegend'), style: 'caption', margin: [0, 2, 0, 4] },
            ],
          },
          {
            width: 140,
            stack: [
              { text: `${report.homeTeamName}  ${report.homeSetsWon} : ${report.awaySetsWon}  ${report.awayTeamName}`, style: 'scoreBox' },
            ],
          },
        ],
      },
      setSummaryTable,
    ],
    margin: [0, 0, 0, 8],
  };
}

// ---------------------------------------------------------------------------
// Main tabellino table (player rows + totals + inline per-set rows)
// ---------------------------------------------------------------------------
const METRIC_WIDTHS = {
  puntiTot: 15, puntiBp: 15, puntiVp: 22,
  battutaTot: 15, battutaErr: 15, battutaPt: 15,
  ricezioneTot: 15, ricezioneErr: 15, ricezionePos: 18, ricezionePrf: 18,
  attaccoTot: 15, attaccoErr: 15, attaccoMur: 15, attaccoPt: 15, attaccoPtPerc: 18,
  muroPt: 15,
};

function tabellinoColumnWidths(setHeaderCount: number): Array<number | string> {
  return [
    16, '*',
    ...Array(setHeaderCount).fill(14),
    METRIC_WIDTHS.puntiTot, METRIC_WIDTHS.puntiBp, METRIC_WIDTHS.puntiVp,
    METRIC_WIDTHS.battutaTot, METRIC_WIDTHS.battutaErr, METRIC_WIDTHS.battutaPt,
    METRIC_WIDTHS.ricezioneTot, METRIC_WIDTHS.ricezioneErr, METRIC_WIDTHS.ricezionePos, METRIC_WIDTHS.ricezionePrf,
    METRIC_WIDTHS.attaccoTot, METRIC_WIDTHS.attaccoErr, METRIC_WIDTHS.attaccoMur, METRIC_WIDTHS.attaccoPt, METRIC_WIDTHS.attaccoPtPerc,
    METRIC_WIDTHS.muroPt,
  ];
}

function placeholders(count: number): Record<string, never>[] {
  return Array.from({ length: Math.max(0, count) }, () => ({}));
}

// On screen, the set number for the set a team started serving gets a circular
// ring around the digit (border-radius isn't available on a pdfmake table
// cell, and drawing a true circle would need absolute page coordinates that
// aren't knowable for a cell inside a dynamically laid-out table) — a bordered
// box with generous inner margin is the closest reliable equivalent.
function setNumberHeaderCell(header: TabellinoTeamTable['setHeaders'][number]): Record<string, unknown> {
  if (!header.startedServing) {
    return { text: header.label, style: 'thSub' };
  }

  return insetBox(
    { text: header.label, alignment: 'center', fontSize: 5.8, bold: true, color: COLOR_PRIMARY, border: [true, true, true, true] },
    { outerFillColor: COLOR_SOFT_BG, borderColor: COLOR_PRIMARY, marginX: 3, marginY: 1 },
  );
}

function tabellinoHeaderRows(tabellino: TabellinoTeamTable, t: TFunction): unknown[][] {
  const setCount = tabellino.setHeaders.length;

  const groupRow = [
    { text: '#', rowSpan: 2, style: 'th' },
    { text: t('player'), rowSpan: 2, style: 'th', alignment: 'left' },
    { text: t('setShort'), colSpan: setCount, style: 'thGroup' }, ...placeholders(setCount - 1),
    { text: t('points'), colSpan: 3, style: 'thGroup' }, ...placeholders(2),
    { text: t('serve'), colSpan: 3, style: 'thGroup' }, ...placeholders(2),
    { text: t('reception'), colSpan: 4, style: 'thGroup' }, ...placeholders(3),
    { text: t('attack'), colSpan: 5, style: 'thGroup' }, ...placeholders(4),
    { text: t('block'), style: 'thGroup' },
  ];

  const subRow = [
    { text: '' }, { text: '' },
    ...tabellino.setHeaders.map((h) => setNumberHeaderCell(h)),
    { text: t('totalShort'), style: 'thSub' }, { text: t('bpShort'), style: 'thSub' }, { text: t('vpShort'), style: 'thSub' },
    { text: t('totalShort'), style: 'thSub' }, { text: t('errorsShort'), style: 'thSub' }, { text: t('pointsShort'), style: 'thSub' },
    { text: t('totalShort'), style: 'thSub' }, { text: t('errorsShort'), style: 'thSub' }, { text: t('positivePercentShort'), style: 'thSub' }, { text: t('perfectPercentShort'), style: 'thSub' },
    { text: t('totalShort'), style: 'thSub' }, { text: t('errorsShort'), style: 'thSub' }, { text: t('murShort'), style: 'thSub' }, { text: t('pointsShort'), style: 'thSub' }, { text: t('ptPercentShort'), style: 'thSub' },
    { text: t('pointsShort'), style: 'thSub' },
  ];

  return [groupRow, subRow];
}

function playerMetricRowCells(row: MatchReportPlayerRow, setHeaders: TabellinoTeamTable['setHeaders'], isTotal: boolean): unknown[] {
  const nameRuns: unknown[] = [{ text: row.playerName }];
  if (row.isCaptain) nameRuns.push({ text: ' C', bold: true, color: COLOR_ACCENT });
  if (row.isLibero) nameRuns.push({ text: ' L', italics: true, color: COLOR_MUTED });

  const rowStyle = isTotal ? 'tdTotal' : 'td';
  return [
    { text: isTotal ? '' : String(row.jerseyNumber), style: rowStyle, alignment: 'center' },
    { text: nameRuns, style: rowStyle, alignment: 'left' },
    ...setHeaders.map((h) => {
      const cell = markerCell(resolveEntryMarker(row, h.setNumber));
      return isTotal ? { ...cell, fillColor: COLOR_TOTALS_BG } : cell;
    }),
    { text: String(row.pointsWon), style: rowStyle },
    { text: String(row.breakPointPoints), style: rowStyle },
    { text: row.pointsWonLostLabel, style: rowStyle },
    { text: String(row.serve.total), style: rowStyle },
    { text: String(row.serve.errors), style: rowStyle },
    { text: String(row.serve.aces), style: rowStyle },
    { text: String(row.receive.total), style: rowStyle },
    { text: String(row.receive.errors), style: rowStyle },
    { text: formatPercent(row.receive.positiveRate), style: rowStyle },
    { text: formatPercent(row.receive.perfectRate), style: rowStyle },
    { text: String(row.attack.total), style: rowStyle },
    { text: String(row.attack.errors), style: rowStyle },
    { text: String(row.attack.blocked), style: rowStyle },
    { text: String(row.attack.kills), style: rowStyle },
    { text: formatPercent(row.attack.killRate), style: rowStyle },
    { text: String(row.block.points), style: rowStyle },
  ];
}

function setSummaryInlineRowCells(row: TabellinoSetSummaryRow, setHeaders: TabellinoTeamTable['setHeaders'], t: TFunction): unknown[] {
  return [
    { text: '', style: 'td' },
    {
      text: [
        { text: t('setLabel', { setNumber: row.setNumber }) },
        { text: `  ${row.setScore}-${row.opponentScore}${row.durationLabel ? ` / ${row.durationLabel}` : ''}`, fontSize: 5.6, color: COLOR_MUTED },
      ],
      style: 'tdSetRowLabel',
      alignment: 'left',
    },
    { text: row.partialScoreLabel, style: 'td', colSpan: setHeaders.length, alignment: 'center' },
    ...placeholders(setHeaders.length - 1),
    { text: String(row.pointsWon), style: 'td' },
    { text: String(row.breakPointPoints), style: 'td' },
    { text: row.pointsWonLostLabel, style: 'td' },
    { text: String(row.serve.total), style: 'td' },
    { text: String(row.serve.errors), style: 'td' },
    { text: String(row.serve.aces), style: 'td' },
    { text: String(row.receive.total), style: 'td' },
    { text: String(row.receive.errors), style: 'td' },
    { text: formatPercent(row.receive.positiveRate), style: 'td' },
    { text: formatPercent(row.receive.perfectRate), style: 'td' },
    { text: String(row.attack.total), style: 'td' },
    { text: String(row.attack.errors), style: 'td' },
    { text: String(row.attack.blocked), style: 'td' },
    { text: String(row.attack.kills), style: 'td' },
    { text: formatPercent(row.attack.killRate), style: 'td' },
    { text: String(row.block.points), style: 'td' },
  ];
}

function buildTabellinoMainTable(tabellino: TabellinoTeamTable, t: TFunction): Record<string, unknown> {
  const totalsRow: MatchReportPlayerRow = { ...tabellino.totals, playerName: t('teamTotals'), entryMarkers: [] };

  return {
    table: {
      headerRows: 2,
      dontBreakRows: true,
      widths: tabellinoColumnWidths(tabellino.setHeaders.length),
      body: [
        ...tabellinoHeaderRows(tabellino, t),
        ...tabellino.rows.map((row) => playerMetricRowCells(row, tabellino.setHeaders, false)),
        playerMetricRowCells(totalsRow, tabellino.setHeaders, true),
        ...tabellino.setRows.map((row) => setSummaryInlineRowCells(row, tabellino.setHeaders, t)),
      ],
    },
    layout: compactLayout,
  };
}

// ---------------------------------------------------------------------------
// Per-set detail table (ov1-style Won/Ser/Atk/Blo | Op.Err | Serve | Reception | Attack | Block)
// ---------------------------------------------------------------------------
function buildSetSummaryDetailTable(tabellino: TabellinoTeamTable, t: TFunction): Record<string, unknown> | null {
  if (tabellino.setRows.length === 0) return null;

  const widths = [
    '*',
    15, 15, 15, 15, // Won: Tot/Ser/Atk/Blo
    18, // Op.Err
    15, 15, 15, 18, 18, // Serve: Tot/Err/Ace/Eff%/BP%
    15, 15, 18, 18, 18, // Reception: Tot/Err/Pos%/Eff%/SO%
    15, 15, 15, 18, 18, 18, // Attack: Tot/Err/Blo/Kill/K%/Eff%
    15, // Block
  ];

  const headerRow1 = [
    { text: t('setShort'), rowSpan: 2, style: 'th' },
    { text: t('wonShort'), colSpan: 4, style: 'thGroup' }, {}, {}, {},
    { text: t('opponentErrorsShort'), rowSpan: 2, style: 'thGroup' },
    { text: t('serve'), colSpan: 5, style: 'thGroup' }, {}, {}, {}, {},
    { text: t('reception'), colSpan: 5, style: 'thGroup' }, {}, {}, {}, {},
    { text: t('attack'), colSpan: 6, style: 'thGroup' }, {}, {}, {}, {}, {},
    { text: t('block'), rowSpan: 2, style: 'thGroup' },
  ];
  const headerRow2 = [
    { text: '' },
    { text: t('totalShort'), style: 'thSub' }, { text: t('serShort'), style: 'thSub' }, { text: t('atkShort'), style: 'thSub' }, { text: t('bloShort'), style: 'thSub' },
    { text: '' },
    { text: t('totalShort'), style: 'thSub' }, { text: t('errorsShort'), style: 'thSub' }, { text: t('aces'), style: 'thSub' }, { text: t('efficiencyPercentShort'), style: 'thSub' }, { text: t('breakPointPercentShort'), style: 'thSub' },
    { text: t('totalShort'), style: 'thSub' }, { text: t('errorsShort'), style: 'thSub' }, { text: t('positivePercentShort'), style: 'thSub' }, { text: t('efficiencyPercentShort'), style: 'thSub' }, { text: t('sideOutPercentShort'), style: 'thSub' },
    { text: t('totalShort'), style: 'thSub' }, { text: t('errorsShort'), style: 'thSub' }, { text: t('bloShort'), style: 'thSub' }, { text: t('killShort'), style: 'thSub' }, { text: t('killRateShort'), style: 'thSub' }, { text: t('efficiencyPercentShort'), style: 'thSub' },
    { text: '' },
  ];

  const dataRow = (row: TabellinoSetSummaryRow, isTotal: boolean) => {
    const style = isTotal ? 'tdTotal' : 'td';
    return [
      {
        text: isTotal
          ? t('totalShort')
          : [{ text: t('setLabel', { setNumber: row.setNumber }) }, { text: `  ${row.setScore}-${row.opponentScore}${row.durationLabel ? ` / ${row.durationLabel}` : ''}`, fontSize: 5.6, color: COLOR_MUTED }],
        style, alignment: 'left',
      },
      { text: String(row.directPoints), style }, { text: String(row.ser), style }, { text: String(row.atk), style }, { text: String(row.blo), style },
      { text: String(row.opponentErrors), style },
      { text: String(row.serve.total), style }, { text: String(row.serve.errors), style }, { text: String(row.serve.aces), style }, { text: formatPercent(row.serve.efficiency), style }, { text: isTotal ? '-' : formatPercent(row.breakPointRate), style },
      { text: String(row.receive.total), style }, { text: String(row.receive.errors), style }, { text: formatPercent(row.receive.positiveRate), style }, { text: formatPercent(row.receive.efficiency), style }, { text: isTotal ? '-' : formatPercent(row.sideOutRate), style },
      { text: String(row.attack.total), style }, { text: String(row.attack.errors), style }, { text: String(row.attack.blocked), style }, { text: String(row.attack.kills), style }, { text: formatPercent(row.attack.killRate), style }, { text: formatPercent(row.attack.efficiency), style },
      { text: String(row.block.points), style },
    ];
  };

  return {
    table: {
      headerRows: 2,
      dontBreakRows: true,
      widths,
      body: [
        headerRow1, headerRow2,
        ...tabellino.setRows.map((row) => dataRow(row, false)),
        dataRow(tabellino.setTotals, true),
      ],
    },
    layout: compactLayout,
    margin: [0, 2, 0, 0],
  };
}

function buildTeamSection(tabellino: TabellinoTeamTable, t: TFunction): Record<string, unknown> {
  const sideLabel = tabellino.teamSide === 'home' ? t('homeTeam') : t('awayTeam');
  const detailTable = buildSetSummaryDetailTable(tabellino, t);

  return {
    stack: [
      { text: [{ text: tabellino.teamName, style: 'teamHeading' }, { text: `  (${sideLabel})`, style: 'teamHeadingSub' }] },
      buildTabellinoMainTable(tabellino, t),
      ...(detailTable ? [detailTable] : []),
    ],
    unbreakable: true,
    margin: [0, 8, 0, 0],
  };
}

// ---------------------------------------------------------------------------
// Bottom summary blocks
// ---------------------------------------------------------------------------
function smallTable(widths: Array<number | string>, body: unknown[][], caption?: { title: string; subtitle?: string }): Record<string, unknown> {
  return {
    stack: [
      ...(caption ? [{ text: caption.title, style: 'caption', bold: true }, ...(caption.subtitle ? [{ text: caption.subtitle, style: 'captionHint' }] : [])] : []),
      { table: { headerRows: 1, widths, body }, layout: compactLayout, margin: [0, caption ? 1 : 0, 0, 0] },
    ],
  };
}

function buildEfficiencyRatiosTable(report: MatchTabellinoReport, t: TFunction) {
  const formatRatio = (value: number | null) => (value === null ? '–' : value.toFixed(1));
  return smallTable(
    ['*', 'auto', 'auto'],
    [
      [{ text: t('team'), style: 'th' }, { text: t('receptionsShortLabel'), style: 'th' }, { text: t('servesShortLabel'), style: 'th' }],
      [{ text: report.homeTeamName, style: 'tdLabel' }, { text: formatRatio(report.receptionsPerPointStats.home), style: 'td' }, { text: formatRatio(report.servesPerPointStats.home), style: 'td' }],
      [{ text: report.awayTeamName, style: 'tdLabel' }, { text: formatRatio(report.receptionsPerPointStats.away), style: 'td' }, { text: formatRatio(report.servesPerPointStats.away), style: 'td' }],
    ],
    { title: t('efficiencyIndicesHint') },
  );
}

function buildTransitionTable(title: string, stats: Record<'home' | 'away', AttackTransitionBlock>, report: MatchTabellinoReport, t: TFunction) {
  return smallTable(
    ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
    [
      [
        { text: t('team'), style: 'th' }, { text: t('errorsShort'), style: 'th' }, { text: t('murShort'), style: 'th' },
        { text: t('pointsShort'), style: 'th' }, { text: t('totalShort'), style: 'th' }, { text: t('ptPercentShort'), style: 'th' },
      ],
      [
        { text: report.homeTeamName, style: 'tdLabel' }, { text: String(stats.home.errors), style: 'td' }, { text: String(stats.home.blocked), style: 'td' },
        { text: String(stats.home.points), style: 'td' }, { text: String(stats.home.total), style: 'td' }, { text: formatPercent(stats.home.pointRate), style: 'td' },
      ],
      [
        { text: report.awayTeamName, style: 'tdLabel' }, { text: String(stats.away.errors), style: 'td' }, { text: String(stats.away.blocked), style: 'td' },
        { text: String(stats.away.points), style: 'td' }, { text: String(stats.away.total), style: 'td' }, { text: formatPercent(stats.away.pointRate), style: 'td' },
      ],
    ],
    { title },
  );
}

function getBottomSummaryTitle(block: MatchReportBottomSummaryBlock, t: TFunction): string {
  switch (block.id) {
    case 'side_out_direct': return t('matchReportSideOutDirect');
    case 'counterattack': return t('matchReportCounterattack');
    case 'receive_points': return t('matchReportReceivePoints');
    case 'serve_break_point': return t('matchReportServeBreakPoint');
    case 'fbso': return t('matchReportFbso');
    case 'mtrp': return t('matchReportMtrp');
    case 'ast': return t('matchReportAst');
  }
}

function getBottomSummarySubtitle(block: MatchReportBottomSummaryBlock, t: TFunction): string {
  switch (block.id) {
    case 'side_out_direct': return t('matchReportSideOutDirectHint');
    case 'counterattack': return t('matchReportCounterattackHint');
    case 'receive_points': return t('matchReportReceivePointsHint');
    case 'serve_break_point': return t('matchReportServeBreakPointHint');
    case 'fbso': return t('matchReportFbsoHint');
    case 'mtrp': return t('matchReportMtrpHint');
    case 'ast': return t('matchReportAstHint');
  }
}

function buildBottomSummaryBlockTable(block: MatchReportBottomSummaryBlock, t: TFunction) {
  return smallTable(
    ['*', 'auto', 'auto', 'auto'],
    [
      [{ text: t('team'), style: 'th' }, { text: t('pointsShort'), style: 'th' }, { text: t('attemptsShort'), style: 'th' }, { text: t('efficiencyPercentShort'), style: 'th' }],
      ...block.rows.map((row) => [
        { text: row.teamName, style: 'tdLabel' }, { text: String(row.points), style: 'td' }, { text: String(row.attempts), style: 'td' }, { text: formatPercent(row.percentage), style: 'td' },
      ]),
    ],
    { title: getBottomSummaryTitle(block, t), subtitle: getBottomSummarySubtitle(block, t) },
  );
}

function buildPhaseVolumeTable(report: MatchTabellinoReport, t: TFunction) {
  return smallTable(
    ['*', 'auto', 'auto', 'auto', 'auto'],
    [
      [
        { text: t('team'), style: 'th' }, { text: t('matchReportPhaseVolumeSideOutPoints'), style: 'th' }, { text: t('cpLengthLabel'), style: 'th' },
        { text: t('matchReportPhaseVolumeBreakPointPoints'), style: 'th' }, { text: t('bpLengthLabel'), style: 'th' },
      ],
      ...[report.phaseVolume.home, report.phaseVolume.away].map((row) => [
        { text: row.teamName, style: 'tdLabel' }, { text: String(row.sideOutPoints), style: 'td' }, { text: formatAvgExchanges(row.sideOutAvgExchanges), style: 'td' },
        { text: String(row.breakPointPoints), style: 'td' }, { text: formatAvgExchanges(row.breakPointAvgExchanges), style: 'td' },
      ]),
    ],
    { title: t('matchReportPhaseVolumeTitle'), subtitle: t('matchReportPhaseVolumeHint') },
  );
}

function buildRotationTable(report: MatchTabellinoReport, t: TFunction) {
  const body: unknown[][] = [
    [{ text: t('setShort'), style: 'th' }, { text: t('team'), style: 'th' }, { text: t('pointsShort'), style: 'th' }, { text: t('rotationDiffLabel'), style: 'th' }],
  ];

  report.rotationStats.home.forEach((homeRot, idx) => {
    const awayRot = report.rotationStats.away[idx];
    const homeDiff = homeRot.pointsScored - homeRot.pointsConceded;
    const awayDiff = awayRot.pointsScored - awayRot.pointsConceded;
    body.push([
      { text: `P${homeRot.rotationNumber}`, style: 'tdLabel', rowSpan: 2 },
      { text: report.homeTeamName, style: 'td', alignment: 'left' },
      { text: String(homeRot.pointsScored), style: 'td' },
      { text: `${homeDiff > 0 ? '+' : ''}${homeDiff}`, style: 'td', color: homeDiff > 0 ? '#0a7d2c' : homeDiff < 0 ? '#b3261e' : COLOR_TEXT },
    ]);
    body.push([
      {},
      { text: report.awayTeamName, style: 'td', alignment: 'left' },
      { text: String(awayRot.pointsScored), style: 'td' },
      { text: `${awayDiff > 0 ? '+' : ''}${awayDiff}`, style: 'td', color: awayDiff > 0 ? '#0a7d2c' : awayDiff < 0 ? '#b3261e' : COLOR_TEXT },
    ]);
  });

  return {
    stack: [
      { text: t('rotationPointsLabel'), style: 'caption', bold: true },
      { table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto'], body }, layout: compactLayout, margin: [0, 1, 0, 0] },
    ],
    margin: [0, 6, 0, 0],
  };
}

function pairColumns(a: Record<string, unknown>, b: Record<string, unknown> | null) {
  return {
    columns: [
      { width: '*', ...a },
      b ? { width: '*', ...b } : { width: '*', text: '' },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 6],
    unbreakable: true,
  };
}

function buildBottomSummarySection(report: MatchTabellinoReport, t: TFunction): unknown[] {
  const smallTables = [
    buildEfficiencyRatiosTable(report, t),
    buildTransitionTable(t('attackAfterPositiveReceiveLabel'), report.attackTransitionStats.afterPositiveReceive, report, t),
    buildTransitionTable(t('attackAfterNegativeReceiveLabel'), report.attackTransitionStats.afterNegativeReceive, report, t),
    buildTransitionTable(t('counterattackLabel'), report.attackTransitionStats.counterattack, report, t),
    ...report.bottomSummaryBlocks.map((block) => buildBottomSummaryBlockTable(block, t)),
    buildPhaseVolumeTable(report, t),
  ];

  const paired: unknown[] = [];
  for (let i = 0; i < smallTables.length; i += 2) {
    paired.push(pairColumns(smallTables[i], smallTables[i + 1] ?? null));
  }

  return [
    { text: t('matchReportBottomSummary'), style: 'sectionHeading', margin: [0, 10, 0, 4], pageBreak: 'before' },
    ...paired,
    buildRotationTable(report, t),
  ];
}

// ---------------------------------------------------------------------------
// Cross-rotation analysis (mirrors CrossRotationAnalysisPanel/CrossRotationTable)
// ---------------------------------------------------------------------------
const CROSS_ROTATION_THRESHOLDS: Record<CrossRotationView, { good: number; bad: number }> = {
  sideOut: { good: 0.55, bad: 0.45 },
  breakPoint: { good: 0.4, bad: 0.3 },
};
const CROSS_ROTATION_GREEN = '#16a34a';
const CROSS_ROTATION_RED = '#dc2626';
const CROSS_ROTATION_GREEN_TINT = '#e5f6ea';
const CROSS_ROTATION_RED_TINT = '#fbe6e6';
const CROSS_ROTATION_RECEPTION_BLUE = '#2563eb';

function crossRotationWins(aggregate: CrossRotationAggregate, view: CrossRotationView): number {
  return view === 'breakPoint' ? aggregate.breakPointWins : aggregate.sideOutWins;
}

function crossRotationPercentage(aggregate: CrossRotationAggregate, view: CrossRotationView): number | null {
  return view === 'breakPoint' ? aggregate.breakPointPercentage : aggregate.sideOutPercentage;
}

function crossRotationTone(aggregate: CrossRotationAggregate, view: CrossRotationView): 'green' | 'red' | null {
  if (aggregate.attempts === 0) return null;
  const pct = crossRotationPercentage(aggregate, view);
  if (pct === null) return null;
  const { good, bad } = CROSS_ROTATION_THRESHOLDS[view];
  if (pct >= good) return 'green';
  if (pct <= bad) return 'red';
  return null;
}

function crossRotationCell(aggregate: CrossRotationAggregate, view: CrossRotationView): Record<string, unknown> {
  if (aggregate.attempts === 0) {
    return { text: '–', style: 'td', color: COLOR_MUTED, fontSize: 6.2 };
  }

  const tone = crossRotationTone(aggregate, view);
  const pct = crossRotationPercentage(aggregate, view);
  const subscripts: unknown[] = [];
  if (aggregate.serviceErrorLosses > 0) subscripts.push({ text: `S=${aggregate.serviceErrorLosses} `, color: CROSS_ROTATION_RED });
  if (aggregate.receptionErrorLosses > 0) subscripts.push({ text: `R=${aggregate.receptionErrorLosses}`, color: CROSS_ROTATION_RECEPTION_BLUE });

  return {
    stack: [
      { text: `${crossRotationWins(aggregate, view)}/${aggregate.attempts}`, fontSize: 6.2, bold: true, alignment: 'center', color: COLOR_TEXT },
      { text: pct === null ? '' : `${Math.round(pct * 100)}%`, fontSize: 5.2, alignment: 'center', color: COLOR_MUTED },
      ...(subscripts.length ? [{ text: subscripts, fontSize: 4.4, alignment: 'center' }] : []),
    ],
    fillColor: tone === 'green' ? CROSS_ROTATION_GREEN_TINT : tone === 'red' ? CROSS_ROTATION_RED_TINT : undefined,
  };
}

function buildCrossRotationTable(title: string, matrix: CrossRotationMatrix, view: CrossRotationView, t: TFunction): Record<string, unknown> {
  const order = ROTATION_DISPLAY_ORDER;
  const widths = [18, ...order.map(() => '*'), 26];

  const headerRow = [
    { text: '', style: 'th' },
    ...order.map((rotation) => ({ text: `P${rotation}`, style: 'th' })),
    { text: t('crossRotationTotal'), style: 'th' },
  ];

  const bodyRows = order.map((servingRotation) => [
    { text: `P${servingRotation}`, style: 'thSub' },
    ...order.map((receivingRotation) => crossRotationCell(matrix.cells[servingRotation][receivingRotation], view)),
    crossRotationCell(matrix.rowTotals[servingRotation], view),
  ]);

  const totalRow = [
    { text: t('crossRotationTotal'), style: 'thSub' },
    ...order.map((receivingRotation) => crossRotationCell(matrix.columnTotals[receivingRotation], view)),
    crossRotationCell(matrix.grandTotal, view),
  ];

  return {
    stack: [
      { text: title, style: 'caption', bold: true, margin: [0, 0, 0, 1] },
      { table: { headerRows: 1, widths, body: [headerRow, ...bodyRows, totalRow] }, layout: compactLayout },
    ],
  };
}

function crossRotationLegendItem(color: string, label: string): unknown[] {
  return [{ text: `${label}   `, color, bold: true, fontSize: 5.6 }];
}

function buildCrossRotationLegend(t: TFunction): unknown[] {
  return [
    {
      text: [
        ...crossRotationLegendItem(CROSS_ROTATION_GREEN, t('crossRotationLegendSideOutGood')),
        ...crossRotationLegendItem(CROSS_ROTATION_RED, t('crossRotationLegendSideOutBad')),
        ...crossRotationLegendItem(CROSS_ROTATION_GREEN, t('crossRotationLegendBreakPointGood')),
        ...crossRotationLegendItem(CROSS_ROTATION_RED, t('crossRotationLegendBreakPointBad')),
      ],
      margin: [0, 0, 0, 1],
    },
    {
      text: [
        { text: t('crossRotationLegendServiceError'), color: CROSS_ROTATION_RED, fontSize: 5.6 },
        { text: '   ' },
        { text: t('crossRotationLegendReceptionError'), color: CROSS_ROTATION_RECEPTION_BLUE, fontSize: 5.6 },
      ],
      margin: [0, 0, 0, 4],
    },
  ];
}

function buildCrossRotationSection(report: MatchTabellinoReport, crossRotationStats: CrossRotationStats, t: TFunction): unknown[] {
  const homeMatrix = crossRotationStats.bySide.home;
  const awayMatrix = crossRotationStats.bySide.away;

  const tables = [
    buildCrossRotationTable(t('crossRotationBreakPointTitle', { team: report.homeTeamName }), homeMatrix, 'breakPoint', t),
    buildCrossRotationTable(t('crossRotationSideOutTitle', { team: report.awayTeamName }), homeMatrix, 'sideOut', t),
    buildCrossRotationTable(t('crossRotationBreakPointTitle', { team: report.awayTeamName }), awayMatrix, 'breakPoint', t),
    buildCrossRotationTable(t('crossRotationSideOutTitle', { team: report.homeTeamName }), awayMatrix, 'sideOut', t),
  ];

  return [
    { text: t('crossRotationAnalysis'), style: 'sectionHeading', margin: [0, 10, 0, 4] },
    { text: t('crossRotationAnalysisDescription'), style: 'captionHint', margin: [0, 0, 0, 4] },
    ...buildCrossRotationLegend(t),
    pairColumns(tables[0], tables[1]),
    pairColumns(tables[2], tables[3]),
  ];
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function buildFooter(report: MatchTabellinoReport): unknown {
  const logoColumn = logoBase64
    ? [{ width: 16, image: `data:image/png;base64,${logoBase64}`, fit: [16, 13] }]
    : [];

  return {
    margin: [28, 6, 28, 0],
    columns: [
      ...logoColumn,
      { width: '*', text: report.footer.line, style: 'footerText', margin: [4, 2, 0, 0] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------
export function buildMatchReportPdfDocDefinition(
  report: MatchTabellinoReport,
  t: TFunction,
  extras?: { crossRotationStats?: CrossRotationStats },
): Record<string, unknown> {
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [28, 28, 28, 44],
    defaultStyle: { font: 'Ubuntu', fontSize: 7 },
    footer: () => buildFooter(report),
    styles: {
      pageTitle: { fontSize: 12, bold: true, color: COLOR_PRIMARY },
      sectionHeading: { fontSize: 9, bold: true, color: COLOR_PRIMARY, fillColor: COLOR_SOFT_BG },
      metaLine: { fontSize: 7, color: COLOR_TEXT },
      caption: { fontSize: 6.5, color: COLOR_PRIMARY },
      captionHint: { fontSize: 5.5, color: COLOR_MUTED, italics: true },
      scoreBox: { fontSize: 10, bold: true, color: COLOR_PRIMARY, alignment: 'right' },
      teamHeading: { fontSize: 9, bold: true, color: COLOR_PRIMARY },
      teamHeadingSub: { fontSize: 6.5, color: COLOR_MUTED },
      th: { fontSize: 5.8, bold: true, color: COLOR_PRIMARY, fillColor: COLOR_SOFT_BG, alignment: 'center' },
      thGroup: { fontSize: 5.8, bold: true, color: COLOR_PRIMARY, fillColor: COLOR_SOFT_BG, alignment: 'left' },
      thSub: { fontSize: 5.5, bold: true, color: COLOR_PRIMARY, fillColor: COLOR_SOFT_BG, alignment: 'center' },
      td: { fontSize: 6.6, color: COLOR_TEXT, alignment: 'center' },
      tdLabel: { fontSize: 6.6, color: COLOR_TEXT, alignment: 'left' },
      tdSetRowLabel: { fontSize: 6.6, color: COLOR_TEXT, alignment: 'left', fillColor: '#f8fbff' },
      tdTotal: { fontSize: 6.6, bold: true, color: COLOR_TEXT, fillColor: COLOR_TOTALS_BG, alignment: 'center' },
      footerText: { fontSize: 6, color: COLOR_TEXT },
    },
    content: [
      buildHeaderContent(report, t),
      buildTeamSection(report.homeTabellino, t),
      buildTeamSection(report.awayTabellino, t),
      ...buildBottomSummarySection(report, t),
      ...(extras?.crossRotationStats ? buildCrossRotationSection(report, extras.crossRotationStats, t) : []),
    ],
  };
}

export async function exportMatchReportPdf(input: BuildMatchReportDocumentInput, t: TFunction): Promise<void> {
  const report = buildMatchTabellinoReport(input);

  await ensurePdfAssetsReady();
  const pdfMake = await loadPdfMakeApi();
  const docDefinition = buildMatchReportPdfDocDefinition(report, t, { crossRotationStats: input.stats.crossRotationStats });
  const blob = await pdfMake.createPdf(docDefinition).getBlob();

  await saveFile(report.printFilename, blob, 'application/pdf');
}
