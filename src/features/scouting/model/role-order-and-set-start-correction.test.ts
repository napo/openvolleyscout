import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { PlayerRole } from '@src/domain/systems';
import {
  createEmptyTeamSetSetupState,
  getRoleChangesFromPreviousSet,
  getRoleOrderMismatchPositions,
} from './set-start';
import { getCorrectableSetStart, replaceCurrentSetStart } from './next-set';

const { SETTER: S, OUTSIDE_HITTER_1: OH1, OUTSIDE_HITTER_2: OH2, MIDDLE_BLOCKER_1: MB1, MIDDLE_BLOCKER_2: MB2, OPPOSITE: OPP } = PlayerRole;

function setup(roles: PlayerRole[]) {
  const state = createEmptyTeamSetSetupState();
  roles.forEach((role, index) => {
    const position = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    state.slots[position] = `p${position}`;
    state.tacticalRoles[position] = role;
  });
  return state;
}

function lineup(roles: Record<string, PlayerRole>): StartingLineup {
  return {
    teamSide: 'home',
    displaySide: 'left',
    liberoPlayerIds: [],
    slots: Object.entries(roles).map(([playerId, tacticalRole], index) => ({
      courtPosition: (index + 1) as 1,
      playerId,
      tacticalRole,
    })),
  } as StartingLineup;
}

describe('role order check in the set setup', () => {
  it('accepts P-S-C from the setter, whatever OH1/OH2 or MB1/MB2 label is used', () => {
    expect(getRoleOrderMismatchPositions(setup([S, OH1, MB2, OPP, OH2, MB1]))).toEqual([]);
    expect(getRoleOrderMismatchPositions(setup([S, OH2, MB1, OPP, OH1, MB2]))).toEqual([]);
    expect(getRoleOrderMismatchPositions(setup([MB1, S, OH1, MB2, OPP, OH2]))).toEqual([]);
  });

  it('flags a middle and an outside hitter swapped (the reported second set)', () => {
    expect(getRoleOrderMismatchPositions(setup([S, MB2, OH1, OPP, OH2, MB1]))).toEqual([2, 3]);
  });

  it('follows the team role order when it is P-C-S', () => {
    const pcs = [S, MB2, OH1, OPP, MB1, OH2];
    expect(getRoleOrderMismatchPositions(setup([S, MB2, OH1, OPP, MB1, OH2]), pcs)).toEqual([]);
  });

  it('lists players who start in another kind of role than in the previous set', () => {
    const previous = lineup({ p1: MB1, p2: S, p3: OH1, p4: MB2, p5: OPP, p6: OH2 });
    const current = setup([S, MB2, OH1, OPP, OH2, MB1]);
    current.slots = { 1: 'p2', 2: 'p3', 3: 'p4', 4: 'p5', 5: 'p6', 6: 'p1' };
    expect(getRoleChangesFromPreviousSet(current, previous)).toEqual(['p3', 'p4']);
    expect(getRoleChangesFromPreviousSet(current, null)).toEqual([]);
  });
});

describe('correcting the starting lineup of the set under way', () => {
  const start = {
    id: 's2', type: 'set_started', setNumber: 2, createdAt: 1,
    homeLineup: lineup({ a: S }), awayLineup: lineup({ b: S }), servingTeam: 'home',
  } as unknown as MatchEvent;
  const liberoSwap = { id: 'l', type: 'libero_replacement_made', setNumber: 2, rallyNumber: 1, createdAt: 2 } as unknown as MatchEvent;
  const timeout = { id: 't', type: 'timeout_called', setNumber: 2, createdAt: 3 } as unknown as MatchEvent;
  const rally = { id: 'r', type: 'rally_started', setNumber: 2, createdAt: 4 } as unknown as MatchEvent;

  it('is possible before the first rally, keeping the event id and dropping lineup-dependent events', () => {
    const log = [start, liberoSwap, timeout];
    expect(getCorrectableSetStart(log)?.setNumber).toBe(2);
    const next = replaceCurrentSetStart(log, {
      homeStartingLineup: lineup({ c: S }), awayStartingLineup: lineup({ b: S }), servingTeam: 'away',
    });
    expect(next?.map((event) => event.id)).toEqual(['s2', 't']);
    const corrected = next?.[0] as Extract<MatchEvent, { type: 'set_started' }>;
    expect(corrected.servingTeam).toBe('away');
    expect(corrected.homeLineup.slots[0].playerId).toBe('c');
  });

  it('is not possible once a rally has started', () => {
    expect(getCorrectableSetStart([start, rally])).toBeNull();
    expect(replaceCurrentSetStart([start, rally], {
      homeStartingLineup: lineup({ c: S }), awayStartingLineup: lineup({ b: S }), servingTeam: 'home',
    })).toBeNull();
  });
});
