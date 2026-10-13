import { generateDefenseRotation, generateReceptionRotation, ROLE_ORDER_SEQUENCES, type RoleOrder } from '@src/domain/systems/formations';
import type {
  DefenseSystemContexts,
  PlayerRole,
  ReceptionRotationSystem,
} from '@src/domain/systems/types';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFENSE_CONTEXTS, DEFENSE_ROTATIONS } from './defense-defaults';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK, RECEPTION_ROTATIONS } from './reception-defaults';

/**
 * Starting points for new systems, after Click&Scout's preconfigured
 * reception schemes (three receivers; the opposite receives or not) in both
 * role orders. Users then drag the markers to draw their own.
 */
export interface ReceptionSystemPreset {
  id: string;
  order: RoleOrder;
  oppositeReceives: boolean;
}

export const RECEPTION_SYSTEM_PRESET_OPTIONS: readonly ReceptionSystemPreset[] = [
  { id: 'psc-base', order: 'PSC', oppositeReceives: false },
  { id: 'psc-opposite-receives', order: 'PSC', oppositeReceives: true },
  { id: 'pcs-base', order: 'PCS', oppositeReceives: false },
  { id: 'pcs-opposite-receives', order: 'PCS', oppositeReceives: true },
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
  if (preset.order === 'PSC' && !preset.oppositeReceives) {
    return DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.map((rotation) => ({
      rotation: rotation.rotation,
      positions: rotation.positions.map((position) => ({ ...position })),
    }));
  }

  const roleSequence = ROLE_ORDER_SEQUENCES[preset.order];
  return RECEPTION_ROTATIONS.map((rotation) => ({
    rotation,
    positions: generateReceptionRotation(roleSequence, rotation, { oppositeReceives: preset.oppositeReceives }),
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
