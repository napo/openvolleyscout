// SPDX-License-Identifier: AGPL-3.0-or-later
// Records the short clips of the in-app scouting tutorials (one per step), on
// a match Melodic Spikers - Hollywood Blockers created with the demo teams.
// Each clip starts where the previous one ended, so the rally goes on.
//
//   node tools/docs-screenshots/record-scouting.mjs <it|en> <tag|court|basic|detailed>
//
// Needs the production build served as for capture.mjs (see README.md) and
// ffmpeg. Clips land in $OUT_DIR/<lang>/<mode>-NN-<name>.mp4 (16:9, 1280×720).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
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
const VIEWPORT = { width: 1280, height: 720 };
mkdirSync(OUT, { recursive: true });

const L = {
  it: {
    next: 'Avanti', home: 'Melodic Spikers', away: 'Hollywood Blockers', confirmSetup: 'Conferma setup gara',
    autofill: 'Compila automaticamente', startSet: 'Inizia Set', continueRules: 'Continua: regole di punteggio',
    tagHint: 'Solo pulsanti', courtHint: 'Disegna la palla', basicHint: 'Solo servizio', detailedHint: "L'input originale",
  },
  en: {
    next: 'Next', home: 'Melodic Spikers', away: 'Hollywood Blockers', confirmSetup: 'Confirm match setup',
    autofill: 'Auto-fill', startSet: 'Start set', continueRules: 'Continue: scoring rules',
    tagHint: 'Buttons only', courtHint: 'Draw the ball', basicHint: 'Serve and point', detailedHint: 'The original input',
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
    deviceScaleFactor: 1,
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

/** Moves the finger smoothly to an element and taps it. */
async function tap(page, locator, { hold = 120, settle = 650 } = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await page.waitForTimeout(250);
  await page.mouse.down(); await page.waitForTimeout(hold); await page.mouse.up();
  await page.waitForTimeout(settle);
}

/** Drags from one point to another with the finger down. */
async function drag(page, from, to, { steps = 28 } = {}) {
  await page.mouse.move(from.x, from.y, { steps: 14 });
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(700);
}

/** Records one clip: `act` runs on the live screen; the lead-in before it is cut. */
async function clip(index, name, act) {
  const dir = `${OUT}/.raw-${index}`;
  rmSync(dir, { recursive: true, force: true });
  const opened = Date.now();
  const { ctx, page } = await openContext(dir);
  await go(page, '/scouting');
  await page.waitForTimeout(1500);
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 40);
  await page.waitForTimeout(400);
  const lead = (Date.now() - opened) / 1000;
  await act(page);
  await page.waitForTimeout(1200);
  const video = page.video();
  await ctx.close();
  const rawPath = video ? await video.path() : `${dir}/${readdirSync(dir).find((file) => file.endsWith('.webm'))}`;
  const target = `${OUT}/${MODE}-${String(index).padStart(2, '0')}-${name}.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, lead - 0.3)), '-i', rawPath,
    '-vf', 'fps=25,scale=1280:720', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', target]);
  rmSync(dir, { recursive: true, force: true });
  console.log('clip', target);
}

// The symbol is in <b>, or in <small> under the 0-3 pass scale of the reception.
const outcome = (page, symbol) => page.locator('.tag-flow__outcome', { has: page.locator('b, small', { hasText: new RegExp(`^${symbol.replace(/[+#!/=-]/g, '\\$&')}$`) }) }).first();
const tagPlayer = (page, jersey, team) => page.locator('.tag-input button', { hasText: new RegExp(`^${jersey}(?!\\d)`) }).nth(team === 'away' ? 1 : 0);

const STORIES = {
  tag: [
    ['choose', async (page) => { await tap(page, page.locator('button', { hasText: L.tagHint }).first()); }],
    ['serve', async (page) => { await tap(page, outcome(page, '+')); }],
    ['reception', async (page) => { await tap(page, outcome(page, '#')); await tap(page, tagPlayer(page, 4, 'away')); }],
    ['attack-point', async (page) => { await tap(page, outcome(page, '#')); await tap(page, tagPlayer(page, 10, 'away')); }],
    ['undo', async (page) => { await tap(page, page.locator('.tag-input button', { hasText: /^(Annulla|Undo)/ }).first()); }],
    ['other-skill', async (page) => {
      await tap(page, page.locator('.tag-input button', { hasText: LOC === 'it' ? /^Muro$/ : /^Block$/ }).first());
      await tap(page, outcome(page, '#'));
      await tap(page, tagPlayer(page, 6, 'home'));
    }],
    ['point-button', async (page) => {
      await tap(page, page.locator('.tag-input button', { hasText: LOC === 'it' ? 'Punto a Melodic Spikers' : 'Point for Melodic Spikers' }).first());
    }],
    ['keypad', async (page) => {
      await tap(page, page.locator('.tag-input button', { hasText: LOC === 'it' ? 'Sostituzione / numero' : 'Substitution / number' }).first());
      for (const digit of ['4', '2']) await tap(page, page.locator('.tag-input__keypad-grid button', { hasText: new RegExp(`^${digit}$`) }).first(), { settle: 300 });
      await page.waitForTimeout(600);
    }],
  ],
};

const story = STORIES[MODE];
if (!story) throw new Error(`No story for ${MODE}`);
await setupMatch();
for (const [index, [name, act]] of story.entries()) await clip(index + 1, name, act);

