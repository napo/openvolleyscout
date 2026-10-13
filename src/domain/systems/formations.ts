/**
 * Formations: role order (P-S-C / P-C-S), the positional-fault check for
 * reception and the generators behind the preset systems.
 *
 * Coordinates are the half-court percentages used by the systems editor:
 * x grows from zone 4 (left) to zone 2 (right), y grows from the net (0) to
 * the end line.
 */
import type { CourtPosition } from '../common/enums';
import { getDataVolleyZoneCoordinate, getNearestDataVolleyZone } from './datavolley-zones';
import {
  PlayerRole,
  type DefensePosition,
  type DefenseRotation,
  type ReceptionPosition,
  type ReceptionRotation,
} from './types';

/**
 * Role order read from the setter towards the next server: P-S-C means the
 * outside hitter is in position 2 and the middle blocker in 3 when the setter
 * serves (setter rotation 1); P-C-S swaps them.
 */
export type RoleOrder = 'PSC' | 'PCS';

/** Roles by court position 1..6 in setter rotation 1 (setter in position 1). */
export const ROLE_ORDER_SEQUENCES: Readonly<Record<RoleOrder, readonly PlayerRole[]>> = {
  PSC: [
    PlayerRole.SETTER,
    PlayerRole.OUTSIDE_HITTER_1,
    PlayerRole.MIDDLE_BLOCKER_2,
    PlayerRole.OPPOSITE,
    PlayerRole.OUTSIDE_HITTER_2,
    PlayerRole.MIDDLE_BLOCKER_1,
  ],
  PCS: [
    PlayerRole.SETTER,
    PlayerRole.MIDDLE_BLOCKER_1,
    PlayerRole.OUTSIDE_HITTER_1,
    PlayerRole.OPPOSITE,
    PlayerRole.MIDDLE_BLOCKER_2,
    PlayerRole.OUTSIDE_HITTER_2,
  ],
};

const OUTSIDE_HITTERS = new Set<PlayerRole>([PlayerRole.OUTSIDE_HITTER_1, PlayerRole.OUTSIDE_HITTER_2]);
const MIDDLE_BLOCKERS = new Set<PlayerRole>([PlayerRole.MIDDLE_BLOCKER_1, PlayerRole.MIDDLE_BLOCKER_2]);

export function getRoleOrder(roleSequence: readonly PlayerRole[]): RoleOrder | null {
  if (OUTSIDE_HITTERS.has(roleSequence[1]) && MIDDLE_BLOCKERS.has(roleSequence[2])) return 'PSC';
  if (MIDDLE_BLOCKERS.has(roleSequence[1]) && OUTSIDE_HITTERS.has(roleSequence[2])) return 'PCS';
  return null;
}

const COURT_POSITIONS: readonly CourtPosition[] = [1, 2, 3, 4, 5, 6];
const FRONT_ROW = new Set<CourtPosition>([2, 3, 4]);
/** Front-row position → the back-row position it must stay in front of. */
const COUNTERPARTS: ReadonlyArray<readonly [CourtPosition, CourtPosition]> = [[2, 1], [3, 6], [4, 5]];
/** Left-to-right order each row must keep. */
const ROW_ORDERS: ReadonlyArray<readonly [CourtPosition, CourtPosition, CourtPosition]> = [[4, 3, 2], [5, 6, 1]];
const COLUMN_X: Record<CourtPosition, number> = { 1: 82, 2: 82, 3: 50, 4: 18, 5: 18, 6: 50 };

/**
 * Court position of every role when the setter is in `setterRotation`.
 * Side-out rotation moves each player from position p to p-1 (1 → 6).
 */
export function getRoleCourtPositions(
  roleSequence: readonly PlayerRole[],
  setterRotation: ReceptionRotation,
): Map<PlayerRole, CourtPosition> {
  const rotations = (1 - setterRotation + 6) % 6;
  const positions = new Map<PlayerRole, CourtPosition>();
  roleSequence.slice(0, 6).forEach((role, index) => {
    positions.set(role, ((((index - rotations) % 6) + 6) % 6 + 1) as CourtPosition);
  });
  return positions;
}

export type OverlapFault =
  | { kind: 'depth'; front: CourtPosition; back: CourtPosition }
  | { kind: 'lateral'; left: CourtPosition; right: CourtPosition };

type Point = { x: number; y: number };

