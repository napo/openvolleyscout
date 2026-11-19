// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  computeSideOutDistribution,
  createDefaultSideOutStudyFilters,
  extractSideOutSequences,
  filterSideOutSequences,
  type SideOutStudyFilters,
} from './sideout-distribution';

let n = 0;
function touch(teamSide: 'home' | 'away', skill: string, sequenceNumber: number, extra: Record<string, unknown> = {}) {
  n += 1;
  return { id: `t${n}`, setNumber: 1, rallyNumber: 1, sequenceNumber, teamSide, skill, evaluation: '+', createdAt: n, ...extra };
}

/** Home serves, away receives, sets and attacks. */
function rally(rallyNumber: number, serveExtra: Record<string, unknown>, receiveExtra: Record<string, unknown> = {}, attackZone = '4') {
  return {
    setNumber: 1, rallyNumber, servingTeam: 'home', pointWinner: 'away',
    touches: [
      touch('home', 'serve', 1, { rallyNumber, ...serveExtra }),
      touch('away', 'receive', 2, { rallyNumber, playerId: 'r1', ...receiveExtra }),
      touch('away', 'set', 3, { rallyNumber, playerId: 's1' }),
      touch('away', 'attack', 4, { rallyNumber, startZoneCode: attackZone, playerId: 'a1' }),
    ],
  };
}

const rallies = [
  rally(1, { startZoneCode: '9', endZoneCode: '5', serveType: 'Q' }),
  rally(2, { startZoneCode: '1', endZoneCode: '1', serveType: 'H' }, { playerId: 'r2' }),
  rally(3, { startZoneCode: '7', endZoneCode: '6', serveType: 'M' }),
  rally(4, {}, { startZoneCode: '5', endZoneCode: '6' }),
  rally(5, { startZoneCode: '6' }),
] as never;
const sequences = extractSideOutSequences(rallies);
const withFilters = (changes: Partial<SideOutStudyFilters>) => ({ ...createDefaultSideOutStudyFilters('away'), ...changes });
const kept = (changes: Partial<SideOutStudyFilters>) => filterSideOutSequences(sequences, withFilters(changes)).map((sequence) => sequence.rallyNumber);

describe('side-out study serve filters', () => {
  it('everything passes by default', () => {
    expect(kept({})).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps the serve that answers each reception', () => {
    expect(sequences.map((sequence) => sequence.serve?.startZoneCode)).toEqual(['9', '1', '7', undefined, '6']);
  });

  it('filters by serve start zone, reading the reception when the serve has none', () => {
    expect(kept({ serveStartZones: ['9'] })).toEqual([1]);
    expect(kept({ serveStartZones: ['9', '7'] })).toEqual([1, 3]);
    expect(kept({ serveStartZones: ['5'] })).toEqual([4]);
    expect(kept({ serveStartZones: ['6'] })).toEqual([5]);
  });

  it('filters by serve type group (spin, jump float, float)', () => {
    expect(kept({ serveTypes: ['jump_spin'] })).toEqual([1]);
    expect(kept({ serveTypes: ['float'] })).toEqual([2]);
    expect(kept({ serveTypes: ['jump_float'] })).toEqual([3]);
    expect(kept({ serveTypes: ['other'] })).toEqual([4, 5]);
  });

  it('filters by direction: the zone the serve was received in, else the serve end zone', () => {
    expect(kept({ receptionZones: ['5'] })).toEqual([1]);
    expect(kept({ receptionZones: ['6'] })).toEqual([3, 4]);
    expect(kept({ receptionZones: ['1'] })).toEqual([2]);
  });

  it('filters by the player who received', () => {
    expect(kept({ receiverPlayerId: 'r2' })).toEqual([2]);
    expect(kept({ receiverPlayerId: 'r1' })).toEqual([1, 3, 4, 5]);
  });

  it('combines the filters and feeds the distribution', () => {
    expect(kept({ serveStartZones: ['9', '7'], receptionZones: ['6'] })).toEqual([3]);
    const result = computeSideOutDistribution(sequences, withFilters({ serveStartZones: ['9', '7'] }));
    expect(result.totalSets).toBe(2);
  });

  it('filters built before these fields existed still keep everything', () => {
    const legacy = { ...withFilters({}) } as Partial<SideOutStudyFilters>;
    delete legacy.serveStartZones;
    delete legacy.serveTypes;
    delete legacy.receptionZones;
    delete legacy.receiverPlayerId;
    expect(filterSideOutSequences(sequences, legacy as SideOutStudyFilters)).toHaveLength(5);
  });
});
