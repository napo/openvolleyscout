import type { Player } from './types';

export function getPlayerDisplayName(player: Player | null | undefined): string {
  if (!player) return '';

  if (player.displayName?.trim()) return player.displayName.trim();

  const fullName = [player.firstName, player.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ');
  if (fullName) return fullName;

  const shortName = player.shortName?.trim();
  if (shortName) return shortName;

  return player.playerCode?.trim() || '';
}
