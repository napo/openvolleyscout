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
}

const FRONT_ROW: ReadonlySet<number> = new Set([2, 3, 4]);

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

export function buildTouchCourtContext(events: readonly MatchEvent[]): Map<string, TouchCourtContext> {
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
          return { slots, setterId: lineup.setterPlayerId };
        };
        state = { home: fromLineup(event.homeLineup), away: fromLineup(event.awayLineup) };
        servingTeam = event.servingTeam;
        break;
      }
      case 'touch_recorded': {
        const { touch } = event;
        const side = state?.[touch.teamSide];
        const setterIndex = side?.setterId ? side.slots.indexOf(side.setterId) : -1;
        const recordedRotation = touch.teamSide === 'home' ? touch.homeSetterPosition : touch.awaySetterPosition;
        result.set(touch.id, {
          rotation: toPosition(setterIndex) ?? toPosition((recordedRotation ?? 0) - 1),
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
        if (state) replace(state[event.teamSide], event.playerOutId, event.playerInId);
        break;
      case 'setter_assigned':
        if (state) state[event.teamSide].setterId = event.setterPlayerId;
        break;
      default:
        break;
    }
  }
  return result;
}
