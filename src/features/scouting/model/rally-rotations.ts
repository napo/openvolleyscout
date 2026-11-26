// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSide } from '@src/domain/common/enums';
import { canonicalPointEventIds, createCourtOpsReader, type CourtOp } from '@src/domain/events/court-ops';
import type { MatchEvent } from '@src/domain/events/types';
import { createActiveLineup, type ActiveLineup } from '@src/domain/lineup';
import type { PlayerRoleLookup } from '@src/domain/lineup/setter-after-substitution';
import { applyLiberoReplacementToLineup, applyNormalSubstitutionToLineup } from './personnel';
import { rotateLineupBackward, rotateLineupForSideOut } from './rally-transition';
import type { RallyStats, RotationNumber } from './match-stats';

export type CourtLineups = Record<TeamSide, ActiveLineup | null>;

/**
 * One court operation (see domain/events/court-ops) on the active lineups, with the same personnel
 * rules as the live court. Score and serve operations leave the lineups as they are.
 */
export function applyCourtOpToLineups(lineups: CourtLineups, op: CourtOp, roleOf?: PlayerRoleLookup): CourtLineups {
  switch (op.kind) {
    case 'set_start':
      return {
        home: createActiveLineup(op.event.homeLineup, { servingTeam: op.event.servingTeam }),
        away: createActiveLineup(op.event.awayLineup, { servingTeam: op.event.servingTeam }),
      };
    case 'rotate': {
      const current = lineups[op.teamSide];
      if (!current) return lineups;
      return { ...lineups, [op.teamSide]: op.direction === 'forward' ? rotateLineupForSideOut(current) : rotateLineupBackward(current) };
    }
    case 'substitution': {
      const current = lineups[op.event.teamSide];
      if (!current) return lineups;
      return { ...lineups, [op.event.teamSide]: applyNormalSubstitutionToLineup(current, op.event, roleOf) ?? current };
    }
    case 'libero': {
      const current = lineups[op.event.teamSide];
      if (!current) return lineups;
      return { ...lineups, [op.event.teamSide]: applyLiberoReplacementToLineup(current, op.event) ?? current };
    }
    case 'setter': {
      const current = lineups[op.event.teamSide];
      if (!current) return lineups;
      return { ...lineups, [op.event.teamSide]: { ...current, setterPlayerId: op.event.setterPlayerId } };
    }
    default:
      return lineups;
  }
}

/** The rotation of a team: the court position of its setter. */
export function setterPositionOf(lineup: ActiveLineup | null): RotationNumber | undefined {
  if (!lineup?.setterPlayerId) return undefined;
  return lineup.slots.find((slot) => slot.playerId === lineup.setterPlayerId)?.courtPosition;
}

export type RallyRotations = ReadonlyMap<string, Partial<Record<TeamSide, RotationNumber>>>;

/** Setter positions before each rally, using the same personnel rules as the live court. */
export function buildRallyRotations(
  events: readonly MatchEvent[],
  roleOf?: PlayerRoleLookup,
  rallies: readonly RallyStats[] = [],
): RallyRotations {
  const result = new Map<string, Partial<Record<TeamSide, RotationNumber>>>();
  let lineups: CourtLineups = { home: null, away: null };
  const court = createCourtOpsReader();
  const canonicalPoints = canonicalPointEventIds(events);
  const points = new Set<string>();
  for (const event of events) {
    if (event.type === 'point_awarded') points.add(`${event.setNumber}:${event.rallyNumber}`);
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
    points.add(key);
    canonicalPoints.add(event.id);
    timeline.push({ event, order: lastTouch + 0.5 });
  }
  timeline.sort((left, right) => left.order - right.order);
  const snapshot = (setNumber: number, rallyNumber: number) => {
    const key = `${setNumber}:${rallyNumber}`;
    if (result.has(key)) return;
    const rotations: Partial<Record<TeamSide, RotationNumber>> = {};
    for (const side of ['home', 'away'] as const) {
      const position = setterPositionOf(lineups[side]);
      if (position) rotations[side] = position;
    }
    result.set(key, rotations);
  };

  for (const { event } of timeline) {
    if (event.type === 'touch_recorded') {
      snapshot(event.touch.setNumber, event.touch.rallyNumber);
      continue;
    }
    if (event.type === 'point_awarded') {
      // A rally keeps one point: the others in the log neither count nor rotate.
      if (!canonicalPoints.has(event.id)) continue;
      snapshot(event.setNumber, event.rallyNumber);
    }
    for (const op of court.read(event)) lineups = applyCourtOpToLineups(lineups, op, roleOf);
  }
  return result;
}
