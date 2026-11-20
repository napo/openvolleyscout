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

  it('round-trips compact v2 data-driven tab payloads and rejects unsafe SVG blocks', () => {
    const v2: SharedMatchStats = {
      version: 2,
      tabId: 'sideout-study',
      title: 'Studio cambio palla',
      matchLabel: 'Gela - Messina · 3-1',
      expiresAt: Date.UTC(2030, 0, 15),
      generatedAt: Date.UTC(2026, 10, 19),
      blocks: [
        { kind: 'heading', text: 'Distribuzione P1-P6' },
        { kind: 'text', text: 'Campione: 98 ricezioni' },
        { kind: 'table', rows: [['Rot', 'Z4', 'Z3', 'Z2'], ['P1', '45%', '25%', '30%']] },
        { kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>' },
        {
          kind: 'bars',
          title: 'Efficiency',
          items: [
            { label: 'Serve (40)', valueLabel: '42%', pct: 42, color: '#16a34a' },
            { label: 'Attack (60)', valueLabel: '24', pct: 80, color: '#16a34a', secondaryValueLabel: '6', secondaryPct: 20, secondaryColor: '#dc2626' },
          ],
        },
        { kind: 'kpi', items: [{ label: 'Side-out', value: '62%', sub: '31 / 50' }] },
        { kind: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Heatmap' },
      ],
    };
    const url = buildSharedStatsUrl('https://napo.github.io/openvolleyscout/', v2);
    expect(url.startsWith('https://napo.github.io/openvolleyscout/stats-viewer/#2.')).toBe(true);
    const payload = url.split('/stats-viewer/#')[1] ?? '';
    expect(decodeSharedStats(payload)).toEqual(v2);

    const badV2 = encodeSharedStats({
      ...v2,
      blocks: [{ kind: 'svg' as const, svg: '<script>alert(1)</script>' }],
    });
    expect(decodeSharedStats(badV2)).toBeNull();

    const badImg = encodeSharedStats({
      ...v2,
      blocks: [{ kind: 'image' as const, dataUrl: 'javascript:alert(1)' }],
    });
    expect(decodeSharedStats(badImg)).toBeNull();
  });
});
