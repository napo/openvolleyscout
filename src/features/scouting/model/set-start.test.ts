import { describe, expect, it } from 'vitest';
import type { Team } from '@src/domain/roster/types';
import { createEmptySetStartSetupState, validateSetStartSetup } from './set-start';

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
});
