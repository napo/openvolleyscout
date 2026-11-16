// SPDX-License-Identifier: AGPL-3.0-or-later
// Takes the slides of the in-app scouting tutorials: one still per gesture,
// taken just before it, with the position of the tap (or the drag) recorded so
// the app can animate a pulsing finger over the picture. The match is Melodic
// Spikers - Hollywood Blockers, created with the demo teams; the rally goes on
// from one slide to the next.
//
//   node tools/docs-screenshots/record-scouting.mjs <it|en> <tag|court|basic|detailed>
//   node tools/docs-screenshots/record-scouting.mjs merge <mode>   # writes the slide list
//
// Needs the production build served as for capture.mjs (see README.md).
// Stills land in $OUT_DIR/<lang>/<mode>-NN.png (16:9, 1280×720) with
// $OUT_DIR/<lang>/<mode>.json; "merge" writes
// src/features/landing/tutorials/generated/scouting-<mode>.ts.
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { BASE } from './lib.mjs';

const LOC = process.argv[2] ?? 'it';
const MODE = process.argv[3] ?? 'tag';
const OUT = `${process.env.OUT_DIR ?? 'tmp/docs-screenshots'}/${LOC}`;
const PROFILES = process.env.OVS_DOCS_PROFILES ?? `${tmpdir()}/ovs-docs-screenshots`;
const PROFILE = `${PROFILES}/profile-record-${LOC}-${MODE}`;
const LOCAL = process.env.OVS_DOCS_LOCAL ?? 'http://127.0.0.1:5180';
const ORIGIN = new URL(BASE).origin;
// Phone stories ("-phone") are taken on an upright phone screen, the others at 16:9.
const PHONE = MODE.endsWith('-phone');
const VIEWPORT = PHONE ? { width: 390, height: 844 } : { width: 1280, height: 720 };
if (LOC !== 'merge') mkdirSync(OUT, { recursive: true });

const L = {
  it: {
    next: 'Avanti', home: 'Melodic Spikers', away: 'Hollywood Blockers', confirmSetup: 'Conferma setup gara',
    autofill: 'Compila automaticamente', startSet: 'Inizia Set', continueRules: 'Continua: regole di punteggio',
    tagHint: 'Solo pulsanti', courtHint: 'Disegna la palla', basicHint: 'Solo servizio', detailedHint: "L'input originale",
    fullSetup: 'Configurazione completa', block: 'M', codes: 'Codici', substitution: 'Sostituzione', skip: 'Salta',
  },
  en: {
    next: 'Next', home: 'Melodic Spikers', away: 'Hollywood Blockers', confirmSetup: 'Confirm match setup',
    autofill: 'Auto-fill', startSet: 'Start set', continueRules: 'Continue: scoring rules',
    tagHint: 'Buttons only', courtHint: 'Draw the ball', basicHint: 'Serve and point', detailedHint: 'The original input',
    fullSetup: 'Full setup', block: 'B', codes: 'Codes', substitution: 'Substitution', skip: 'Skip',
  },
}[LOC];

/** A visible finger: follows the mouse, pulses on press. */
const pointerScript = () => {
  const install = () => {
    if (document.getElementById('ovs-pointer')) return;
    const dot = document.createElement('div');
    dot.id = 'ovs-pointer';
    dot.style.cssText = 'position:fixed;left:-100px;top:-100px;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;'
      + 'background:rgba(249,115,22,0.35);border:3px solid #f97316;pointer-events:none;z-index:2147483647;transition:transform 120ms ease;';
    document.body.appendChild(dot);
    const style = document.createElement('style');
    style.textContent = '.domain-move-notice { display: none !important; }';
    document.head.appendChild(style);
    window.addEventListener('mousemove', (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    window.addEventListener('mousedown', () => { dot.style.transform = 'scale(0.7)'; dot.style.background = 'rgba(249,115,22,0.6)'; }, true);
    window.addEventListener('mouseup', () => { dot.style.transform = 'scale(1)'; dot.style.background = 'rgba(249,115,22,0.35)'; }, true);
  };
  if (document.body) install(); else document.addEventListener('DOMContentLoaded', install);
};

async function openContext(recordDir) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    serviceWorkers: 'block',
    viewport: VIEWPORT,
    deviceScaleFactor: PHONE ? 2 : 1,
    ...(PHONE ? { isMobile: true, hasTouch: true } : {}),
    ...(process.env.OVS_DOCS_CHROME ? { executablePath: process.env.OVS_DOCS_CHROME } : { channel: 'chrome' }),
    ...(recordDir ? { recordVideo: { dir: recordDir, size: VIEWPORT } } : {}),
  });
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const response = await route.fetch({ url: route.request().url().replace(ORIGIN, LOCAL) });
    await route.fulfill({ response });
  });
  await ctx.addInitScript(pointerScript);
  const page = ctx.pages()[0] ?? await ctx.newPage();
  return { ctx, page };
}

