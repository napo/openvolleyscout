// SPDX-License-Identifier: AGPL-3.0-or-later
// Captures the screenshots of the two user tutorials. See README.md.
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { open, go, BASE } from './lib.mjs';
const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const LOC = process.argv[2] ?? 'it';
const ONLY = process.argv[3] ?? 'all';
const OUT = `${process.env.OUT_DIR ?? REPO + '/tmp/docs-screenshots'}/${LOC}`; mkdirSync(OUT, { recursive: true });
const parse = (loc) => { const m = new Map(); for (const line of readFileSync(`${REPO}/src/i18n/locales/${loc}.ts`, 'utf8').split('\n')) { const r = line.match(/^\s*([A-Za-z0-9_]+):\s*(['"])(.*)\2,?\s*$/); if (r) m.set(r[1], r[3].replace(/\\'/g, "'").replace(/\\"/g, '"')); } return m; };
const IT = parse('it'), CUR = parse(LOC);
const tr = (text) => { for (const [k, v] of IT) if (v === text) { const out = CUR.get(k); if (out) return out; } console.log('NO KEY FOR', text); return text; };
const step = async (name, fn) => { try { await fn(); console.log('ok', name); } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); } };
const { ctx, page } = await open(LOC + '-web', { width: 1280, height: 860 });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const shot = (name, target = page, opts = {}) => target.screenshot({ path: `${OUT}/${name}.png`, ...opts });
const btn = (text) => page.getByRole('button', { name: tr(text), exact: true });
await go(page, '/');
await page.evaluate((l) => localStorage.setItem('openvolleyscout.locale', l), LOC);
await page.reload(); await page.waitForTimeout(1200);
await go(page, '/load-data');
const later = btn('Ricordamelo domani'); if (await later.count()) { await later.first().click(); await page.waitForTimeout(400); }

// ---- import once
if (!(await page.locator('body').innerText()).includes('Melodic Spikers')) {
  for (const f of [`${REPO}/docs/melodicspikers_hollywoodblockers.dvw`, `${REPO}/stuttgart-schwrein.dvw`]) {
    await go(page, '/load-data');
    await page.locator('input[type=file]').first().setInputFiles(f);
    await page.waitForTimeout(2500);
    if (f.includes('melodic')) await step('import-preview', () => shot('import-preview', page, { fullPage: true }));
    await btn('Conferma import').click({ timeout: 20000 });
    await page.waitForTimeout(5000);
  }
}

if (ONLY === 'all' || ONLY === 'report') {
  await go(page, '/opponent-reports');
  let editorUrl = null;
  page.on('dialog', (d) => d.accept());
  while (await page.locator('.opponent-reports__item').count() > 1) {
    await page.locator('.opponent-reports__item').last().getByRole('button', { name: tr('Elimina') }).click(); await page.waitForTimeout(1200);
  }
  const existing = page.locator('.opponent-reports__open');
  if (await existing.count()) { await shot('tr-01b-list-with-report'); await existing.first().click(); await page.waitForTimeout(2500); editorUrl = page.url(); }
  else {
    await step('tr-01-list', () => shot('tr-01-list'));
    await btn('Crea report tattico').click(); await page.waitForTimeout(2500);
    await page.locator('select').first().selectOption({ label: 'Melodic Spikers' }); await page.waitForTimeout(2500);
    await step('tr-02-setup', () => shot('tr-02-setup', page, { fullPage: true }));
    await btn('Crea bozza').click(); await page.waitForTimeout(6000);
    editorUrl = page.url();
  }
  console.log('EDITOR', editorUrl);
  await page.evaluate(() => window.scrollTo(0, 0));
  await step('tr-03-editor', () => shot('tr-03-editor'));
  const sheets = [['Dove battere', 'tr-04-serve-targets'], ['Muro e difesa', 'tr-05-block-defence'], ['Distribuzione in alzata', 'tr-06-setter'], ['Come battono', 'tr-07-how-they-serve']];
  for (const [name, file] of sheets) {
    await step(file, async () => {
      await page.locator('main button').filter({ hasText: tr(name) }).first().click();
      await page.waitForTimeout(1800);
      await page.evaluate(() => window.scrollTo(0, 395)); await page.waitForTimeout(500);
      await shot(file);
    });
  }
  await step('tr-08-drawing', async () => {
    await page.locator('main button').filter({ hasText: tr('Dove battere') }).first().click(); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: tr('Modifica disegno SVG') }).first().click(); await page.waitForTimeout(2500);
    await shot('tr-08-drawing');
    await page.getByRole('button', { name: tr('Chiudi editor disegno') }).first().click(); await page.waitForTimeout(800);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await step('tr-09-preview', async () => {
    await page.locator('main').getByText(tr('Anteprima'), { exact: true }).first().click(); await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Booklet', exact: true }).first().click(); await page.waitForTimeout(5000);
    const imgs = page.locator('img.tactical-preview');
    console.log('PREVIEW pages', await imgs.count());
    for (const i of [0, 1, 2, 3]) { await imgs.nth(i).scrollIntoViewIfNeeded(); await imgs.nth(i).screenshot({ path: `${OUT}/tr-09-preview-${i + 1}.png` }); }
  });
  if (ONLY !== 'all') { await ctx.close(); process.exit(0); }
}

if (ONLY === 'all' || ONLY === 'share') {
  await go(page, '/opponent-reports');
  await page.locator('.opponent-reports__open').first().click(); await page.waitForTimeout(3000);
  await step('tr-10-share', async () => {
    await page.locator('main').getByText(tr('Link del report'), { exact: true }).first().click(); await page.waitForTimeout(600);
    await btn('Crea link web').first().click(); await page.waitForTimeout(4000);
    await shot('tr-10-share');
    console.log('SHARE', (await page.locator('main').first().innerText()).replace(/\n+/g, ' | ').slice(0, 900));
    const links = await page.locator('input, textarea, a').evaluateAll((els) => els.map((e) => e.value || e.href || '').filter((v) => v.includes('tactical-report/')));
    console.log('LINKS', links.length, (links[0] || '').slice(0, 120));
    if (links[0]) { const p2 = await ctx.newPage(); await p2.goto(links[0].replace(/^https?:\/\/[^#]+/, BASE)); await p2.waitForTimeout(3500); await p2.screenshot({ path: `${OUT}/tr-11-shared-page.png` }); await p2.close(); }
  });
  if (ONLY !== 'all') { await ctx.close(); process.exit(0); }
}
if (ONLY === 'all' || ONLY === 'video') {
  const main = page.locator('main.app-page-screen');
  await go(page, '/load-data');
  await page.locator('button', { hasText: tr('Statistiche gara') }).first().click(); await page.waitForTimeout(2500);
  await page.getByText(tr('Analisi video'), { exact: true }).first().click(); await page.waitForTimeout(2500);
  const url = page.getByPlaceholder(tr('URL del video YouTube'));
  if (await url.count()) {
    await step('vs-01-source', () => shot('vs-01-source'));
    await url.fill('https://www.youtube.com/watch?v=E4WOxZ5a6u4');
    await btn('Carica video').click();
  }
  await page.waitForTimeout(9000);
  const ok = main.getByRole('button', { name: tr('Ho capito') });
  if (await ok.count()) { await step('vs-02-youtube-notice', async () => { await ok.scrollIntoViewIfNeeded(); await shot('vs-02-youtube-notice'); await ok.click(); }); }
  await page.evaluate(() => window.scrollTo(0, 380)); await page.waitForTimeout(800);
  await step('vs-03-loaded', () => shot('vs-03-loaded'));
  // start clean: remove points left by earlier runs
  const cal = main.locator('.video-analysis__calibration');
  for (let i = 0; i < 12; i += 1) { const x = cal.locator('.video-analysis__sync-table-actions-col button'); if (!(await x.count())) break; await x.first().click(); await page.waitForTimeout(500); }
  await step('vs-04-calibration', async () => {
    const h = main.locator('.video-analysis__calibration'); await h.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 160)); await page.waitForTimeout(500);
    await shot('vs-04-calibration');
    console.log('CAL', (await h.innerText()).replace(/\n+/g, ' | ').slice(0, 700));
  });
  const rows = main.locator('.video-analysis__event-main');
  const tapOnServe = async (code) => {
    // Play the serve (starts 3 s earlier), then tap when it is hit.
    await rows.filter({ hasText: code }).first().click();
    await page.waitForTimeout(3600);
    await main.locator('.video-analysis__rapid-tap').click(); await page.waitForTimeout(900);
  };
  await step('vs-05-rapid', async () => {
    await rows.first().click(); await page.waitForTimeout(2500);
    await btn('Sincronizzazione rapida').click(); await page.waitForTimeout(1500);
    const r = main.locator('.video-analysis__rapid'); await r.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 140)); await page.waitForTimeout(500);
    await shot('vs-05-rapid');
    for (const code of ['*17SM-', 'a06SM-', 'a06SM!']) await tapOnServe(code);
    await page.waitForTimeout(500);
    await shot('vs-05b-rapid-after');
    await r.getByRole('button', { name: tr('Fatto'), exact: true }).click(); await page.waitForTimeout(1200);
  });
  await step('vs-06-sync-points', async () => {
    await cal.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 200)); await page.waitForTimeout(500);
    await shot('vs-06-sync-points');
    console.log('CAL2', (await cal.innerText()).replace(/\n+/g, ' | ').slice(-420));
  });
  await step('vs-07-filters', async () => {
    const f = main.locator('.video-analysis__filters');
    await f.locator('select').first().selectOption({ index: 2 });
    const skill = f.locator('.video-analysis__multiselect').nth(1);
    await skill.locator('button, summary').first().click(); await page.waitForTimeout(500);
    await skill.locator('.video-analysis__multiselect-option').filter({ hasText: tr('Attacco') }).first().click(); await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await f.locator('span').first().click(); await page.waitForTimeout(400);
    for (const mark of ['+', '!', '-', '/', '=']) { await f.getByLabel(mark, { exact: true }).uncheck().catch(() => {}); }
    await page.waitForTimeout(800);
    await f.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -80)); await page.waitForTimeout(600);
    await shot('vs-07-filters');
    console.log('COUNT', (await main.innerText()).match(/(Azioni|Actions): \d+/)?.[0]);
  });
  await step('vs-08-share', async () => {
    const y = main.locator('.video-analysis__youtube-playlist');
    await y.getByRole('button', { name: tr('Condividi link'), exact: true }).click(); await page.waitForTimeout(3000);
    await y.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
    await shot('vs-08-share');
    await y.screenshot({ path: `${OUT}/vs-08b-share-panel.png` });
    const link = await y.locator('textarea[readonly], input[readonly]').first().inputValue();
    console.log('PLAYLIST LINK', link.length, link.slice(0, 80));
    const m = link.match(/https?:\/\/\S+/);
    if (m) {
      const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 1280, height: 860 });
      await p2.goto(m[0].replace(/^https?:\/\/[^#]+/, BASE)); await p2.waitForTimeout(7000);
      await p2.getByRole('button', { name: tr('Successiva'), exact: true }).last().click().catch((e) => console.log('next fail', String(e).split('\n')[0])); await p2.waitForTimeout(9000);
      await p2.screenshot({ path: `${OUT}/vs-09-player.png` });
      await p2.setViewportSize({ width: 390, height: 800 }); await p2.waitForTimeout(2500);
      await p2.screenshot({ path: `${OUT}/vs-10-player-phone.png` });
      await p2.close();
    }
  });
  await ctx.close(); process.exit(0);
}
await ctx.close();