// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Example tactical report of the demo match (Melodic Spikers, fictional team):
 * creates the report in a fresh browser profile, exports the booklet and the
 * A4 PDF into docs/examples/, and renders the booklet sheets as one picture
 * for the README (docs/images/16-tactical-booklet-pages.png).
 *
 *   npm run dev
 *   node tools/docs-screenshots/export-booklet.mjs   # OVS_DOCS_LOCAL=http://localhost:5173/
 *
 * Needs pdftoppm (poppler) and ImageMagick 7.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.OVS_DOCS_LOCAL ?? 'http://localhost:5173/';
const browser = await chromium.launch(process.env.OVS_DOCS_CHROME ? { executablePath: process.env.OVS_DOCS_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.on('dialog', (dialog) => dialog.accept());
await page.addInitScript(() => localStorage.setItem('openvolleyscout.locale', 'en'));

// The demo match is added on first start: reload once so it is there.
await page.goto(`${BASE}#/`); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000);
await page.goto(`${BASE}#/opponent-reports`); await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Create tactical report', exact: true }).first().click(); await page.waitForTimeout(2500);
await page.locator('select').first().selectOption({ label: 'Melodic Spikers' }); await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Create draft', exact: true }).click(); await page.waitForTimeout(7000);

for (const [layout, file] of [['Booklet', 'tactical-report-booklet.pdf'], ['A4', 'tactical-report-a4.pdf']]) {
  await page.locator('details.tactical-export summary').filter({ hasText: /^PDF$/ }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('details.tactical-export[open] .tactical-export__menu button').filter({ hasText: layout }).first().click(),
  ]);
  await download.saveAs(`docs/examples/${file}`);
  await page.waitForTimeout(1500);
}
await browser.close();

// The four booklet sheets in a 2 x 2 grid.
const work = mkdtempSync(join(tmpdir(), 'ovs-booklet-'));
execFileSync('pdftoppm', ['-r', '110', '-png', 'docs/examples/tactical-report-booklet.pdf', join(work, 'sheet')]);
const sheets = readdirSync(work).filter((name) => name.endsWith('.png')).sort().map((name) => join(work, name));
execFileSync('magick', ['montage', ...sheets, '-bordercolor', '#c9d3e3', '-border', '2',
  '-tile', '2x', '-geometry', '+14+14', '-background', '#eef2f8', 'docs/images/16-tactical-booklet-pages.png']);
rmSync(work, { recursive: true, force: true });
console.log('Booklet and A4 PDF in docs/examples/, picture in docs/images/16-tactical-booklet-pages.png');
