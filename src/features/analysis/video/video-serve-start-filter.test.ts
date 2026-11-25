// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildVideoEventIndex, getRallyServeStartZone } from './video-event-index';
import {
  VIDEO_FILTER_SERVE_START_ZONES,
} from './video-filters';
import {
  annotateVideoEntries,
  applyVideoChainFilters,
  createDefaultVideoChainFilters,
  isDefaultVideoChainFilters,
  toVideoChainFilters,
  type VideoChainFilters,
  type VideoSkillAttributes,
} from './video-chain-filters';

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

// The serve filters are attributes of the serve link of the chain.
const chainFilter = (entries: typeof index.entries, patch: Partial<VideoChainFilters>) =>
  applyVideoChainFilters(annotateVideoEntries(entries), { ...createDefaultVideoChainFilters(), ...patch });
const serves = (entries: typeof index.entries, serve: VideoSkillAttributes) => chainFilter(entries, { chain: ['serve'], attributes: { serve } });

describe('serve start zone filter', () => {
  const filter = (zones: string[]) => serves(index.entries, { serveStartZones: zones });

  it('keeps the serves of the rallies served from the chosen zones', () => {
    expect(rallies(filter(['9']))).toEqual([1]);
    expect(rallies(filter(['9', '7']))).toEqual([1, 2]);
    expect(filter(['9']).every((entry) => entry.skill === 'serve')).toBe(true);
  });

  it('drops rallies without a known serve start zone while a zone is chosen', () => {
    expect(rallies(filter(['1', '9', '6', '7', '5']))).toEqual([1, 2, 4]);
  });

  it('is a context for the next skills of the chain', () => {
    const afterZone7 = chainFilter(index.entries, { chain: ['serve', 'receive'], attributes: { serve: { serveStartZones: ['7'] } } });
    expect(afterZone7.map((entry) => `${entry.rallyNumber}:${entry.skill}`).every((label) => label.startsWith('2:'))).toBe(true);
  });

  it('is off by default and with filters saved before the field existed', () => {
    const defaults = createDefaultVideoChainFilters();
    expect(isDefaultVideoChainFilters(defaults)).toBe(true);
    expect(isDefaultVideoChainFilters({ ...defaults, chain: ['serve'], attributes: { serve: { serveStartZones: ['9'] } } })).toBe(false);
    expect(isDefaultVideoChainFilters(toVideoChainFilters({ team: 'all', skills: [] }))).toBe(true);
  });
});

// Rally context: type, direction and receiver of the serve
const contextEvents = [
  touch(11, 1, 'away', 'serve', { startZoneCode: '9', endZoneCode: '5', serveType: 'Q' }),
  touch(11, 2, 'home', 'receive', { playerId: 'r1' }),
  touch(11, 3, 'home', 'attack'),
  point('home'),
  touch(12, 1, 'away', 'serve', { startZoneCode: '1', endZoneCode: '1', serveType: 'H' }),
  touch(12, 2, 'home', 'receive', { playerId: 'r2' }),
  point('away'),
  touch(13, 1, 'away', 'serve', { startZoneCode: '6' }),
  point('away'),
] as never;
const contextIndex = buildVideoEventIndex(contextEvents);
const contextRallies = (patch: Partial<VideoChainFilters>) => [
  ...new Set(chainFilter(contextIndex.entries, patch).map((entry) => entry.rallyNumber)),
];

describe('serve type, direction and receiver of a rally', () => {
  it('every touch of the rally carries them', () => {
    const rally11 = contextIndex.entries.filter((entry) => entry.rallyNumber === 11);
    expect(rally11.map((entry) => [entry.serveType, entry.serveTargetZone, entry.receiverPlayerId])).toEqual(
      [['jump_spin', '5', 'r1'], ['jump_spin', '5', 'r1'], ['jump_spin', '5', 'r1']],
    );
    expect(contextIndex.entries.find((entry) => entry.rallyNumber === 13)?.receiverPlayerId).toBeUndefined();
  });

  it('filters by serve type', () => {
    expect(contextRallies({ chain: ['serve'], attributes: { serve: { serveTypes: ['jump_spin'] } } })).toEqual([11]);
    expect(contextRallies({ chain: ['serve'], attributes: { serve: { serveTypes: ['float'] } } })).toEqual([12]);
    expect(contextRallies({ chain: ['serve'], attributes: { serve: { serveTypes: ['float', 'jump_spin'] } } })).toEqual([11, 12]);
  });

  it('filters by direction (the zone the serve went to)', () => {
    expect(contextRallies({ chain: ['serve'], attributes: { serve: { targetZones: ['5'] } } })).toEqual([11]);
    expect(contextRallies({ chain: ['receive'], attributes: { receive: { targetZones: ['1', '5'] } } })).toEqual([11, 12]);
  });

  it('filters by who received', () => {
    expect(contextRallies({ chain: ['receive'], attributes: { receive: { playerIds: ['r2'] } } })).toEqual([12]);
    expect(contextRallies({ chain: ['receive'], attributes: { receive: { playerIds: ['r1', 'r2'] } } })).toEqual([11, 12]);
  });

  it('chains the serve and the reception: attacks after a jump spin from 9 received by r1', () => {
    const chained = { chain: ['serve', 'receive', 'attack'], attributes: { serve: { serveStartZones: ['9'], serveTypes: ['jump_spin'] }, receive: { playerIds: ['r1'] } } } as Partial<VideoChainFilters>;
    expect(contextRallies(chained)).toEqual([11]);
    expect(contextRallies({ chain: ['serve'], attributes: { serve: { serveStartZones: ['9'], serveTypes: ['float'] } } })).toEqual([]);
  });
});