function checkPoints(points: ReadonlyMap<CourtPosition, Point>): OverlapFault[] {
  const faults: OverlapFault[] = [];
  COUNTERPARTS.forEach(([front, back]) => {
    const frontPoint = points.get(front);
    const backPoint = points.get(back);
    if (frontPoint && backPoint && !(frontPoint.y < backPoint.y)) {
      faults.push({ kind: 'depth', front, back });
    }
  });
  ROW_ORDERS.forEach((row) => {
    for (let index = 0; index < row.length - 1; index += 1) {
      const left = points.get(row[index]);
      const right = points.get(row[index + 1]);
      if (left && right && !(left.x < right.x)) {
        faults.push({ kind: 'lateral', left: row[index], right: row[index + 1] });
      }
    }
  });
  return faults;
}

/**
 * Positional faults (overlap rule) of a reception formation at serve time.
 * The back-row middle blocker's marker stands for the libero replacing them,
 * who is bound by the same rule.
 */
export function getReceptionOverlapFaults(
  roleSequence: readonly PlayerRole[],
  rotation: ReceptionRotation,
  positions: readonly Pick<ReceptionPosition, 'role' | 'x' | 'y'>[],
): OverlapFault[] {
  const courtPositions = getRoleCourtPositions(roleSequence, rotation);
  const points = new Map<CourtPosition, Point>();
  positions.forEach((position) => {
    const courtPosition = courtPositions.get(position.role);
    if (courtPosition) points.set(courtPosition, { x: position.x, y: position.y });
  });
  return checkPoints(points);
}

export interface ReceptionFormationOptions {
  /**
   * When true the opposite receives instead of the front-row outside hitter
   * (Click&Scout "3 players, the opposite receives"); otherwise the two
   * outside hitters and the libero receive.
   */
  oppositeReceives: boolean;
}

const RECEIVER_X_CANDIDATES = [20, 35, 50, 65, 80] as const;
const IDEAL_RECEIVER_LINE = [20, 50, 80] as const;
const FRONT_RECEIVER_Y = 52;
const BACK_RECEIVER_Y = 62;
const NET_Y = 14;
const SETTER_NET_Y = 10;
const DEEP_Y = 86;
const GAP = 6;

function getReceivers(
  roleAt: ReadonlyMap<CourtPosition, PlayerRole>,
  options: ReceptionFormationOptions,
): CourtPosition[] {
  return COURT_POSITIONS.filter((position) => {
    const role = roleAt.get(position);
    if (!role || role === PlayerRole.SETTER) return false;
    const isFront = FRONT_ROW.has(position);
    if (MIDDLE_BLOCKERS.has(role)) return !isFront;
    if (role === PlayerRole.OPPOSITE) return options.oppositeReceives;
    // Outside hitters: the front-row one stays out when the opposite receives.
    return !(options.oppositeReceives && isFront);
  });
}

function getCounterpart(position: CourtPosition): CourtPosition {
  const pair = COUNTERPARTS.find(([front, back]) => front === position || back === position)!;
  return pair[0] === position ? pair[1] : pair[0];
}

/** Moves players the least needed to remove positional faults. */
function repair(points: Map<CourtPosition, Point>, receivers: ReadonlySet<CourtPosition>): void {
  for (let pass = 0; pass < 12 && checkPoints(points).length > 0; pass += 1) {
    COUNTERPARTS.forEach(([front, back]) => {
      const frontPoint = points.get(front)!;
      const backPoint = points.get(back)!;
      if (frontPoint.y + GAP > backPoint.y) {
        // Push back whoever is not receiving; receivers keep their line.
        if (!receivers.has(back) || receivers.has(front)) backPoint.y = frontPoint.y + GAP;
        else frontPoint.y = backPoint.y - GAP;
      }
    });
    ROW_ORDERS.forEach(([left, center, right]) => {
      const leftPoint = points.get(left)!;
      const centerPoint = points.get(center)!;
      const rightPoint = points.get(right)!;
      if (leftPoint.x + GAP > centerPoint.x) centerPoint.x = leftPoint.x + GAP;
      if (centerPoint.x + GAP > rightPoint.x) {
        if (centerPoint.x + GAP <= 96) rightPoint.x = centerPoint.x + GAP;
        else centerPoint.x = rightPoint.x - GAP;
      }
      if (leftPoint.x + GAP > centerPoint.x) leftPoint.x = centerPoint.x - GAP;
    });
  }
}

function getReceiverSlotOptions(count: number): number[][] {
  const options: number[][] = [];
  const pick = (chosen: number[]) => {
    if (chosen.length === count) {
      options.push(chosen);
      return;
    }
    RECEIVER_X_CANDIDATES.forEach((x) => {
      if (!chosen.includes(x)) pick([...chosen, x]);
    });
  };
  pick([]);
  return options;
}

