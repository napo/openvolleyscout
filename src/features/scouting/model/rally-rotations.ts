// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { createActiveLineup, type ActiveLineup } from '@src/domain/lineup';
import type { PlayerRoleLookup } from '@src/domain/lineup/setter-after-substitution';
import { applyLiberoReplacementToLineup, applyNormalSubstitutionToLineup } from './personnel';
import { rotateLineupBackward, rotateLineupForSideOut } from './rally-transition';
import type { RallyStats, RotationNumber } from './match-stats';

export type RallyRotations = ReadonlyMap<string, Partial<Record<TeamSide, RotationNumber>>>;

/** Setter positions before each rally, using the same personnel rules as the live court. */
export function buildRallyRotations(
  events: readonly MatchEvent[],
  roleOf?: PlayerRoleLookup,
  rallies: readonly RallyStats[] = [],
): RallyRotations {
  const result = new Map<string, Partial<Record<TeamSide, RotationNumber>>>();
  let lineups: Record<TeamSide, ActiveLineup | null> = { home: null, away: null };
  let servingTeam: TeamSide | null = null;
  const points = new Map<string, Extract<MatchEvent, { type: 'point_awarded' }>>();
  for (const event of events) {
    if (event.type !== 'point_awarded') continue;
    const key = `${event.setNumber}:${event.rallyNumber}`;
    if ((points.get(key)?.createdAt ?? -Infinity) <= event.createdAt) points.set(key, event);
  }
  // Older imports may end rallies with a terminal touch alone. Apply that
  // derived point immediately after the last touch, before any substitutions.
  const lastTouchOrder = new Map<string, number>();
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()];
  const timeline = uniqueEvents.map((event, order) => {
    if (event.type === 'touch_recorded') lastTouchOrder.set(`${event.touch.setNumber}:${event.touch.rallyNumber}`, order);
    return { event, order };
  });
  for (const rally of rallies) {
    const key = `${rally.setNumber}:${rally.rallyNumber}`;
    const lastTouch = lastTouchOrder.get(key);
    if (!rally.pointWinner || points.has(key) || lastTouch === undefined) continue;
    const event: Extract<MatchEvent, { type: 'point_awarded' }> = {
      id: `derived-rotation-${key}`, type: 'point_awarded', createdAt: 0,
      setNumber: rally.setNumber, rallyNumber: rally.rallyNumber, teamSide: rally.pointWinner,
    };
    points.set(key, event);
    timeline.push({ event, order: lastTouch + 0.5 });
  }
  timeline.sort((left, right) => left.order - right.order);
  const snapshot = (setNumber: number, rallyNumber: number) => {
    const key = `${setNumber}:${rallyNumber}`;
    if (result.has(key)) return;
    const rotations: Partial<Record<TeamSide, RotationNumber>> = {};
    for (const side of ['home', 'away'] as const) {
      const lineup = lineups[side];
      const position = lineup?.slots.find((slot) => slot.playerId === lineup.setterPlayerId)?.courtPosition;
      if (position) rotations[side] = position;
    }
    result.set(key, rotations);
  };

  for (const { event } of timeline) {
    switch (event.type) {
      case 'set_started':
        servingTeam = event.servingTeam;
        lineups = {
          home: createActiveLineup(event.homeLineup, { servingTeam }),
          away: createActiveLineup(event.awayLineup, { servingTeam }),
        };
        break;
      case 'substitution_made':
      case 'libero_replacement_made': {
        const current = lineups[event.teamSide];
        if (current) lineups[event.teamSide] = (event.type === 'substitution_made'
          ? applyNormalSubstitutionToLineup(current, event, roleOf)
          : applyLiberoReplacementToLineup(current, event)) ?? current;
        break;
      }
      case 'setter_assigned': {
        const current = lineups[event.teamSide];
        if (current) lineups[event.teamSide] = { ...current, setterPlayerId: event.setterPlayerId };
        break;
      }
      case 'touch_recorded':
        snapshot(event.touch.setNumber, event.touch.rallyNumber);
        break;
      case 'point_awarded':
      case 'red_card_point': {
        if (event.type === 'point_awarded') {
          if (points.get(`${event.setNumber}:${event.rallyNumber}`)?.id !== event.id) break;
          snapshot(event.setNumber, event.rallyNumber);
        }
        const skip = event.type === 'point_awarded' && event.skipRotation;
        const current = lineups[event.teamSide];
        if (current && servingTeam && servingTeam !== event.teamSide && !skip) {
          lineups[event.teamSide] = rotateLineupForSideOut(current);
        }
        servingTeam = event.teamSide;
        break;
      }
      case 'manual_correction': {
        const current = lineups[event.teamSide];
        if (current && event.correction === 'rotation_forward') lineups[event.teamSide] = rotateLineupForSideOut(current);
        if (current && event.correction === 'rotation_backward') lineups[event.teamSide] = rotateLineupBackward(current);
        if (event.correction === 'serve_assigned') servingTeam = event.teamSide;
        break;
      }
      default:
        break;
    }
  }
  return result;
}
