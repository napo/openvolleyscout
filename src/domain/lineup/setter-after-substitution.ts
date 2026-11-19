// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ActiveLineup } from './types';

/** Role of a player on the match roster ('setter', 'opposite', ...), when known. */
export type PlayerRoleLookup = (playerId: string) => string | undefined;

/**
 * Who is the setter once a substitution is made. A substitution only swaps the two players, so
 * the setter id has to follow:
 * - the setter stays while they are on court, unless a roster setter replaces a stand-in (a
 *   non-setter who took the setter's slot a substitution earlier);
 * - when the setter leaves, or the recorded setter is no longer on court (older matches), the
 *   roster setter now on court takes over, else the player who came in.
 *
 * The case this exists for is the setter-opposite double change (setter out for the opposite,
 * then the opposite out for the other setter): after the first change the incoming opposite
 * holds the setter's slot, and only the second change says who the setter really is.
 */
export function resolveSetterAfterSubstitution(input: {
  /** The lineup after the substitution (slots already updated). */
  lineup: Pick<ActiveLineup, 'setterPlayerId' | 'slots'>;
  playerOutId: string;
  playerInId: string;
  roleOf?: PlayerRoleLookup;
}): string | undefined {
  const { lineup, playerOutId, playerInId, roleOf } = input;
  const current = lineup.setterPlayerId;
  const onCourt = lineup.slots.filter((slot) => !slot.isLibero).map((slot) => slot.playerId);
  const isSetter = (playerId: string | undefined) => (playerId ? roleOf?.(playerId) === 'setter' : false);

  if (current && current !== playerOutId && onCourt.includes(current)) {
    return isSetter(playerInId) && !isSetter(current) ? playerInId : current;
  }

  if (isSetter(playerInId)) return playerInId;
  const rosterSetter = onCourt.find((playerId) => isSetter(playerId));
  if (rosterSetter) return rosterSetter;
  return current === playerOutId || !current || !onCourt.includes(current) ? playerInId : current;
}