const go = async (page, hash) => { await page.goto(`${BASE}#${hash}`); await page.waitForTimeout(1200); };

/** New match with the demo teams, up to the first rally (mode chooser open). */
async function setupMatch() {
  rmSync(PROFILE, { recursive: true, force: true });
  const { ctx, page } = await openContext(null);
  await go(page, '/');
  await page.evaluate((l) => localStorage.setItem('openvolleyscout.locale', l), LOC);
  await page.reload(); await page.waitForTimeout(4000); // demo match and teams are imported
  await go(page, '/match');
  // The stories need both rosters and lineups: the full setup, not the one-page start.
  await page.getByRole('button', { name: L.fullSetup }).click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: L.next, exact: true }).click(); await page.waitForTimeout(800);
  for (const team of [L.home, L.away]) {
    await page.locator('main input').first().fill(team.split(' ')[0]); await page.waitForTimeout(800);
    await page.getByText(team, { exact: true }).first().click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: new RegExp(`^(${L.next}|${L.continueRules})$`) }).click(); await page.waitForTimeout(1500);
  }
  await page.getByRole('button', { name: L.confirmSetup }).click(); await page.waitForTimeout(2000);
  for (let i = 0; i < 2 && await page.getByRole('button', { name: L.autofill }).count(); i += 1) {
    await page.getByRole('button', { name: L.autofill }).click(); await page.waitForTimeout(700);
    await page.getByRole('button', { name: L.next, exact: true }).click(); await page.waitForTimeout(1200);
  }
  await page.getByRole('button', { name: new RegExp(L.home) }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: L.next, exact: true }).click(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: L.startSet }).click(); await page.waitForTimeout(2500);
  await ctx.close();
}

const steps = [];
const pct = (value, total) => Math.round((value / total) * 1000) / 10;

async function still(page) {
  const index = steps.length + 1;
  await page.evaluate(() => { const dot = document.getElementById('ovs-pointer'); if (dot) dot.style.display = 'none'; });
  const file = `${MODE}-${String(index).padStart(2, '0')}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  return file.replace('.png', '');
}

/** One slide: the screen before the tap, the tap position; then the tap. */
async function tap(page, locator, captionKey, { settle = 900 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`element not visible for ${captionKey}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const image = await still(page);
  steps.push({ image, captionKey, pointer: { x: pct(x, VIEWPORT.width), y: pct(y, VIEWPORT.height) } });
  await page.mouse.click(x, y);
  await page.waitForTimeout(settle);
}

/** One slide: the screen before the drag, its path; then the drag. */
async function drag(page, from, to, captionKey, { settle = 1000 } = {}) {
  const image = await still(page);
  steps.push({ image, captionKey, drag: { from: { x: pct(from.x, VIEWPORT.width), y: pct(from.y, VIEWPORT.height) }, to: { x: pct(to.x, VIEWPORT.width), y: pct(to.y, VIEWPORT.height) } } });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(settle);
}

/** A closing slide: the result, no gesture. */
async function end(page, captionKey) {
  steps.push({ image: await still(page), captionKey });
}

const outcome = (page, symbol) => page.locator('.tag-flow__outcome', { has: page.locator('b, small', { hasText: new RegExp(`^${symbol.replace(/[+#!/=-]/g, '\\$&')}$`) }) }).first();
const tagPlayer = (page, jersey, team) => page.locator('.tag-input button', { hasText: new RegExp(`^${jersey}(?!\\d)`) }).nth(team === 'away' ? 1 : 0);

const courtBox = async (page) => page.locator('section.scouting-court').first().boundingBox();
/** A point on the court, in % of its box (x: 0 left - 100 right, y: 0 top - 100 bottom). */
const at = (box, x, y) => ({ x: box.x + (box.width * x) / 100, y: box.y + (box.height * y) / 100 });
const centerOf = async (locator) => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const courtPlayer = (page, side, jersey) => page.locator(`button[data-team-side="${side}"][data-player-id]`, { has: page.locator('.scouting-court__marker-number', { hasText: new RegExp(`^${jersey}(?!\\d)`) }) }).first();
// Evaluation buttons read e.g. "#Perfetta": the symbol first, then its meaning.
const toolbarEval = (page, symbol) => page.locator('.live-scouting-toolbar button:not([disabled])', { hasText: new RegExp(`^\\${symbol}(?!\\d)`) }).first();

