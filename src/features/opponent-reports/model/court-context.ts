/**
 * Court context of every touch: the team's rotation (setter position) and
 * the court position (1-6) of the player who touched the ball, rebuilt from
 * the event log: starting lineups, side-out rotations, substitutions,
 * libero exchanges and the scorer's manual rotation corrections. Same
 * rules as the DataVolley export, which writes these positions on every row.
 * Pure module.
 */
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';

export type CourtPosition = 1 | 2 | 3 | 4 | 5 | 6;

export interface TouchCourtContext {
  /** Rotation of the touching team = its setter's court position; null when unknown. */
  rotation: CourtPosition | null;
  /** Setter assigned to the touching team at this point, when known. */
  setterPlayerId: string | null;
  /** Court position of the touching player; null when not on the lineup (unknown, or not tracked). */
  playerPosition: CourtPosition | null;
  /** Players on court for the touching team, index 0..5 = positions 1..6 (libero included); null when unknown. */
  lineup: ReadonlyArray<string | undefined> | null;
}

interface SideState {
  /** Index 0..5 = court positions 1..6. */
  slots: Array<string | undefined>;
  setterId?: string;
  setterIds: Set<string>;
  nonSetterIds: ReadonlySet<string>;
}

const FRONT_ROW: ReadonlySet<number> = new Set([2, 3, 4]);

export function collectSetterPlayerIds(
  events: readonly MatchEvent[],
  rosterSetterIds: Iterable<string>,
  teamSide: TeamSide,
  nonSetterPlayerIds: ReadonlySet<string> = new Set(),
): ReadonlySet<string> {
  const canBeSetter = (playerId: string | undefined): playerId is string => Boolean(
    playerId && !nonSetterPlayerIds.has(playerId),
  );
  const setterIds = new Set(
    [...rosterSetterIds].filter((playerId) => canBeSetter(playerId)),
  );
  for (const event of events) {
    if (event.type === 'set_started') {
      const lineup = event.homeLineup.teamSide === teamSide ? event.homeLineup
        : event.awayLineup.teamSide === teamSide ? event.awayLineup
          : null;
      if (canBeSetter(lineup?.setterPlayerId)) setterIds.add(lineup!.setterPlayerId!);
    } else if (event.type === 'setter_assigned' && event.teamSide === teamSide) {
      if (canBeSetter(event.setterPlayerId)) setterIds.add(event.setterPlayerId);
    } else if (event.type === 'touch_recorded') {
      const setterId = teamSide === 'home'
        ? event.touch.homeSetterPlayerId
        : event.touch.awaySetterPlayerId;
      if (canBeSetter(setterId)) setterIds.add(setterId);
    }
  }
  let addedSetter = true;
  while (addedSetter) {
    addedSetter = false;
    for (const event of events) {
      if (
        event.type === 'substitution_made'
        && event.teamSide === teamSide
        && setterIds.has(event.playerOutId)
        && canBeSetter(event.playerInId)
        && !setterIds.has(event.playerInId)
      ) {
        setterIds.add(event.playerInId);
        addedSetter = true;
      }
    }
  }
  return setterIds;
}

export function isFrontRow(position: CourtPosition | null): boolean {
  return position !== null && FRONT_ROW.has(position);
}

function toPosition(index: number): CourtPosition | null {
  return index >= 0 && index < 6 ? (index + 1) as CourtPosition : null;
}

/** Side-out rotation: the player in 2 goes to 1, and so on. */
function rotate(state: SideState, direction: 'forward' | 'backward'): void {
  const shift = direction === 'forward' ? 1 : 5;
  state.slots = state.slots.map((_, index) => state.slots[(index + shift) % 6]);
}

function replace(state: SideState, outId: string, inId: string): void {
  const index = state.slots.indexOf(outId);
  if (index >= 0) state.slots[index] = inId;
}

