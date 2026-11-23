// SPDX-License-Identifier: AGPL-3.0-or-later
import { PlayerRole, type ReceptionRotation, type ReceptionRotationSystem } from '@src/domain/systems/types';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from './reception-defaults';

type LegacyPosition = readonly [role: PlayerRole, x: number, y: number];

/**
 * Rotations of the base reception system as earlier releases shipped them.
 * The app keeps a saved copy of the base system, so later fixes never reached
 * it: a saved rotation that still equals one of these is upgraded to the
 * current base rotation when the systems are loaded.
 * - before 0.7.0: rotation 3 had MB1 receiving in zone 6 and MB2 at the net in 2,
 *   so a libero replacing MB2 was drawn as a front-row player.
 * - before the October 2026 overlap check: rotations 4 and 6 were positional faults.
 */
const LEGACY_BASE_RECEPTION_ROTATIONS: ReadonlyArray<{ rotation: ReceptionRotation; positions: readonly LegacyPosition[] }> = [
  {
    rotation: 3,
    positions: [
      [PlayerRole.MIDDLE_BLOCKER_1, 50.8462, 67.9087],
      [PlayerRole.MIDDLE_BLOCKER_2, 77, 22.3558],
      [PlayerRole.OPPOSITE, 73, 81.25],
      [PlayerRole.OUTSIDE_HITTER_1, 24.2308, 57.6923],
      [PlayerRole.OUTSIDE_HITTER_2, 75.1539, 59.0144],
      [PlayerRole.SETTER, 51.1538, 9.976],
    ],
  },
  {
    rotation: 4,
    positions: [
      [PlayerRole.MIDDLE_BLOCKER_1, 12.6923, 24.1587],
      [PlayerRole.MIDDLE_BLOCKER_2, 84.0769, 58.0529],
      [PlayerRole.OPPOSITE, 83.6154, 86.7789],
      [PlayerRole.OUTSIDE_HITTER_1, 54.5385, 63.8221],
      [PlayerRole.OUTSIDE_HITTER_2, 24.8462, 58.6538],
      [PlayerRole.SETTER, 5.7692, 6.4904],
    ],
  },
  {
    rotation: 6,
    positions: [
      [PlayerRole.MIDDLE_BLOCKER_1, 50.2308, 66.3462],
      [PlayerRole.MIDDLE_BLOCKER_2, 82.8462, 25],
      [PlayerRole.OPPOSITE, 50.8462, 7.0913],
      [PlayerRole.OUTSIDE_HITTER_1, 80.0769, 58.5337],
      [PlayerRole.OUTSIDE_HITTER_2, 20.5385, 61.0577],
      [PlayerRole.SETTER, 46.6923, 19.4712],
    ],
  },
];

const samePoint = (left: number, right: number) => Math.abs(left - right) < 0.001;

function isLegacyBaseRotation(rotation: ReceptionRotationSystem): boolean {
  return LEGACY_BASE_RECEPTION_ROTATIONS.some((legacy) => (
    legacy.rotation === rotation.rotation
    && legacy.positions.length === rotation.positions.length
    && legacy.positions.every(([role, x, y]) => rotation.positions.some((position) => (
      position.role === role && samePoint(position.x, x) && samePoint(position.y, y)
    )))
  ));
}

/** Replaces untouched rotations of an old base reception system with the current ones. */
export function upgradeLegacyBaseReceptionRotations(
  rotations: readonly ReceptionRotationSystem[],
): ReceptionRotationSystem[] {
  return rotations.map((rotation) => {
    if (!isLegacyBaseRotation(rotation)) {
      return rotation;
    }
    const current = DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.find((entry) => entry.rotation === rotation.rotation);
    return current
      ? { rotation: rotation.rotation, positions: current.positions.map((position) => ({ ...position })) }
      : rotation;
  });
}

/** Rotations of `rotations` that differ from the current base system (role and position). */
export function getRotationsDifferentFromBase(rotations: readonly ReceptionRotationSystem[]): ReceptionRotation[] {
  return DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations
    .filter((base) => {
      const saved = rotations.find((rotation) => rotation.rotation === base.rotation);
      if (!saved || saved.positions.length !== base.positions.length) return true;
      return base.positions.some((position) => !saved.positions.some((other) => (
        other.role === position.role && samePoint(other.x, position.x) && samePoint(other.y, position.y)
      )));
    })
    .map((base) => base.rotation);
}
