import { describe, expect, it } from 'vitest';
import { PlayerRole } from '@src/domain/systems';
import type { Team } from '@src/domain/roster/types';
import {
  createEmptySetStartSetupState,
  getUnconfirmedAutoLiberoMiddles,
  rotateTeamSetSetupClockwise,
  rotateTeamSetSetupCounterClockwise,
  validateSetStartSetup,
} from './set-start';

function team(name: string, prefix: string): Team {
  return {
    id: prefix,
    name,
    players: Array.from({ length: 8 }, (_, index) => ({
      id: `${prefix}-${index + 1}`,
      jerseyNumber: index + 1,
      firstName: '',
      lastName: '',
    })),
  } as unknown as Team;
}

describe('set start with an incomplete lineup', () => {
  const teams = { home: team('Home', 'h'), away: team('Away', 'a') };

  it('accepts empty positions: they are filled by jersey number during the set', () => {
    const state = createEmptySetStartSetupState();
    state.servingTeam = 'home';
    ([1, 2, 3, 4, 5, 6] as const).forEach((position) => {
      state.home.slots[position] = `h-${position}`;
    });
    state.away.slots[1] = 'a-1';
    state.away.slots[2] = 'a-2';

    const result = validateSetStartSetup(state, teams);
    expect(result.awayIssues).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('still requires a role for every player on court', () => {
    const state = createEmptySetStartSetupState();
    state.servingTeam = 'home';
    ([1, 2, 3, 4, 5, 6] as const).forEach((position) => {
      state.home.slots[position] = `h-${position}`;
    });
    state.away.slots[1] = 'a-1';
    state.away.tacticalRoles[1] = '';

    expect(validateSetStartSetup(state, teams).awayIssues).toContain('missingTacticalRoles');
  });

  it('rotates lineup forward (clockwise) and backward (counter-clockwise) according to volleyball rules', () => {
    const state = createEmptySetStartSetupState();
    ([1, 2, 3, 4, 5, 6] as const).forEach((position) => {
      state.home.slots[position] = `h-${position}`;
    });

    const forward = rotateTeamSetSetupClockwise(state.home);
    expect(forward.slots).toEqual({
      1: 'h-2',
      2: 'h-3',
      3: 'h-4',
      4: 'h-5',
      5: 'h-6',
      6: 'h-1',
    });

    const back = rotateTeamSetSetupCounterClockwise(forward);
    expect(back.slots).toEqual(state.home.slots);
  });
});

describe('libero middles not confirmed by the roster', () => {
  function setup() {
    const home = team('Home', 'h');
    const state = createEmptySetStartSetupState().home;
    const roles = [
      PlayerRole.MIDDLE_BLOCKER_1, PlayerRole.SETTER, PlayerRole.OUTSIDE_HITTER_1,
      PlayerRole.MIDDLE_BLOCKER_2, PlayerRole.OPPOSITE, PlayerRole.OUTSIDE_HITTER_2,
    ];
    ([1, 2, 3, 4, 5, 6] as const).forEach((position, index) => {
      state.slots[position] = `h-${position}`;
      state.tacticalRoles[position] = roles[index];
    });
    state.liberoPlayerIds = ['h-7'];
    state.liberoAutoMiddleReplacement = true;
    return { home, state };
  }

  it('lists the assumed middles when the roster gives no roles', () => {
    const { home, state } = setup();
    expect(getUnconfirmedAutoLiberoMiddles(state, home)).toEqual(['h-1', 'h-4']);
  });

  it('stays quiet when the roster confirms them, or without the automatic libero', () => {
    const { home, state } = setup();
    home.players[0].role = 'middle_blocker';
    home.players[3].role = 'middle_blocker';
    expect(getUnconfirmedAutoLiberoMiddles(state, home)).toEqual([]);

    const other = setup();
    other.state.liberoAutoMiddleReplacement = false;
    expect(getUnconfirmedAutoLiberoMiddles(other.state, other.home)).toEqual([]);
  });
});
