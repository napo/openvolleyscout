// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
/** The public address shown in the screenshots; requests to it are served from the local preview. */
export const BASE = process.env.OVS_DOCS_BASE ?? 'https://napo.github.io/openvolleyscout/';
const ORIGIN = new URL(BASE).origin;
/** Browser profiles (one per language) live outside the repository and outside your own archive. */
const PROFILES = process.env.OVS_DOCS_PROFILES ?? (await import('node:os')).tmpdir() + '/ovs-docs-screenshots';
const LOCAL = process.env.OVS_DOCS_LOCAL ?? 'http://127.0.0.1:5180';
export async function open(profile = 'it', viewport = { width: 1366, height: 860 }) {
  const ctx = await chromium.launchPersistentContext(PROFILES + '/profile-' + profile, { headless: true, serviceWorkers: 'block', ...(process.env.OVS_DOCS_CHROME ? { executablePath: process.env.OVS_DOCS_CHROME } : { channel: 'chrome' }), args: ['--autoplay-policy=no-user-gesture-required'], viewport, locale: profile === 'it' ? 'it-IT' : 'en-GB', deviceScaleFactor: 1.5 });
  await ctx.route(ORIGIN + '/**', async (route) => { const response = await route.fetch({ url: route.request().url().replace(ORIGIN, LOCAL) }); await route.fulfill({ response }); });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  return { ctx, page };
}
export const go = async (page, hash) => { await page.goto(BASE + '#' + hash); await page.waitForTimeout(1200); };
