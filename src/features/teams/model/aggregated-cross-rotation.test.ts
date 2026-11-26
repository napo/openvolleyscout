// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { mergeCrossRotationStats } from '@src/features/scouting/model/match-stats';
import { orderStatsTabs } from '@src/features/analytics/stats-tabs/StatsTabBar';

const stats = (file: string) => {
  const bytes = readFileSync(file);
  const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'd.dvw' });
  return buildProjectMatchStats(mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'd.dvw' }).project);
};

describe('cross rotation of several matches', () => {
  const a = stats('public/samples/demo-melodic-spikers-hollywood-blockers.dvw');
  const b = stats('stuttgart-schwrein.dvw');

  it('is the same table when only one match is pooled, with the studied team as home', () => {
    const asHome = mergeCrossRotationStats([{ stats: a.crossRotationStats, studiedSide: 'home' }]);
    expect(asHome.bySide.home.grandTotal).toEqual(a.crossRotationStats.bySide.home.grandTotal);
    const asAway = mergeCrossRotationStats([{ stats: a.crossRotationStats, studiedSide: 'away' }]);
    expect(asAway.bySide.home.grandTotal).toEqual(a.crossRotationStats.bySide.away.grandTotal);
    expect(asAway.bySide.away.grandTotal).toEqual(a.crossRotationStats.bySide.home.grandTotal);
  });

  it('adds up the matches, cell by cell, and computes the percentages again', () => {
    const merged = mergeCrossRotationStats([
      { stats: a.crossRotationStats, studiedSide: 'home' },
      { stats: b.crossRotationStats, studiedSide: 'home' },
    ]);
    const total = merged.bySide.home.grandTotal;
    expect(total.attempts).toBe(a.crossRotationStats.bySide.home.grandTotal.attempts + b.crossRotationStats.bySide.home.grandTotal.attempts);
    expect(total.attempts).toBeGreaterThan(0);
    expect(total.sideOutPercentage).toBeCloseTo(total.sideOutWins / total.attempts, 10);
    expect(merged.bySide.home.cells[1][1].servingRotation).toBe(1);
  });
});

describe('the order of the statistics tabs', () => {
  it('is the same whatever order a page lists them in', () => {
    const listed = ['review', 'video-analysis', 'cross-rotation', 'report', 'team-performance', 'play-by-play', 'zone-analysis'] as const;
    expect(orderStatsTabs(listed.map((id) => ({ id }))).map((tab) => tab.id)).toEqual([
      'play-by-play', 'report', 'team-performance', 'zone-analysis', 'cross-rotation', 'video-analysis', 'review',
    ]);
  });
});
