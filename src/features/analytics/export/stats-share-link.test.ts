// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultAdvancedFilters } from '../filters/advanced-filters';
import {
  getActiveIndicators,
  isEfficiencyCustomized,
  reloadIndicatorSettings,
  resetEfficiencyDefinitions,
  setEfficiencyDefinition,
  setEfficiencyOverride,
} from '@src/features/scouting/model/indicator-settings';
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
    const url = buildSharedStatsUrl('https://scout.volleyserve.it/', sample);
    expect(url.startsWith('https://scout.volleyserve.it/stats-viewer/#1.')).toBe(true);
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
            { label: 'Serve (40)', valueLabel: '42%', pct: 42, color: '#16a34a', details: [['Aces', '18']] },
            { label: 'Attack (60)', valueLabel: '24', pct: 80, color: '#16a34a', secondaryValueLabel: '6', secondaryPct: 20, secondaryColor: '#dc2626', details: [['Total', '60']] },
          ],
        },
        { kind: 'kpi', items: [{ label: 'Side-out', value: '62%', sub: '31 / 50' }] },
        { kind: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Heatmap' },
      ],
    };
    const url = buildSharedStatsUrl('https://scout.volleyserve.it/', v2);
    expect(url.startsWith('https://scout.volleyserve.it/stats-viewer/#2.')).toBe(true);
    const payload = url.split('/stats-viewer/#')[1] ?? '';
    expect(decodeSharedStats(payload)).toEqual(v2);

    const badV2 = encodeSharedStats({
      ...v2,
      blocks: [{ kind: 'svg' as const, svg: '<script>alert(1)</script>' }],
    });
    expect(decodeSharedStats(badV2)).toBeNull();

    const badDetails = encodeSharedStats({
      ...v2,
      blocks: [{ kind: 'bars' as const, items: [{ label: 'Serve', valueLabel: '42%', pct: 42, color: '#16a34a', details: [['missing value']] }] }],
    });
    expect(decodeSharedStats(badDetails)).toBeNull();

    const badImg = encodeSharedStats({
      ...v2,
      blocks: [{ kind: 'image' as const, dataUrl: 'javascript:alert(1)' }],
    });
    expect(decodeSharedStats(badImg)).toBeNull();
  });
});

describe('shared link efficiency rules', () => {
  afterEach(() => { resetEfficiencyDefinitions(); reloadIndicatorSettings(); });

  const share = () => decodeSharedStats(encodeSharedStats({
    version: 3,
    tabId: 'report',
    title: 'Report',
    matchLabel: 'A - B',
    expiresAt: Date.UTC(2099, 0, 1),
    snapshot: {
      report: { homeTabellino: {}, awayTabellino: {}, setSummaries: [], bottomSummaryBlocks: [] } as never,
      filters: createDefaultAdvancedFilters(),
      selectedPlayerIds: [],
    },
  }));

  it('carries the rules the sender changed, and nothing when none were changed', () => {
    const plain = share();
    expect(plain?.version === 3 && plain.snapshot.efficiencyRules).toEqual({});
    setEfficiencyDefinition('attack', { positive: ['#', '+'], negative: ['='] });
    const custom = share();
    expect(custom?.version === 3 && custom.snapshot.efficiencyRules).toEqual({ attack: { positive: ['#', '+'], negative: ['='] } });
  });

  it('are applied while the link is open without touching the viewer own saved rules', () => {
    const stats = { total: 10, hash: 3, plus: 2, exclamation: 0, minus: 0, slash: 1, equal: 1, positive: 0, perfect: 3, errors: 1, points: 3, neutral: 0 };
    expect(getActiveIndicators().attackEfficiency(stats)).toBeCloseTo((3 - 1 - 1) / 10, 10);
    setEfficiencyOverride({ attack: { positive: ['#', '+'], negative: ['='] } });
    expect(getActiveIndicators().attackEfficiency(stats)).toBeCloseTo((5 - 1) / 10, 10);
    expect(isEfficiencyCustomized()).toBe(false);
    setEfficiencyOverride(null);
    expect(getActiveIndicators().attackEfficiency(stats)).toBeCloseTo((3 - 1 - 1) / 10, 10);
  });
});

describe('shared links made before filters took several values', () => {
  it('open with the single set, phase, rotation and score situation read as lists', () => {
    const legacy = { ...createDefaultAdvancedFilters(), set: 2, rallyPhase: 'break_point', rotation: 3, scoreRange: 'clutch' } as unknown as ReturnType<typeof createDefaultAdvancedFilters>;
    const opened = decodeSharedStats(encodeSharedStats({
      version: 3,
      tabId: 'report',
      title: 'Report',
      matchLabel: 'A - B',
      expiresAt: Date.UTC(2099, 0, 1),
      snapshot: { report: { homeTabellino: {}, awayTabellino: {}, setSummaries: [], bottomSummaryBlocks: [] } as never, filters: legacy, selectedPlayerIds: [] },
    }));
    expect(opened?.version === 3 && opened.snapshot.filters).toMatchObject({ set: [2], rallyPhase: ['break_point'], rotation: [3], scoreRange: ['clutch'] });
    const all = { ...createDefaultAdvancedFilters(), set: 'all', rallyPhase: 'all', rotation: 'all', scoreRange: 'all' } as unknown as ReturnType<typeof createDefaultAdvancedFilters>;
    const openedAll = decodeSharedStats(encodeSharedStats({
      version: 3,
      tabId: 'report',
      title: 'Report',
      matchLabel: 'A - B',
      expiresAt: Date.UTC(2099, 0, 1),
      snapshot: { report: { homeTabellino: {}, awayTabellino: {}, setSummaries: [], bottomSummaryBlocks: [] } as never, filters: all, selectedPlayerIds: [] },
    }));
    expect(openedAll?.version === 3 && openedAll.snapshot.filters).toMatchObject({ set: [], rallyPhase: [], rotation: [], scoreRange: [] });
  });
});
