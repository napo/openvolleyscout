// SPDX-License-Identifier: AGPL-3.0-or-later
// "Where do I start" slides of the in-app tutorials: the clicks that lead to
// each screen, with the element to press highlighted. Uses the same profiles
// as capture.mjs (run that first, so both sample matches are imported).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
import { open, go } from './lib.mjs';

const LOC = process.argv[2] ?? 'it';
const OUT = `${process.env.OUT_DIR ?? 'tmp/docs-screenshots'}/${LOC}`;
mkdirSync(OUT, { recursive: true });
const L = {
  it: { confirm: 'Conferma import', data: 'Dati', stats: 'Statistiche gara', video: 'Analisi video', reports: 'Report tattici', create: 'Crea report tattico', later: 'Ricordamelo domani' },
  en: { confirm: 'Confirm import', data: 'Data', stats: 'Match statistics', video: 'Video analysis', reports: 'Tactical reports', create: 'Create tactical report', later: 'Remind me tomorrow' },
}[LOC];

const { ctx, page } = await open(LOC + '-web', { width: 1280, height: 860 });
await go(page, '/');
await page.evaluate((l) => localStorage.setItem('openvolleyscout.locale', l), LOC);
await page.reload(); await page.waitForTimeout(1500);
const highlight = async (locator) => {
  await locator.evaluate((el) => {
    el.style.outline = '4px solid #f97316';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 0 0 9999px rgba(15, 23, 42, 0.18)';
    el.style.position = el.style.position || 'relative';
    el.style.zIndex = '50';
  });
};
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  // Highlights live on elements that survive navigation (the menu): clear them.
  await page.evaluate(() => document.querySelectorAll('[style*="outline"]').forEach((el) => {
    el.style.outline = ''; el.style.outlineOffset = ''; el.style.boxShadow = ''; el.style.zIndex = '';
  }));
};
const dismiss = async () => { const later = page.getByRole('button', { name: L.later }); if (await later.count()) { await later.first().click(); await page.waitForTimeout(400); } };

// The two sample matches, imported once per profile.
await go(page, '/load-data'); await dismiss();
for (const [file, team] of [['docs/melodicspikers_hollywoodblockers.dvw', 'Melodic Spikers'], ['stuttgart-schwrein.dvw', 'Stuttgart']]) {
  if (await page.locator('.load-data-card', { hasText: team }).count()) continue;
  await page.locator('input[type=file]').first().setInputFiles(REPO + file);
  await page.getByRole('button', { name: L.confirm }).click({ timeout: 20000 });
  await page.waitForTimeout(4000);
  await go(page, '/load-data'); await dismiss();
}

// Video: Data -> Match statistics on the match -> Video analysis
await go(page, '/'); await dismiss();
await highlight(page.locator('.app-header__nav').getByText(L.data, { exact: true }).first());
await shot('vs-00a-menu-data');
await go(page, '/load-data'); await dismiss();
const card = page.locator('.load-data-card', { hasText: 'Stuttgart' }).first();
const statsButton = card.getByRole('button', { name: L.stats });
await statsButton.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 220));
await highlight(statsButton);
await shot('vs-00b-data-stats');
await card.getByRole('button', { name: L.stats }).click(); await page.waitForTimeout(2500);
await highlight(page.getByText(L.video, { exact: true }).first());
await shot('vs-00c-tab-video');

// Tactical report: menu -> Tactical reports -> Create tactical report
await go(page, '/load-data'); await dismiss();
const demo = page.locator('.load-data-card', { hasText: 'Melodic Spikers' }).first();
await demo.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120));
await highlight(demo);
await shot('tr-00a-data-demo');
await go(page, '/opponent-reports'); await dismiss();
await highlight(page.locator('.app-header__nav').getByText(L.reports, { exact: true }).first());
await highlight(page.getByRole('button', { name: L.create }));
await shot('tr-00b-menu-reports');
await ctx.close();
