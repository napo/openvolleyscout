// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Experimental: guess who attacked from where the attack trajectory starts.
 * The guess is the attacking team's court player closest to the start point,
 * skipping liberos and players excluded by the double-contact rule. The scout
 * confirms it by entering the evaluation, or taps another player to change it.
 */
import type { CourtCoordinate } from './rally-flow';
import type { TacticalCourtPlayer } from '../tactical/positioning/tactical-position-resolver';

export function predictAttackerPlayerId(input: {
  players: readonly TacticalCourtPlayer[];
  attackStart: CourtCoordinate | null | undefined;
  excludedPlayerIds?: readonly string[];
}): string | null {
  if (!input.attackStart) return null;
  const { x, y } = input.attackStart;
  let best: { playerId: string; distance: number } | null = null;
  for (const player of input.players) {
    if (player.isLibero || input.excludedPlayerIds?.includes(player.playerId)) continue;
    const distance = Math.hypot(player.x - x, player.y - y);
    if (!best || distance < best.distance) best = { playerId: player.playerId, distance };
  }
  return best?.playerId ?? null;
}
