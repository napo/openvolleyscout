import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const componentPath = join(__dirname, 'MatchReportTable.tsx');
const cssPath = join(__dirname, '..', 'scouting-screen.css');
const matchReportModelPath = join(__dirname, '..', 'model', 'match-report.ts');
const analysisPagePath = join(__dirname, '..', '..', 'analysis', 'pages', 'AnalysisPage.tsx');

function assertNotPresent(source, token) {
  assert(!source.includes(token), `Token should not be present: ${token}`);
}

describe('MatchReportTable tabellino renderer', () => {
  it('renders the match report as two unified team tabellini', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert(source.includes('<ReportHeader report={report} />'));
    assert(source.includes('<TabellinoTeamTable tabellino={report.homeTabellino} />'));
    assert(source.includes('<TabellinoTeamTable tabellino={report.awayTabellino} />'));
    assertNotPresent(source, 'reportMode');
    assertNotPresent(source, 'scouting-stage-panel match-report-table');
  });

  it('keeps totals and set summary rows inside the same team table', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert(source.includes("row={{ ...tabellino.totals, playerName: t('teamTotals'), entryMarkers: [] }}"));
    assert(source.includes('tabellino.setRows.map'));
    assert(source.includes('<SetSummaryRow key={`set-${setRow.setNumber}`} row={setRow} setHeaders={tabellino.setHeaders} />'));
  });

  it('exposes volleyreport ov1-style set, starter, entry, and Won columns without BP or V-P', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert(source.includes('match-report__set-marker--${markerKind}'));
    assert(source.includes('match-report__set-marker--captain'));
    assert(source.includes("marker.kind !== 'starter'"));
    assert(source.includes("t('setShort')"));
    assert(source.includes('tabellino.setHeaders.map'));
    assert(source.includes('SetNumberHeader'));
    assertNotPresent(source, 'match-report-table__set-number--receiving');
    // volleyreport ov1: BP is NOT in player rows; V-P replaced by Won
    assertNotPresent(source, '<th scope="col" rowSpan={2}>BP</th>');
    assertNotPresent(source, "t('valueMinusErrors')");
    assert(source.includes("t('wonShort')"), 'Must have Won column (points won)');
    // volleyreport ov1 reception: Pos% instead of separate # and +
    assert(source.includes("t('positivePercentShort')"), 'Must have Pos% reception column');
    // volleyreport ov1 attack: K% kill rate column
    assert(source.includes("t('killRateShort')"), 'Must have K% attack column');
    assert(source.includes("t('killShort')"), 'Must have Kill attack column');
    // volleyreport ov1 block: single Blo column (winning blocks only)
    assert(source.includes("t('bloShort')"), 'Must have Blo block column');
    assertNotPresent(source, "t('firstServerShort')");
    assertNotPresent(source, "t('positionEntryShort')");
    assertNotPresent(source, "t('dig')");
    assertNotPresent(source, "t('set')");
    assertNotPresent(source, "t('freeball')");
    assertNotPresent(source, "t('cover')");
  });

  it('renders participation markers as compact DataVolley boxes (ov1 style)', async () => {
    const [css, source, model] = await Promise.all([
      readFile(cssPath, 'utf8'),
      readFile(componentPath, 'utf8'),
      readFile(matchReportModelPath, 'utf8'),
    ]);

    assert(css.includes('.match-report__set-marker--starter'));
    assert(css.includes('.match-report__set-marker--captain'));
    assert(css.includes('.match-report__set-marker--setter'), 'CSS must have setter marker class');
    assert(css.includes('.match-report__set-marker--entry'));
    assert(css.includes('.match-report__set-marker--libero-entry'));
    // volleyreport ov1: starter markers use dark background with white text
    assert(css.includes('background: #444444'), 'Starter marker must use dark ov1 background');
    // setter starter: light background (overrides dark starter)
    assert(css.includes('.match-report__set-marker--setter'), 'Setter marker must have its own CSS class');
    // captain starter: white background (distinct from other starters)
    assert(css.includes('background: #ffffff'));
    assert(css.includes('height: 0.4rem'));
    assertNotPresent(css, 'border-style: dashed');

    // React: setter class applied via isSetter flag
    assert(source.includes("marker.isSetter"), 'Component must use isSetter flag for setter detection');
    assert(source.includes("'match-report__set-marker--setter'"), 'Component must emit setter CSS class');

    // Model: labels use rotation positions (1-6), not jersey numbers
    assert(model.includes('String(participation.startingRotationPosition)'), 'Starter label must be rotation position');
    // Model: isSetter passed from roster role
    assert(model.includes("role === 'setter'"), 'Model must detect setter by role');
    assert(model.includes('isSetter'), 'Model must propagate isSetter to entry markers');
    // HTML export: setter marker CSS in inline styles
    assert(model.includes('.match-report__set-marker--setter'), 'HTML export must include setter marker CSS');
  });

  it('uses compact printable styling instead of dashboard/card styling', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('@media print'));
    assert(css.includes('.match-report-table__set-summary'));
    assert(css.includes('.match-report__set-marker'));
    assert(css.includes('.match-report-table__set-number--serving'));
    assertNotPresent(css, '.match-report-table__set-number--receiving');
    assert(css.includes('.match-report-table__bottom-summary'));
    assert(css.includes('.match-report-table__footer'));
    assert(css.includes('--match-report-primary: #002554'));
    assert(css.includes('--match-report-accent: #0169D8'));
    assertNotPresent(css, '.match-report-table__summary-card');
    assertNotPresent(css, '.match-report-table__set {');
  });

  it('renders bottom summary blocks and footer branding from the report model', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert(source.includes('<BottomSummaryBlocks report={report} />'));
    assert(source.includes('<ReportFooter report={report} />'));
    assert(source.includes("from '@src/assets/openvolleyscout.svg'"));
    assert(source.includes('match-report-table__footer-logo'));
    assert(source.includes("t('matchReportFooterLine'"));
    assert(source.includes("t('matchReportSideOutDirect')"));
    assert(source.includes("t('matchReportCounterattack')"));
    assert(source.includes("t('matchReportReceivePoints')"));
    assert(source.includes("t('matchReportServeBreakPoint')"));
  });

  it('opens a standalone printable report instead of showing a Download HTML action', async () => {
    const source = await readFile(analysisPagePath, 'utf8');

    assert(source.includes('openPrintableMatchReportHtml'));
    assert(source.includes("t('openPrintableReport')"));
    assertNotPresent(source, "t('downloadHtml')");
    assertNotPresent(source, 'downloadMatchReportHtml');
  });

  it('uses A4 print margins and high-resolution PNG export settings', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');

    assert(source.includes('@page { size: A4 portrait; margin: 10mm; }'));
    assert(source.includes('body { width: 210mm; min-height: 297mm;'));
    assert(source.includes('export const MATCH_REPORT_PNG_WIDTH = 2480'));
    assert(source.includes('export const MATCH_REPORT_PNG_HEIGHT = 3508'));
    assert(source.includes("createMatchReportFilename(printTitleInput, 'png')"));
    assert(source.includes("document.createElement('canvas')"));
    assert(source.includes('buildMatchReportPngSvg'));
    assertNotPresent(source, 'margin-min');
    assertNotPresent(source, 'body { width: 210mm; height: 297mm;');
  });

  it('exposes a PNG download action from the analysis page', async () => {
    const source = await readFile(analysisPagePath, 'utf8');

    assert(source.includes('downloadMatchReportPng'));
    assert(source.includes("t('downloadPng')"));
    assert(source.includes('handleDownloadMatchReportPng'));
  });

  it('renders a separate set summary section per team with ov1 columns (Won/Ser/Atk/Blo | Op.Err | Serve+BP% | Rec+SO% | Atk | Blo)', async () => {
    const [source, css, model] = await Promise.all([
      readFile(componentPath, 'utf8'),
      readFile(cssPath, 'utf8'),
      readFile(matchReportModelPath, 'utf8'),
    ]);

    // React component: separate SetSummarySection component
    assert(source.includes('SetSummarySection'), 'Must have SetSummarySection component');
    assert(source.includes('<SetSummarySection tabellino={tabellino} />'), 'Must render SetSummarySection per team');
    // Set summary must be OUTSIDE the player table (a sibling, not inside tbody)
    assert(source.includes('match-report-table__set-section-wrap'), 'Must use set-section-wrap container');
    assert(source.includes('match-report-table__set-section'), 'Must use set-section table class');
    // ov1 set summary columns
    assert(source.includes("t('opponentErrorsShort')"), 'Must have Op.Err column');
    assert(source.includes("t('breakPointPercentShort')"), 'Must have BP% column');
    assert(source.includes("t('sideOutPercentShort')"), 'Must have SO% column');
    assert(source.includes("t('serShort')"), 'Must have Ser sub-column');
    assert(source.includes("t('atkShort')"), 'Must have Atk sub-column');
    // Total row in set summary
    assert(source.includes('tabellino.setTotals'), 'Must render setTotals row');
    assert(source.includes('match-report-table__set-summary-total'), 'Must have set summary total row class');
    // CSS for new section
    assert(css.includes('.match-report-table__set-section-wrap'), 'CSS must have set-section-wrap');
    assert(css.includes('.match-report-table__set-section'), 'CSS must have set-section table');
    assert(css.includes('.match-report-table__set-summary-total'), 'CSS must have set-summary-total');
    // Model: directPoints, ser, atk, blo, opponentErrors, breakPointRate, sideOutRate
    assert(model.includes('directPoints'), 'Model must have directPoints');
    assert(model.includes('breakPointRate'), 'Model must have breakPointRate');
    assert(model.includes('sideOutRate'), 'Model must have sideOutRate');
    assert(model.includes('buildTabellinoSetTotals'), 'Model must have buildTabellinoSetTotals');
    assert(model.includes('setTotals:'), 'TabellinoTeamTable must have setTotals field in builder');
    // HTML export: separate set section table
    assert(model.includes('set-section-table'), 'HTML export must use set-section-table');
    assert(model.includes('renderTabellinoSetSectionHtml'), 'HTML export must call renderTabellinoSetSectionHtml');
  });
});
