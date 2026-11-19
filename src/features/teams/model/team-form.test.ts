// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ArchivedPlayer } from '@src/domain/team/types';
import { createEmptyTeamForm, validateTeamForm } from './team-form';

const t = (key: string) => `msg:${key}`;
const player = (jerseyNumber: number) => ({ jerseyNumber }) as ArchivedPlayer;

describe('validateTeamForm', () => {
  it('accepts a named team with valid jerseys', () => {
    expect(validateTeamForm({ name: 'Alpha', players: [player(1), player(12)] }, t)).toEqual({});
  });

  it('flags a blank name and each missing or non-positive jersey by index', () => {
    expect(validateTeamForm({ name: '  ', players: [player(3), player(0), player(-2)] }, t)).toEqual({
      teamName: 'msg:teamNameRequired',
      player_1_jersey: 'msg:jerseyNumberRequired',
      player_2_jersey: 'msg:jerseyNumberRequired',
    });
  });
});

describe('createEmptyTeamForm', () => {
  it('starts empty and unsaved', () => {
    const form = createEmptyTeamForm();
    expect(form.id).toBeNull();
    expect(form.players).toEqual([]);
  });
});