function placeFormation(
  roleAt: ReadonlyMap<CourtPosition, PlayerRole>,
  receivers: readonly CourtPosition[],
  slots: readonly number[],
): Map<CourtPosition, Point> {
  const points = new Map<CourtPosition, Point>();
  let setterPosition: CourtPosition | null = null;

  COURT_POSITIONS.forEach((position) => {
    const role = roleAt.get(position)!;
    const isFront = FRONT_ROW.has(position);
    const receiverIndex = receivers.indexOf(position);
    if (receiverIndex >= 0) {
      points.set(position, { x: slots[receiverIndex], y: isFront ? FRONT_RECEIVER_Y : BACK_RECEIVER_Y });
    } else if (role === PlayerRole.SETTER && !isFront) {
      setterPosition = position;
    } else {
      // Front-row non-receivers wait at the net; a back-row opposite who does
      // not receive stays deep behind the receivers.
      points.set(position, {
        x: COLUMN_X[position],
        y: isFront ? (role === PlayerRole.SETTER ? SETTER_NET_Y : NET_Y) : DEEP_Y,
      });
    }
  });

  // A back-row setter hides right behind (and to the right of) the front-row
  // player in their column, ready to penetrate to the net.
  if (setterPosition !== null) {
    const counterpart = points.get(getCounterpart(setterPosition))!;
    points.set(setterPosition, { x: Math.min(94, counterpart.x + 8), y: counterpart.y + GAP + 2 });
  }

  return points;
}

/** A legal three-receiver formation for one setter rotation. */
export function generateReceptionRotation(
  roleSequence: readonly PlayerRole[],
  rotation: ReceptionRotation,
  options: ReceptionFormationOptions,
): ReceptionPosition[] {
  const courtPositions = getRoleCourtPositions(roleSequence, rotation);
  const roleAt = new Map<CourtPosition, PlayerRole>([...courtPositions].map(([role, position]) => [position, role]));
  const receivers = getReceivers(roleAt, options);
  const receiverSet = new Set(receivers);

  let best: { points: Map<CourtPosition, Point>; cost: number } | null = null;
  getReceiverSlotOptions(receivers.length).forEach((slots) => {
    const targets = placeFormation(roleAt, receivers, slots);
    const points = new Map([...targets].map(([position, point]) => [position, { ...point }]));
    repair(points, receiverSet);
    if (checkPoints(points).length > 0) return;

    const finalReceiverX = receivers.map((position) => points.get(position)!.x).sort((left, right) => left - right);
    // Prefer a receiving line spread over the court, then receivers near their
    // own column, then the smallest repairs.
    const cost = finalReceiverX.reduce((sum, x, index) => sum + 3 * Math.abs(x - (IDEAL_RECEIVER_LINE[index] ?? x)), 0)
      + receivers.reduce((sum, position) => sum + Math.abs(points.get(position)!.x - COLUMN_X[position]), 0)
      + COURT_POSITIONS.reduce((sum, position) => {
        const point = points.get(position)!;
        const target = targets.get(position)!;
        return sum + Math.abs(point.x - target.x) + Math.abs(point.y - target.y);
      }, 0);
    if (!best || cost < best.cost) best = { points, cost };
  });

  const chosen = (best as { points: Map<CourtPosition, Point> } | null)?.points;
  if (!chosen) {
    throw new Error(`No legal reception formation for rotation ${rotation}`);
  }

  return roleSequence.slice(0, 6).map((role) => {
    const point = chosen.get(courtPositions.get(role)!)!;
    const x = round(point.x);
    const y = round(point.y);
    return { role, dataVolleyZone: getNearestDataVolleyZone(x, y), x, y };
  });
}

function round(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/**
 * Standard defensive positions after the switches: front row opposite (or
 * setter) right, middle blocker centre, outside hitter left; back row setter
 * (or opposite) right, outside hitter centre, libero (back-row middle) left.
 * Only the role order changes which player is where, so this serves both
 * P-S-C and P-C-S.
 */
export function generateDefenseRotation(
  roleSequence: readonly PlayerRole[],
  rotation: DefenseRotation,
): DefensePosition[] {
  const courtPositions = getRoleCourtPositions(roleSequence, rotation);
  return roleSequence.slice(0, 6).map((role) => {
    const isFront = FRONT_ROW.has(courtPositions.get(role)!);
    const dataVolleyZone = MIDDLE_BLOCKERS.has(role)
      ? (isFront ? '3b' : '7a')
      : OUTSIDE_HITTERS.has(role)
        ? (isFront ? '4b' : '6b')
        : (isFront ? '2b' : '9a');
    return { role, dataVolleyZone, ...getDataVolleyZoneCoordinate(dataVolleyZone) };
  });
}
