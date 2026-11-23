// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Screenshots for the README and docs/images/, in English, taken from the real
 * app with the demo match (fictional teams) in a fresh browser profile.
 *
 *   npm run dev                                   # or any server of the app
 *   node tools/docs-screenshots/capture-docs.mjs  # OVS_DOCS_LOCAL=http://localhost:5173/
 *
 * The booklet pages and example PDFs come from export-booklet.mjs.
 * Live-scouting, tagging and tactical-report pictures are copied from the
 * English tutorial screenshots in public/tutorials/en/, which show those
 * screens mid-match.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.OVS_DOCS_LOCAL ?? 'http://localhost:5173/';
const OUT = process.env.OUT_DIR ?? 'docs/images';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.OVS_DOCS_CHROME ? { executablePath: process.env.OVS_DOCS_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => localStorage.setItem('openvolleyscout.locale', 'en'));

const go = async (hash, wait = 2500) => { await page.goto(`${BASE}#${hash}`); await page.waitForTimeout(wait); };
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// The demo match is added on first start: reload once so the lists show it.
await go('/'); await page.reload(); await page.waitForTimeout(3000);
await shot('01-home');

await go('/load-data');
await page.locator('#cloud-sync').scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollTo(0, 0));
await shot('11-data-and-sync');

await go('/teams');
await shot('12-teams');

await go('/systems', 3000);
await shot('10-systems');

// Match statistics of the demo match.
await go('/load-data');
await page.getByRole('button', { name: 'Match statistics' }).first().click();
await page.waitForTimeout(3000);
const tab = async (label, name, extra = 0) => {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await page.waitForTimeout(2500);
  const bar = await page.getByRole('tablist').first().boundingBox();
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, (bar?.y ?? 0) + (await page.evaluate(() => window.scrollY)) - 20 + extra));
  await page.waitForTimeout(800);
  await shot(name);
};
await tab('Match report', '04-match-report', 120);
await tab('Team Performance', '05-team-performance', 0);
await tab('Side-out study', '06-side-out-study', 120);
await tab('Play-by-play', '07-play-by-play', 120);
await tab('Trends', '08-trends', 0);

await browser.close();

// Mid-match screens from the tutorial screenshots.
for (const [from, to] of [
  ['court-05', '02-live-scouting'],
  ['tag-05', '03-tags-and-video'],
  ['tr-03-editor', '09-tactical-report'],
  ['tr-04-serve-targets', '14-tactical-serve-targets'],
  ['tr-07-how-they-serve', '15-tactical-how-they-serve'],
]) copyFileSync(`public/tutorials/en/${from}.png`, `${OUT}/${to}.png`);
console.log(`Screenshots written to ${OUT}/`);
