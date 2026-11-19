// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ArchivedPlayer } from '@src/domain/team/types';

export type TeamFormData = {
  id: string | null;
  name: string;
  staff: {
    headCoach: string;
    assistantCoach: string;
  };
  players: ArchivedPlayer[];
  createdAt: number;
  updatedAt: number;
};

export type TeamFieldError = Record<string, string>;

export const createEmptyTeamForm = (): TeamFormData => ({
  id: null,
  name: '',
  staff: { headCoach: '', assistantCoach: '' },
  players: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/** Field errors keyed `teamName` and `player_<index>_jersey`; messages come from the caller's translator. */
export function validateTeamForm(
  form: Pick<TeamFormData, 'name' | 'players'>,
  t: (key: 'teamNameRequired' | 'jerseyNumberRequired') => string,
): TeamFieldError {
  const errors: TeamFieldError = {};
  if (!form.name.trim()) errors.teamName = t('teamNameRequired');
  form.players.forEach((player, index) => {
    if (!player.jerseyNumber || player.jerseyNumber <= 0) {
      errors[`player_${index}_jersey`] = t('jerseyNumberRequired');
    }
  });
  return errors;
}
