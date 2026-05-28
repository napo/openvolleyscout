import type { Player } from './types';

export function getPlayerDisplayName(player: Player | null | undefined): string {
  if (!player) {
    return '';
  }

  return player.displayName
    || player.shortName
    || [player.firstName, player.lastName].filter(Boolean).join(' ')
    || player.playerCode;
}