const STORIES = {
  'court-phone': async (page) => {
    await tap(page, page.locator('button', { hasText: L.courtHint }).first(), 'tutorialCourtPhone01');
    // The small-screen notice about video is not part of the lesson.
    const gotIt = page.getByRole('button', { name: LOC === 'it' ? 'Ho capito' : 'Got it' });
    if (await gotIt.count()) { await gotIt.first().click(); await page.waitForTimeout(500); }
    const ball = () => centerOf(page.locator('.scouting-court__ball-token').first());
    let box = await courtBox(page);
    // Upright court: Melodic Spikers at the bottom, Hollywood Blockers at the top.
    await drag(page, await ball(), at(box, 62, 28), 'tutorialCourtPhone02');
    await tap(page, courtPlayer(page, 'away', 6), 'tutorialCourtPhone03');
    await tap(page, toolbarEval(page, '#'), 'tutorialCourtPhone04');
    box = await courtBox(page);
    await drag(page, await ball(), at(box, 35, 78), 'tutorialCourtPhone05');
    await tap(page, courtPlayer(page, 'away', 10), 'tutorialCourtPhone06');
    await tap(page, toolbarEval(page, '#'), 'tutorialCourtPhone07');
    const confirm = page.getByRole('button', { name: LOC === 'it' ? /^Sì/ : /^Yes/ }).first();
    if (await confirm.count()) await tap(page, confirm, 'tutorialCourtPhone08');
    box = await courtBox(page);
    await drag(page, await ball(), at(box, 40, 72), 'tutorialCourtPhone09');
    await tap(page, courtPlayer(page, 'home', 9), 'tutorialCourtPhone10');
    await tap(page, toolbarEval(page, '+'), 'tutorialCourtPhone11');
    await end(page, 'tutorialCourtPhone12');
  },

  detailed: async (page) => {
    const input = () => page.locator('.code-input-panel__input').first();
    /** One slide on the code field, then the code is typed and sent. */
    const typeCode = async (code, captionKey) => {
      await tap(page, input(), captionKey, { settle: 200 });
      await input().fill(code);
      await page.waitForTimeout(400);
      await input().press('Enter');
      await page.waitForTimeout(1000);
    };
    await tap(page, page.locator('button', { hasText: L.detailedHint }).first(), 'tutorialExpert01');
    await typeCode('*1SM+', 'tutorialExpert02');
    await typeCode('a6RM#', 'tutorialExpert03');
    await input().fill('a10AH#');
    await page.waitForTimeout(500);
    await tap(page, page.locator('.code-input-panel button', { hasText: /^>$/ }).last(), 'tutorialExpert04');
    const confirm = page.getByRole('button', { name: LOC === 'it' ? /^Sì/ : /^Yes/ }).first();
    if (await confirm.count()) await tap(page, confirm, 'tutorialExpert04');
    await end(page, 'tutorialExpert05');
  },

  basic: async (page) => {
    const serve = () => page.locator('button', { hasText: LOC === 'it' ? /^Servizio/ : /^Serve/ }).first();
    const point = (team) => page.locator('button', { hasText: new RegExp(`^(Punto|Point)${team}`) }).first();
    await tap(page, page.locator('button', { hasText: L.basicHint }).first(), 'tutorialBasic01');
    await tap(page, serve(), 'tutorialBasic02');
    await tap(page, point(L.away), 'tutorialBasic03');
    await tap(page, serve(), 'tutorialBasic04');
    await tap(page, point(L.home), 'tutorialBasic05');
    await tap(page, page.locator('main button', { hasText: LOC === 'it' ? /^Annulla$/ : /^Undo$/ }).last(), 'tutorialBasic06');
    await end(page, 'tutorialBasic07');
  },

  court: async (page) => {
    await tap(page, page.locator('button', { hasText: L.courtHint }).first(), 'tutorialCourt01');
    let box = await courtBox(page);
    await drag(page, await centerOf(page.locator('.scouting-court__ball-token').first()), at(box, 78, 40), 'tutorialCourt02');
    await tap(page, courtPlayer(page, 'away', 6), 'tutorialCourt03');
    await tap(page, toolbarEval(page, '#'), 'tutorialCourt04');
    box = await courtBox(page);
    // Attack: from the ball (the setter has it) over the net into the other court.
    await drag(page, await centerOf(page.locator('.scouting-court__ball-token').first()), at(box, 22, 72), 'tutorialCourt05');
    await tap(page, courtPlayer(page, 'away', 10), 'tutorialCourt06');
    await tap(page, toolbarEval(page, '#'), 'tutorialCourt07');
    const confirm = page.getByRole('button', { name: LOC === 'it' ? /^Sì/ : /^Yes/ }).first();
    if (await confirm.count()) await tap(page, confirm, 'tutorialCourt08');
    // Second rally: the other team serves, Melodic Spikers receive.
    box = await courtBox(page);
    await drag(page, await centerOf(page.locator('.scouting-court__ball-token').first()), at(box, 22, 38), 'tutorialCourt09');
    await tap(page, courtPlayer(page, 'home', 9), 'tutorialCourt10');
    await tap(page, toolbarEval(page, '+'), 'tutorialCourt11');
    await tap(page, page.locator('.live-scouting-toolbar button', { hasText: LOC === 'it' ? /^Annulla$/ : /^Undo$/ }).first(), 'tutorialCourt12');
    await end(page, 'tutorialCourt13');
  },
  tag: async (page) => {
    const skillKey = (letter) => page.locator('.tag-flow__skills button', { has: page.locator('b', { hasText: new RegExp(`^${letter}$`) }) }).first();
    await tap(page, page.locator('button', { hasText: L.tagHint }).first(), 'tutorialTagK01');
    await tap(page, outcome(page, '-'), 'tutorialTagK02');
    await tap(page, tagPlayer(page, 4, 'away'), 'tutorialTagK03');
    await tap(page, outcome(page, '#'), 'tutorialTagK04');
    await tap(page, tagPlayer(page, 10, 'away'), 'tutorialTagK05');
    await tap(page, outcome(page, '#'), 'tutorialTagK06');
    await tap(page, page.locator('.tag-zone-picker__subzone[aria-label="1A"]').first(), 'tutorialTagK07');
    await tap(page, page.locator('.tag-input button', { hasText: /^(Annulla|Undo)/ }).first(), 'tutorialTagK08');
    await tap(page, skillKey(L.block), 'tutorialTagK09');
    await tap(page, tagPlayer(page, 6, 'home'), 'tutorialTagK10');
    await tap(page, outcome(page, '#'), 'tutorialTagK11');
    await tap(page, page.locator('.tag-input button', { hasText: LOC === 'it' ? 'Punto a Melodic Spikers' : 'Point for Melodic Spikers' }).first(), 'tutorialTagK12');
    await tap(page, page.locator('.tag-input button', { hasText: new RegExp(`^${L.substitution}$`) }).first(), 'tutorialTagK13');
    await tap(page, page.locator('.tag-input__keypad-grid button', { hasText: /^4$/ }).first(), 'tutorialTagK14', { settle: 500 });
    await tap(page, page.locator('.tag-input__keypad-grid button', { hasText: /^2$/ }).first(), 'tutorialTagK15');
    await tap(page, page.locator('.tag-input button', { hasText: new RegExp(`^${L.codes}$`) }).first(), 'tutorialTagK16');
    await end(page, 'tutorialTagK17');
  },
};

