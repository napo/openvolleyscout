// SPDX-License-Identifier: AGPL-3.0-or-later

/** How athlete lists are ordered wherever an athlete is chosen. */
export type PlayerSortKey = 'number' | 'lastName' | 'firstName' | 'rallies';

export const PLAYER_SORT_KEYS: readonly PlayerSortKey[] = ['number', 'lastName', 'firstName', 'rallies'];

export interface SortablePlayer {
  jerseyNumber?: number | string;
  firstName?: string;
  lastName?: string;
  /** Rallies in which the athlete touched the ball. */
  rallies?: number;
}

const STORAGE_KEY = 'ovs.playerSort';

export function readPlayerSort(): PlayerSortKey {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return PLAYER_SORT_KEYS.includes(stored as PlayerSortKey) ? (stored as PlayerSortKey) : 'number';
  } catch {
    return 'number';
  }
}

export function savePlayerSort(key: PlayerSortKey): void {
  try { window.localStorage.setItem(STORAGE_KEY, key); } catch { /* storage unavailable */ }
}

const jersey = (player: SortablePlayer) => {
  const value = Number(player.jerseyNumber);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};
const text = (value: string | undefined) => (value ?? '').trim().toLocaleLowerCase();

/** Sorted copy: by number, surname, first name, or most rallies first; ties fall back to the number. */
export function sortPlayers<T extends SortablePlayer>(players: readonly T[], key: PlayerSortKey): T[] {
  const byText = (pick: (player: T) => string | undefined) => (left: T, right: T) => {
    const a = text(pick(left));
    const b = text(pick(right));
    if (!a && b) return 1;
    if (a && !b) return -1;
    return a.localeCompare(b) || jersey(left) - jersey(right);
  };
  const compare = {
    number: (left: T, right: T) => jersey(left) - jersey(right),
    lastName: byText((player) => player.lastName),
    firstName: byText((player) => player.firstName),
    rallies: (left: T, right: T) => (right.rallies ?? 0) - (left.rallies ?? 0) || jersey(left) - jersey(right),
  }[key];
  return [...players].sort(compare);
}

/** Rallies in which each athlete touched the ball, by player id. */
export function countRalliesByPlayer(rallies: ReadonlyArray<{ touches: ReadonlyArray<{ playerId?: string }> }>): Map<string, number> {
  const counts = new Map<string, number>();
  rallies.forEach((rally) => {
    new Set(rally.touches.map((touch) => touch.playerId).filter((id): id is string => Boolean(id)))
      .forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  });
  return counts;
}