export function buildTouchCourtContext(
  events: readonly MatchEvent[],
  setterPlayerIds: Record<TeamSide, ReadonlySet<string>> = { home: new Set(), away: new Set() },
  nonSetterPlayerIds: Record<TeamSide, ReadonlySet<string>> = { home: new Set(), away: new Set() },
): Map<string, TouchCourtContext> {
  const result = new Map<string, TouchCourtContext>();
  let state: Record<TeamSide, SideState> | null = null;
  let servingTeam: TeamSide | null = null;

  for (const event of events) {
    switch (event.type) {
      case 'set_started': {
        const fromLineup = (lineup: typeof event.homeLineup): SideState => {
          const slots: Array<string | undefined> = new Array(6).fill(undefined);
          lineup.slots.forEach((slot) => {
            if (slot.courtPosition >= 1 && slot.courtPosition <= 6) slots[slot.courtPosition - 1] = slot.playerId;
          });
          const nonSetterIds = nonSetterPlayerIds[lineup.teamSide];
          const setterIds = new Set(
            [...setterPlayerIds[lineup.teamSide]].filter((playerId) => !nonSetterIds.has(playerId)),
          );
          const activeSetterId = lineup.setterPlayerId
            && slots.includes(lineup.setterPlayerId)
            && !nonSetterIds.has(lineup.setterPlayerId)
            ? lineup.setterPlayerId
            : slots.find((playerId) => playerId && setterIds.has(playerId));
          if (activeSetterId) setterIds.add(activeSetterId);
          return { slots, setterId: activeSetterId, setterIds, nonSetterIds };
        };
        state = { home: fromLineup(event.homeLineup), away: fromLineup(event.awayLineup) };
        servingTeam = event.servingTeam;
        break;
      }
      case 'touch_recorded': {
        const { touch } = event;
        const side = state?.[touch.teamSide];
        const canBeSetter = (playerId: string | undefined): playerId is string => Boolean(
          playerId && !side?.nonSetterIds.has(playerId),
        );
        const recordedRotation = touch.teamSide === 'home' ? touch.homeSetterPosition : touch.awaySetterPosition;
        const explicitSetterId = touch.teamSide === 'home' ? touch.homeSetterPlayerId : touch.awaySetterPlayerId;
        const slotSetterId = recordedRotation !== undefined && recordedRotation >= 1 && recordedRotation <= 6
          ? side?.slots[recordedRotation - 1]
          : undefined;
        // Older archived imports retained pre-link IDs on touches. Only use an
        // explicit identity that can be resolved on this lineup; otherwise use P.
        const recordedSetterId = (canBeSetter(explicitSetterId) && (!side || side.slots.includes(explicitSetterId)) ? explicitSetterId : undefined)
          ?? (canBeSetter(slotSetterId) ? slotSetterId : undefined);
        if (recordedSetterId && side) {
          side.setterId = recordedSetterId;
          side.setterIds.add(recordedSetterId);
        }
        if (side && (!side.setterId || !side.slots.includes(side.setterId) || !canBeSetter(side.setterId))) {
          side.setterId = side.slots.find((playerId) => canBeSetter(playerId) && side.setterIds.has(playerId))
            ?? side.slots.find((playerId) => canBeSetter(playerId));
        }
        const setterIndex = side?.setterId ? side.slots.indexOf(side.setterId) : -1;
        result.set(touch.id, {
          rotation: toPosition((recordedRotation ?? 0) - 1) ?? toPosition(setterIndex),
          setterPlayerId: side?.setterId ?? null,
          playerPosition: side && touch.playerId ? toPosition(side.slots.indexOf(touch.playerId)) : null,
          lineup: side ? [...side.slots] : null,
        });
        break;
      }
      case 'point_awarded':
      case 'red_card_point': {
        const skip = event.type === 'point_awarded' && event.skipRotation;
        if (state && servingTeam && servingTeam !== event.teamSide && !skip) rotate(state[event.teamSide], 'forward');
        servingTeam = event.teamSide;
        break;
      }
      case 'manual_correction':
        if (!state) break;
        if (event.correction === 'rotation_forward') rotate(state[event.teamSide], 'forward');
        else if (event.correction === 'rotation_backward') rotate(state[event.teamSide], 'backward');
        else if (event.correction === 'serve_assigned') servingTeam = event.teamSide;
        break;
      case 'substitution_made':
      case 'libero_replacement_made':
        if (state) {
          const side = state[event.teamSide];
          const wasActiveSetter = side.setterId === event.playerOutId;
          replace(side, event.playerOutId, event.playerInId);
          if (!side.nonSetterIds.has(event.playerInId) && (wasActiveSetter || side.setterIds.has(event.playerInId))) {
            if (wasActiveSetter || !side.setterId || !side.slots.includes(side.setterId)) {
              side.setterId = event.playerInId;
            }
            side.setterIds.add(event.playerInId);
          } else if (wasActiveSetter || !side.slots.includes(side.setterId ?? '')) {
            side.setterId = side.slots.find(
              (playerId) => playerId && !side.nonSetterIds.has(playerId) && side.setterIds.has(playerId),
            );
          }
        }
        break;
      case 'setter_assigned':
        if (state) {
          const side = state[event.teamSide];
          if (!side.nonSetterIds.has(event.setterPlayerId)) {
            side.setterIds.add(event.setterPlayerId);
          }
          side.setterId = side.slots.includes(event.setterPlayerId) && !side.nonSetterIds.has(event.setterPlayerId)
            ? event.setterPlayerId
            : side.slots.find((playerId) => playerId && !side.nonSetterIds.has(playerId) && side.setterIds.has(playerId));
        }
        break;
      default:
        break;
    }
  }
  return result;
}