if (process.argv[2] === 'merge') {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const base = process.env.OUT_DIR ?? 'tmp/docs-screenshots';
  const read = (lang) => JSON.parse(readFileSync(`${base}/${lang}/${MODE}.json`, 'utf8'));
  const it = read('it');
  const en = read('en');
  if (it.length !== en.length) throw new Error('Italian and English stories differ');
  const slides = it.map((slide, index) => ({ ...slide, enPointer: en[index].pointer, enDrag: en[index].drag }));
  const name = `scouting${MODE.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
  writeFileSync(`src/features/landing/tutorials/generated/scouting-${MODE}.ts`, `// SPDX-License-Identifier: AGPL-3.0-or-later
// Generated by tools/docs-screenshots/record-scouting.mjs: do not edit by hand.
import type { ImageTutorialSlide } from '../image-tutorials';

export const ${name}Slides: ImageTutorialSlide[] = ${JSON.stringify(slides, null, 2)};
`);
  console.log('slides', slides.length);
  process.exit(0);
}
const story = STORIES[MODE];
if (!story) throw new Error(`No story for ${MODE}`);
await setupMatch();
const { ctx, page } = await openContext(null);
await go(page, '/scouting');
await page.waitForTimeout(2000);
await story(page);
await ctx.close();
const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/${MODE}.json`, JSON.stringify(steps, null, 2));
console.log('slides', steps.length);
