// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { replayLiveMatchFromEvents } from './replay';

const roles: Record<string, string> = { S1: 'setter', S2: 'setter', O1: 'opposite', O2: 'opposite', H1: 'outside_hitter', H2: 'outside_hitter', M1: 'middle_blocker', M2: 'middle_blocker' };
const roleOf = (id: string) => roles[id];

const lineup = (teamSide: 'home' | 'away', prefix: string, setterPlayerId: string, ids: string[]): StartingLineup => ({
  teamSide, setterPlayerId, liberoPlayerIds: [], displaySide: teamSide === 'home' ? 'right' : 'left',
  slots: ids.map((playerId, index) => ({ courtPosition: (index + 1) as 1, playerId: playerId.startsWith('x') ? `${prefix}${playerId}` : playerId })),
});

// Away: setter S1 at P1, opposite O1 at P4.
const setStarted: MatchEvent = {
  id: 'set', type: 'set_started', setNumber: 1, createdAt: 1, servingTeam: 'home',
  homeLineup: lineup('home', 'h', 'xS', ['xS', 'xA', 'xB', 'xC', 'xD', 'xE']),
  awayLineup: lineup('away', 'a', 'S1', ['S1', 'H1', 'M1', 'O1', 'H2', 'M2']),
} as never;
const sub = (id: string, playerOutId: string, playerInId: string, rallyNumber = 1): MatchEvent => ({
  id, type: 'substitution_made', createdAt: 2, setNumber: 1, rallyNumber, teamSide: 'away', playerOutId, playerInId, canReenterOnlyForPlayerId: playerInId, hasReentered: false,
} as never);

const replay = (events: MatchEvent[], withRoles = true) => replayLiveMatchFromEvents('m', [setStarted, ...events], withRoles ? roleOf : undefined);

describe('setter after a double change (setter out for the opposite, opposite out for the other setter)', () => {
  const events = [sub('s1', 'S1', 'O2'), sub('s2', 'O1', 'S2')];

  it('the incoming setter is the setter once both changes are made', () => {
    const live = replay(events)!;
    const away = live.awayActiveLineup!;
    expect(away.slots.map((slot) => `${slot.courtPosition}:${slot.playerId}`)).toEqual(['1:O2', '2:H1', '3:M1', '4:S2', '5:H2', '6:M2']);
    expect(away.setterPlayerId).toBe('S2');
  });

  it('after the first change alone the incoming opposite holds the setter job until the second', () => {
    expect(replay([events[0]])!.awayActiveLineup!.setterPlayerId).toBe('O2');
  });

  it('a like-for-like change hands the job to the incoming setter', () => {
    expect(replay([sub('s1', 'S1', 'S2')])!.awayActiveLineup!.setterPlayerId).toBe('S2');
  });

  it('someone else leaving does not move the setter', () => {
    expect(replay([sub('s1', 'O1', 'O2')])!.awayActiveLineup!.setterPlayerId).toBe('S1');
  });

  it('without roles the setter who leaves is replaced by the player who comes in (never left stale)', () => {
    expect(replay([events[0]], false)!.awayActiveLineup!.setterPlayerId).toBe('O2');
  });
});
