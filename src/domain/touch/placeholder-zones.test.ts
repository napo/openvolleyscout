// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { hasPlaceholderZones } from './types';
import { extractHeatmapEvents } from '../../features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { serveStartZone, serveTargetZone } from '../../features/analytics/serve-attributes';
import type { BallTouch } from './types';

const point = { x: 10, y: 20 };
const placeholderZone = { teamSide: 'home' as const, zoneId: 'home-r3c3', point };
const touch = (extra: Partial<BallTouch>): BallTouch => ({
  id: 't', setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', skill: 'serve', createdAt: 0, ...extra,
});

describe('placeholder zones of button input', () => {
  it('are placeholders only without picked zones', () => {
    expect(hasPlaceholderZones({ withoutZones: true })).toBe(true);
    expect(hasPlaceholderZones({ withoutZones: true, zonesPicked: true })).toBe(false);
    expect(hasPlaceholderZones({})).toBe(false);
  });

  it('give no serve start or target zone', () => {
    const serve = touch({ withoutZones: true, zone: { teamSide: 'home', zoneId: '1' } as never, targetZone: { teamSide: 'away', zoneId: '5' } as never });
    expect(serveStartZone(serve)).toBeNull();
    expect(serveTargetZone(serve)).toBeNull();
    expect(serveStartZone({ ...serve, withoutZones: undefined })).toBe('1');
  });

  it('draw no heatmap direction', () => {
    const placeholder = touch({ skill: 'attack', withoutZones: true, originZone: placeholderZone as never, targetZone: { ...placeholderZone, point: { x: 30, y: 40 } } as never });
    expect(extractHeatmapEvents([placeholder])).toHaveLength(0);
    expect(extractHeatmapEvents([{ ...placeholder, withoutZones: undefined }])).toHaveLength(1);
  });
});
