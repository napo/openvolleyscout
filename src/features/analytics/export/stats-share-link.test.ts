// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  buildSharedStatsUrl,
  decodeSharedStats,
  encodeSharedStats,
  isSharedStatsExpired,
  type SharedMatchStats,
} from './stats-share-link';

describe('stats-share-link', () => {
  const sample: SharedMatchStats = {
    title: 'Dashboard',
    matchLabel: 'Home vs Away · 3-1',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="10" y="20">SO 62%</text></svg>',
    expiresAt: Date.UTC(2030, 0, 15),
    generatedAt: Date.UTC(2026, 10, 19),
  };

  it('round-trips a shared match statistics payload through URL encoding', () => {
    const url = buildSharedStatsUrl('https://napo.github.io/openvolleyscout/', sample);
    expect(url.startsWith('https://napo.github.io/openvolleyscout/stats-viewer/#1.')).toBe(true);
    const payload = url.split('/stats-viewer/#')[1] ?? '';
    expect(decodeSharedStats(payload)).toEqual(sample);
  });

  it('checks expiry against the given timestamp', () => {
    expect(isSharedStatsExpired(sample, Date.UTC(2029, 11, 31))).toBe(false);
    expect(isSharedStatsExpired(sample, Date.UTC(2030, 0, 16))).toBe(true);
  });

  it('rejects malformed or non-SVG payloads', () => {
    expect(decodeSharedStats('')).toBeNull();
    expect(decodeSharedStats('not-a-valid-payload')).toBeNull();
    const bad = encodeSharedStats({ ...sample, svg: '<script>alert(1)</script>' });
    expect(decodeSharedStats(bad)).toBeNull();
  });
});
