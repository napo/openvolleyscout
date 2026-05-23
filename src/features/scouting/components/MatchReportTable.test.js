import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const componentPath = join(__dirname, 'MatchReportTable.tsx');
const cssPath = join(__dirname, '..', 'scouting-screen.css');

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

  it('exposes DataVolley-style set, starter, entry, BP, and V-P columns without secondary skills', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert(source.includes('match-report__set-marker--${markerKind}'));
    assert(source.includes('match-report__set-marker--setter'));
    assert(source.includes("marker.kind !== 'starter'"));
    assert(source.includes("t('firstServerShort')"));
    assert(source.includes("t('setShort')"));
    assert(source.includes('tabellino.setHeaders.map'));
    assert(source.includes('SetNumberHeader'));
    assert(source.includes('match-report-table__set-number--receiving'));
    assert(source.includes('<th scope="col" rowSpan={2}>BP</th>'));
    assert(source.includes("t('valueMinusErrors')"));
    assertNotPresent(source, "t('positionEntryShort')");
    assertNotPresent(source, "t('dig')");
    assertNotPresent(source, "t('set')");
    assertNotPresent(source, "t('freeball')");
    assertNotPresent(source, "t('cover')");
  });

  it('renders participation markers as compact DataVolley boxes', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('.match-report__set-marker--starter'));
    assert(css.includes('.match-report__set-marker--setter'));
    assert(css.includes('.match-report__set-marker--entry'));
    assert(css.includes('.match-report__set-marker--libero-entry'));
    assert(css.includes('background: #d1d5db'));
    assert(css.includes('background: #ffffff'));
    assert(css.includes('height: 0.4rem'));
    assertNotPresent(css, 'border-style: dashed');
  });

  it('uses compact printable styling instead of dashboard/card styling', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('@media print'));
    assert(css.includes('.match-report-table__set-summary'));
    assert(css.includes('.match-report__set-marker'));
    assert(css.includes('.match-report-table__set-number--receiving'));
    assert(css.includes('.match-report-table__bottom-summary'));
    assert(css.includes('.match-report-table__footer'));
    assertNotPresent(css, '.match-report-table__summary-card');
    assertNotPresent(css, '.match-report-table__set {');
  });

  it('renders bottom summary blocks and footer branding from the report model', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert(source.includes('<BottomSummaryBlocks report={report} />'));
    assert(source.includes('<ReportFooter report={report} />'));
    assert(source.includes("t('matchReportFooterLine1'"));
    assert(source.includes("t('matchReportFooterLine2')"));
    assert(source.includes("t('matchReportSideOutDirect')"));
    assert(source.includes("t('matchReportCounterattack')"));
    assert(source.includes("t('matchReportReceivePoints')"));
    assert(source.includes("t('matchReportServeBreakPoint')"));
  });
});
