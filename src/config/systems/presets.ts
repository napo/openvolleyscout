import { getNearestDataVolleyZone } from '@src/domain/systems/datavolley-zones';
import { generateDefenseRotation, generateReceptionRotation, ROLE_ORDER_SEQUENCES, type RoleOrder } from '@src/domain/systems/formations';
import {
  PlayerRole,
  type DefenseSystemContexts,
  type ReceptionPosition,
  type ReceptionRotationSystem,
} from '@src/domain/systems/types';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFENSE_CONTEXTS, DEFENSE_ROTATIONS } from './defense-defaults';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK, RECEPTION_ROTATIONS } from './reception-defaults';

/**
 * Starting points for new systems: three receivers (the two outside hitters
 * and the libero; the opposite never receives) in both role orders, plus the
 * P-S-C "P1 special". Users then drag the markers to draw their own.
 */
export interface ReceptionSystemPreset {
  id: string;
  order: RoleOrder;
  /** P-S-C only: setter rotation 1 in the "P1 special" formation. */
  p1Special?: boolean;
}

export const RECEPTION_SYSTEM_PRESET_OPTIONS: readonly ReceptionSystemPreset[] = [
  { id: 'psc-base', order: 'PSC' },
  { id: 'psc-p1-special', order: 'PSC', p1Special: true },
  { id: 'pcs-base', order: 'PCS' },
];

function createReceptionPosition(role: PlayerRole, x: number, y: number): ReceptionPosition {
  return { role, dataVolleyZone: getNearestDataVolleyZone(x, y), x, y };
}

/**
 * "P1 special" (P-S-C, setter in 1), similar to P4: the opposite and the
 * middle wait at the net in zone 4, the outside hitter in position 2 receives
 * on the left, so the receivers are, left to right, S1, S2 and the libero;
 * the setter penetrates from behind the libero, as in the base P1.
 */
export const P1_SPECIAL_RECEPTION_POSITIONS: readonly ReceptionPosition[] = [
  createReceptionPosition(PlayerRole.OPPOSITE, 6, 10),
  createReceptionPosition(PlayerRole.MIDDLE_BLOCKER_2, 14, 12),
  createReceptionPosition(PlayerRole.OUTSIDE_HITTER_1, 22, 55),
  createReceptionPosition(PlayerRole.OUTSIDE_HITTER_2, 50, 60),
  createReceptionPosition(PlayerRole.MIDDLE_BLOCKER_1, 78, 60),
  createReceptionPosition(PlayerRole.SETTER, 90, 72),
];

export interface DefenseSystemPreset {
  id: string;
  order: RoleOrder;
}

export const DEFENSE_SYSTEM_PRESET_OPTIONS: readonly DefenseSystemPreset[] = [
  { id: 'psc-base', order: 'PSC' },
  { id: 'pcs-base', order: 'PCS' },
];

export function getRoleSequenceForOrder(order: RoleOrder): PlayerRole[] {
  return [...ROLE_ORDER_SEQUENCES[order]];
}

export function createReceptionRotationsForPreset(preset: ReceptionSystemPreset): ReceptionRotationSystem[] {
  // The hand-drawn base system is kept as the P-S-C starting point.
  if (preset.order === 'PSC') {
    return DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.map((rotation) => ({
      rotation: rotation.rotation,
      positions: (preset.p1Special && rotation.rotation === 1 ? P1_SPECIAL_RECEPTION_POSITIONS : rotation.positions)
        .map((position) => ({ ...position })),
    }));
  }

  const roleSequence = ROLE_ORDER_SEQUENCES[preset.order];
  return RECEPTION_ROTATIONS.map((rotation) => ({
    rotation,
    positions: generateReceptionRotation(roleSequence, rotation),
  }));
}

export function createDefenseContextsForPreset(preset: DefenseSystemPreset): DefenseSystemContexts {
  if (preset.order === 'PSC') {
    return {
      break_point: DEFAULT_DEFENSE_SYSTEM_BLOCK.contexts.break_point.map((rotation) => ({
        rotation: rotation.rotation,
        positions: rotation.positions.map((position) => ({ ...position })),
      })),
      side_out: DEFAULT_DEFENSE_SYSTEM_BLOCK.contexts.side_out.map((rotation) => ({
        rotation: rotation.rotation,
        positions: rotation.positions.map((position) => ({ ...position })),
      })),
    };
  }

  const roleSequence = ROLE_ORDER_SEQUENCES[preset.order];
  const createContext = () => DEFENSE_ROTATIONS.map((rotation) => ({
    rotation,
    positions: generateDefenseRotation(roleSequence, rotation),
  }));
  return Object.fromEntries(DEFENSE_CONTEXTS.map((context) => [context, createContext()])) as DefenseSystemContexts;
}
