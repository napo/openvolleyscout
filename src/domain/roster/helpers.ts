import type { Player } from './types';

// Placeholder values such as "---", ". " or "#12" carry no real name.
function hasNameText(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return /[\p{L}\p{N}]/u.test(trimmed) && !/^#\d+$/.test(trimmed);
}

/** True when the player has any real name; jersey-only players return false. */
export function hasPlayerName(player: Pick<Player, 'firstName' | 'lastName' | 'displayName'> | null | undefined): boolean {
  if (!player) return false;
  return hasNameText(player.displayName) || hasNameText(player.firstName) || hasNameText(player.lastName);
}

export function getPlayerDisplayName(player: Player | null | undefined): string {
  if (!player) return '';

  if (hasNameText(player.displayName)) return player.displayName!.trim();

  const fullName = [player.firstName, player.lastName]
    .map((s) => s?.trim())
    .filter(hasNameText)
    .join(' ');
  if (fullName) return fullName;

  const shortName = player.shortName?.trim();
  if (hasNameText(shortName)) return shortName!;

  const playerCode = player.playerCode?.trim();
  if (hasNameText(playerCode)) return playerCode!;

  // Jersey-only players (names to be filled in later) are shown by number.
  return player.jerseyNumber ? `#${player.jerseyNumber}` : '';
}

/** "#12 Name", or just "#12" when the name is missing or is the number itself. */
export function formatPlayerLabel(jerseyNumber: number | string | undefined, name: string | undefined): string {
  const number = `#${jerseyNumber ?? ''}`;
  const trimmedName = name?.trim() ?? '';
  return trimmedName && trimmedName !== number ? `${number} ${trimmedName}` : number;
}
