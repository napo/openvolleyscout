import { PlayerRole, type PlayingSystem } from '@src/domain/systems/types';

export const DEFAULT_PLAYING_SYSTEM_ID = 'default-playing-system';

export const DEFAULT_ROLE_SEQUENCE: PlayerRole[] = [
  PlayerRole.SETTER,
  PlayerRole.OUTSIDE_HITTER_1,
  PlayerRole.MIDDLE_BLOCKER_2,
  PlayerRole.OPPOSITE,
  PlayerRole.OUTSIDE_HITTER_2,
  PlayerRole.MIDDLE_BLOCKER_1,
];

export const DEFAULT_PLAYING_SYSTEM: PlayingSystem = {
  id: DEFAULT_PLAYING_SYSTEM_ID,
  roleSequence: DEFAULT_ROLE_SEQUENCE,
};
