// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { DEMO_MATCH_FILE, isDemoMatch, seedDemoMatchOnce } from './demo-match';

afterEach(() => vi.unstubAllGlobals());

describe('demo match seeding', () => {
  it('imports the demo once even when start-up asks twice at the same time', async () => {
    const bytes = readFileSync(`public/${DEMO_MATCH_FILE}`);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    await Promise.all([seedDemoMatchOnce('/'), seedDemoMatchOnce('/')]);
    const demos = (await matchRepository.list()).filter(isDemoMatch);
    expect(demos).toHaveLength(1);
  });
});
