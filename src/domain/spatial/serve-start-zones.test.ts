// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  createFullScoutingCells,
  createServeStartZones,
  getDefaultServeStartZoneForTeam,
  remapScoutingZonesForDisplaySides,
} from './helpers';
import { getZoneCode } from '../../features/scouting/model/datavolley-code';

describe('serve start zones (DataVolley manual 13.2: 1, 9, 6, 7, 5)', () => {
  it.each(['away', 'home'] as const)('%s has the five serve start cells, one per zone', (teamSide) => {
    const zones = createServeStartZones(teamSide);
    expect(zones).toHaveLength(5);
    expect(zones.map((zone) => zone.alignedCourtPosition)).toEqual([5, 7, 6, 9, 1]);
    expect(new Set(zones.map((zone) => zone.id)).size).toBe(5);
    expect(zones.every((zone) => zone.kind === 'serve_start' && zone.teamSide === teamSide)).toBe(true);
  });

  it('the cells are stacked without gaps over the full height of the court', () => {
    const zones = createServeStartZones('home');
    expect(zones[0].bounds.y).toBeCloseTo(12);
    zones.slice(1).forEach((zone, index) => {
      expect(zone.bounds.y).toBeCloseTo(zones[index].bounds.y + zones[index].bounds.height);
      expect(zone.bounds.height).toBeCloseTo(zones[0].bounds.height);
    });
    expect(zones[4].bounds.y + zones[4].bounds.height).toBeCloseTo(88);
  });

  it('the DataVolley code of every cell is its own zone, for both teams', () => {
    for (const teamSide of ['away', 'home'] as const) {
      for (const zone of createServeStartZones(teamSide)) {
        expect(getZoneCode({ teamSide, zoneId: zone.id })).toBe(String(zone.alignedCourtPosition));
      }
    }
  });

  it('keeps the ids of the three original lanes, so saved matches still resolve', () => {
    const ids = createServeStartZones('away').map((zone) => zone.id);
    expect(ids).toContain('away-serve-left');
    expect(ids).toContain('away-serve-center');
    expect(ids).toContain('away-serve-right');
    expect(createFullScoutingCells().filter((zone) => zone.kind === 'serve_start')).toHaveLength(10);
  });

  it('the default serve start stays zone 1', () => {
    for (const teamSide of ['away', 'home'] as const) {
      const zone = getDefaultServeStartZoneForTeam(teamSide, createFullScoutingCells());
      expect(zone?.alignedCourtPosition).toBe(1);
    }
  });

  it('swapping the display sides keeps each cell on its own serve start zone', () => {
    const zones = createFullScoutingCells();
    const swapped = remapScoutingZonesForDisplaySides(zones, { home: 'left', away: 'right' });
    for (const zone of swapped.filter((candidate) => candidate.kind === 'serve_start')) {
      expect(getZoneCode({ teamSide: zone.teamSide, zoneId: zone.id })).toBe(String(zone.alignedCourtPosition));
    }
    expect(swapped.filter((zone) => zone.kind === 'serve_start')).toHaveLength(10);
  });
});
