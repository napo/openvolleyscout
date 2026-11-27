// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildVideoEventIndex } from './video-event-index';
import {
  annotateVideoEntries,
  applyVideoChainFilters,
  availableCombinationCodes,
  availableSetterCalls,
  createDefaultVideoChainFilters,
  type VideoChainFilters,
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

const events = [
  // rally 1: set on K1, then a quick X5 attack (lower-case letter as some files write it)
  touch(1, 1, 'away', 'serve'),
  touch(1, 2, 'home', 'receive'),
  touch(1, 3, 'home', 'set', { setterCallCode: 'K1' }),
  touch(1, 4, 'home', 'attack', { combinationCode: 'X5', attackType: 'q' }),
  point('home'),
  // rally 2: older data with the call only in the set's combination field, high ball V5
  touch(2, 1, 'away', 'serve'),
  touch(2, 2, 'home', 'receive'),
  touch(2, 3, 'home', 'set', { combinationCode: 'K2' }),
  touch(2, 4, 'home', 'attack', { combinationCode: 'V5', attackType: 'H' }),
  point('away'),
  // rally 3: no set recorded, the attack carries the call in its combination field
  touch(3, 1, 'away', 'serve'),
  touch(3, 2, 'home', 'receive'),
  touch(3, 3, 'home', 'attack', { combinationCode: 'K3', skillTypeCode: 'T' }),
  point('home'),
] as never;

const entries = buildVideoEventIndex(events).entries;
const items = annotateVideoEntries(entries);
const filter = (patch: Partial<VideoChainFilters>) => applyVideoChainFilters(items, { ...createDefaultVideoChainFilters(), ...patch });
const itemOf = (rally: number, skill: string) => items.find((item) => item.entry.rallyNumber === rally && item.entry.skill === skill)!;

describe('Base, Combination and Set type of video actions', () => {
  it('reads the Base from the set and the combination and set type from the attack', () => {
    expect(itemOf(1, 'attack')).toMatchObject({ setterCall: 'K1', combinationCode: 'X5', attack: { ballType: 'Q' } });
    expect(itemOf(1, 'set').setterCall).toBe('K1');
    expect(itemOf(1, 'set').combinationCode).toBeUndefined();
    expect(itemOf(1, 'set').attack).toBeUndefined();
  });

  it('reads older data: a K code in the combination field is a Base, never a combination', () => {
    expect(itemOf(2, 'set').setterCall).toBe('K2');
    expect(itemOf(2, 'attack')).toMatchObject({ setterCall: 'K2', combinationCode: 'V5', attack: { ballType: 'H' } });
    expect(itemOf(3, 'attack')).toMatchObject({ setterCall: 'K3', combinationCode: null, attack: { ballType: 'T' } });
    expect(itemOf(1, 'serve').setterCall).toBeUndefined();
  });

  it('offers the Base codes of sets and attacks and the combinations of attacks', () => {
    expect(availableSetterCalls(items)).toEqual(['K1', 'K2', 'K3']);
    expect(availableCombinationCodes(items)).toEqual(['V5', 'X5']);
  });

  it('crosses the three filters with AND on the attack card, ignoring case', () => {
    const rallies = (patch: Partial<VideoChainFilters>) => filter(patch).map((entry) => entry.rallyNumber);
    expect(rallies({ chain: ['attack'], attributes: { attack: { setterCalls: ['K1'] } } })).toEqual([1]);
    expect(rallies({ chain: ['attack'], attributes: { attack: { combinationCodes: ['x5'] } } })).toEqual([1]);
    expect(rallies({ chain: ['attack'], attributes: { attack: { setterCalls: ['K1'], combinationCodes: ['V5'] } } })).toEqual([]);
    expect(rallies({ chain: ['attack'], attributes: { attack: { attackBallTypes: ['Q', 'T'] } } })).toEqual([1, 3]);
    expect(rallies({ chain: ['attack'], attributes: { attack: { attackBallTypes: ['H'], setterCalls: ['K2'] } } })).toEqual([2]);
    // An attack without a combination does not pass a Combination filter.
    expect(rallies({ chain: ['attack'], attributes: { attack: { combinationCodes: ['X5', 'V5'] } } })).toEqual([1, 2]);
  });

  it('filters sets by Base, and a chain set then attack by both cards', () => {
    expect(filter({ chain: ['set'], attributes: { set: { setterCalls: ['K2'] } } }).map((entry) => entry.rallyNumber)).toEqual([2]);
    const chained = filter({ chain: ['set', 'attack'], attributes: { set: { setterCalls: ['K1', 'K2'] }, attack: { attackBallTypes: ['H'] } } });
    expect(chained.map((entry) => [entry.rallyNumber, entry.skill])).toEqual([[2, 'attack']]);
  });
});
