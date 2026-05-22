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

    assert(source.includes('<PlayerMetricRow row={{ ...tabellino.totals'));
    assert(source.includes('tabellino.setRows.map'));
    assert(source.includes('<SetSummaryRow key={`set-${setRow.setNumber}`} row={setRow} />'));
  });

  it('exposes DataVolley-style starter, entry, BP, and V-P columns without secondary skills', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert(source.includes('match-report__set-marker--${markerKind}'));
    assert(source.includes('match-report__set-marker--setter'));
    assert(source.includes("marker.kind !== 'starter'"));
    assert(source.includes("t('firstServerShort')"));
    assert(source.includes('<th scope="col" rowSpan={2}>BP</th>'));
    assert(source.includes("t('valueMinusErrors')"));
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
    assert(css.includes('background: #e5e7eb'));
    assert(css.includes('background: #ffffff'));
    assertNotPresent(css, 'border-style: dashed');
  });

  it('uses compact printable styling instead of dashboard/card styling', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('@media print'));
    assert(css.includes('.match-report-table__set-summary'));
    assert(css.includes('.match-report__set-marker'));
    assertNotPresent(css, '.match-report-table__summary-card');
    assertNotPresent(css, '.match-report-table__set {');
  });
});
