// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { resolveSetterAfterSubstitution } from './setter-after-substitution';

const roles: Record<string, string> = { S1: 'setter', S2: 'setter', O1: 'opposite', O2: 'opposite', H1: 'outside_hitter', M1: 'middle_blocker', L1: 'libero' };
const roleOf = (id: string) => roles[id];
const slots = (...ids: string[]) => ids.map((playerId, index) => ({ courtPosition: (index + 1) as 1, playerId }));

describe('resolveSetterAfterSubstitution', () => {
  it('keeps the setter when someone else is substituted', () => {
    expect(resolveSetterAfterSubstitution({ lineup: { setterPlayerId: 'S1', slots: slots('S1', 'H1', 'M1', 'O2') }, playerOutId: 'O1', playerInId: 'O2', roleOf })).toBe('S1');
  });

  it('hands the job to the incoming setter when the setter is substituted by a setter', () => {
    expect(resolveSetterAfterSubstitution({ lineup: { setterPlayerId: 'S1', slots: slots('S2', 'H1', 'M1', 'O1') }, playerOutId: 'S1', playerInId: 'S2', roleOf })).toBe('S2');
  });

  it('setter out for the opposite, then opposite out for the other setter: the second change settles it', () => {
    // After the first change the opposite O2 holds the setter slot.
    const afterFirst = resolveSetterAfterSubstitution({ lineup: { setterPlayerId: 'S1', slots: slots('O2', 'H1', 'M1', 'O1') }, playerOutId: 'S1', playerInId: 'O2', roleOf });
    expect(afterFirst).toBe('O2');
    // O1 (the opposite) leaves for the setter S2: the stand-in O2 is not the setter any more.
    const afterSecond = resolveSetterAfterSubstitution({ lineup: { setterPlayerId: afterFirst, slots: slots('O2', 'H1', 'M1', 'S2') }, playerOutId: 'O1', playerInId: 'S2', roleOf });
    expect(afterSecond).toBe('S2');
  });

  it('takes the roster setter on court when the recorded one is no longer there (older matches)', () => {
    expect(resolveSetterAfterSubstitution({ lineup: { setterPlayerId: 'S1', slots: slots('O2', 'H1', 'M1', 'S2') }, playerOutId: 'O1', playerInId: 'H1', roleOf })).toBe('S2');
  });

  it('without roles the player who comes in replaces a setter who leaves', () => {
    expect(resolveSetterAfterSubstitution({ lineup: { setterPlayerId: 'S1', slots: slots('O2', 'H1', 'M1', 'O1') }, playerOutId: 'S1', playerInId: 'O2' })).toBe('O2');
    expect(resolveSetterAfterSubstitution({ lineup: { setterPlayerId: 'S1', slots: slots('S1', 'H1', 'M1', 'O2') }, playerOutId: 'O1', playerInId: 'O2' })).toBe('S1');
  });

  it('never picks the libero', () => {
    const withLibero = [...slots('O2', 'H1', 'M1'), { courtPosition: 5 as const, playerId: 'L1', isLibero: true }];
    expect(resolveSetterAfterSubstitution({ lineup: { setterPlayerId: 'S1', slots: withLibero }, playerOutId: 'S1', playerInId: 'O2', roleOf })).toBe('O2');
  });
});
