// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import { isStandInSetterThisBreak } from './personnel';

const sub = (teamSide: 'home' | 'away', playerOutId: string, playerInId: string) => ({ id: `s${playerInId}`, type: 'substitution_made', teamSide, playerOutId, playerInId, setNumber: 1, createdAt: 1 }) as unknown as MatchEvent;
const marker = (type: string) => ({ id: type, type, createdAt: 1 }) as unknown as MatchEvent;

describe('isStandInSetterThisBreak', () => {
  it('is true when the setter came in during the current break (setter-opposite double change)', () => {
    expect(isStandInSetterThisBreak([marker('rally_ended'), sub('away', 'S1', 'O2')], 'away', 'O2')).toBe(true);
  });

  it('is false once a rally started after that change', () => {
    expect(isStandInSetterThisBreak([sub('away', 'S1', 'O2'), marker('rally_started')], 'away', 'O2')).toBe(false);
    expect(isStandInSetterThisBreak([sub('away', 'S1', 'O2'), marker('touch_recorded')], 'away', 'O2')).toBe(false);
  });

  it('only counts the same team and the same player', () => {
    expect(isStandInSetterThisBreak([sub('home', 'S1', 'O2')], 'away', 'O2')).toBe(false);
    expect(isStandInSetterThisBreak([sub('away', 'S1', 'O2')], 'away', 'S3')).toBe(false);
    expect(isStandInSetterThisBreak([sub('away', 'S1', 'O2')], 'away', undefined)).toBe(false);
  });

  it('looks past other dead-ball events of the break', () => {
    expect(isStandInSetterThisBreak([sub('away', 'S1', 'O2'), marker('timeout_called'), marker('libero_replacement_made')], 'away', 'O2')).toBe(true);
  });
});
