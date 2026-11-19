// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildVideoEventIndex, getRallyServeStartZone } from './video-event-index';
import {
  applyVideoEventFilters,
  createDefaultVideoEventFilters,
  isDefaultVideoEventFilters,
  VIDEO_FILTER_SERVE_START_ZONES,
} from './video-filters';

let counter = 0;
function touch(rallyNumber: number, sequenceNumber: number, teamSide: 'home' | 'away', skill: string, extra: Record<string, unknown> = {}) {
  counter += 1;
  return {
    type: 'touch_recorded', id: `e${counter}`, createdAt: counter,
    touch: { id: `t${counter}`, setNumber: 1, rallyNumber, sequenceNumber, teamSide, skill, evaluation: '+', createdAt: counter, ...extra },
  };
}
const point = (teamSide: 'home' | 'away') => ({ type: 'point_awarded', id: `p${++counter}`, createdAt: counter, teamSide });

// rally 1: serve from 9, rally 2: serve from 7 (only on the reception, as DataVolley files do), rally 3: no zone, rally 4: serve from 1
const events = [
  touch(1, 1, 'away', 'serve', { startZoneCode: '9', endZoneCode: '5' }),
  touch(1, 2, 'home', 'receive'),
  touch(1, 3, 'home', 'attack'),
  point('home'),
  touch(2, 1, 'away', 'serve'),
  touch(2, 2, 'home', 'receive', { startZoneCode: '7' }),
  point('away'),
  touch(3, 1, 'away', 'serve'),
  touch(3, 2, 'home', 'receive'),
  point('away'),
  touch(4, 1, 'away', 'serve', { startZoneCode: '1' }),
  point('away'),
] as never;

const index = buildVideoEventIndex(events);
const rallies = (filtered: typeof index.entries) => [...new Set(filtered.map((entry) => entry.rallyNumber))];

describe('serve start zone of a rally', () => {
  it('lists the five DataVolley zones in the manual order', () => {
    expect([...VIDEO_FILTER_SERVE_START_ZONES]).toEqual(['1', '9', '6', '7', '5']);
  });

  it('comes from the serve, or from the reception when only that carries it', () => {
    const zoneOf = (rally: number) => index.entries.find((entry) => entry.rallyNumber === rally)?.serveStartZone;
    expect(zoneOf(1)).toBe('9');
    expect(zoneOf(2)).toBe('7');
    expect(zoneOf(3)).toBeUndefined();
    expect(zoneOf(4)).toBe('1');
  });

  it('is shared by every touch of the rally', () => {
    expect(index.entries.filter((entry) => entry.rallyNumber === 1).map((entry) => entry.serveStartZone)).toEqual(['9', '9', '9']);
  });

  it('ignores codes that are not a serve start zone', () => {
    const entry = (code: string) => [{ skill: 'serve', touch: { sequenceNumber: 1, startZoneCode: code } }] as never;
    expect(getRallyServeStartZone(entry('8'))).toBeUndefined();
    expect(getRallyServeStartZone(entry('9B'))).toBe('9');
    expect(getRallyServeStartZone(entry(''))).toBeUndefined();
  });
});

describe('serve start zone filter', () => {
  const filter = (zones: string[]) => applyVideoEventFilters(index.entries, { ...createDefaultVideoEventFilters(), serveStartZones: zones });

  it('keeps every touch of the rallies served from the chosen zones', () => {
    expect(rallies(filter(['9']))).toEqual([1]);
    expect(rallies(filter(['9', '7']))).toEqual([1, 2]);
    expect(filter(['9'])).toHaveLength(3);
  });

  it('drops rallies without a known serve start zone while a zone is chosen', () => {
    expect(rallies(filter(['1', '9', '6', '7', '5']))).toEqual([1, 2, 4]);
  });

  it('combines with the skill filter: only the serves from a zone', () => {
    const serves = applyVideoEventFilters(index.entries, { ...createDefaultVideoEventFilters(), skills: ['serve'], serveStartZones: ['7'] });
    expect(serves.map((entry) => `${entry.rallyNumber}:${entry.skill}`)).toEqual(['2:serve']);
  });

  it('is off by default and with filters saved before the field existed', () => {
    const defaults = createDefaultVideoEventFilters();
    expect(isDefaultVideoEventFilters(defaults)).toBe(true);
    expect(isDefaultVideoEventFilters({ ...defaults, serveStartZones: ['9'] })).toBe(false);
    const legacy = { ...defaults } as Partial<typeof defaults>;
    delete legacy.serveStartZones;
    expect(applyVideoEventFilters(index.entries, legacy as typeof defaults)).toHaveLength(index.entries.length);
    expect(isDefaultVideoEventFilters(legacy as typeof defaults)).toBe(true);
  });
});
