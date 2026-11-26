// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { orderStatsTabs, STATS_TAB_ORDER } from './StatsTabBar';

describe('stats tab order', () => {
  it('keeps the team booklet as the last tab of the team data study', () => {
    expect(STATS_TAB_ORDER).toContain('review');
    const tabs = orderStatsTabs([{ id: 'review' as const }, { id: 'team-performance' as const }, { id: 'video-analysis' as const }]);
    expect(tabs.map((tab) => tab.id)).toEqual(['team-performance', 'video-analysis', 'review']);
  });
});
