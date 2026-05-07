import { create } from 'zustand';
import { DEFAULT_DEFENSE_FALLBACK_ZONE, DEFENSE_ROTATIONS } from '@src/config/systems';
import {
  createDefaultDefenseContextSystems,
  createDefaultDefenseRotationSystem,
  createDefaultDefenseSystemBlock,
  getDataVolleyZoneCoordinate,
  getNearestDataVolleyZone,
  PlayerRole,
  type DefenseContext,
  type DefensePosition,
  type DefenseRotation,
  type DefenseRotationSystem,
  type DefenseSystemBlock,
  type DefenseSystemContexts,
} from '@src/domain/systems';

const DEFENSE_SYSTEM_BLOCK_STORAGE_KEY = 'openvolleyscout.defenseSystemBlocks';
const DEFAULT_DEFENSE_SYSTEM_BLOCK_ID = 'defense-system-block-default';

const LEGACY_ROLE_MAP: Record<string, PlayerRole> = {
  P: PlayerRole.SETTER,
  S: PlayerRole.SETTER,
  O: PlayerRole.OPPOSITE,
  S1: PlayerRole.OUTSIDE_HITTER_1,
  OH1: PlayerRole.OUTSIDE_HITTER_1,
  S2: PlayerRole.OUTSIDE_HITTER_2,
  OH2: PlayerRole.OUTSIDE_HITTER_2,
  C1: PlayerRole.MIDDLE_BLOCKER_1,
  M1: PlayerRole.MIDDLE_BLOCKER_1,
  C2: PlayerRole.MIDDLE_BLOCKER_2,
  M2: PlayerRole.MIDDLE_BLOCKER_2,
  L: PlayerRole.LIBERO,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeRole(value: unknown): PlayerRole | null {
  if (typeof value !== 'string') {
    return null;
  }

  return Object.values(PlayerRole).includes(value as PlayerRole)
    ? value as PlayerRole
    : LEGACY_ROLE_MAP[value] ?? null;
}

function normalizeRotation(value: unknown): DefenseRotation | null {
  const numericRotation = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/^[PS]/i, ''))
      : Number.NaN;

  if (!Number.isInteger(numericRotation)) {
    return null;
  }

  return DEFENSE_ROTATIONS.includes(numericRotation as DefenseRotation)
    ? numericRotation as DefenseRotation
    : null;
}

function normalizeRoleSequence(value: unknown): PlayerRole[] {
  if (!Array.isArray(value)) {
    return createDefaultDefenseSystemBlock().roleSequence;
  }

  const roles = value
    .map(normalizeRole)
    .filter((role): role is PlayerRole => Boolean(role));

  return roles.length > 0 ? roles : createDefaultDefenseSystemBlock().roleSequence;
}

function normalizeDefensePosition(value: unknown): DefensePosition | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = normalizeRole(value.role);
  if (!role) {
    return null;
  }

  const x = typeof value.x === 'number' ? value.x : null;
  const y = typeof value.y === 'number' ? value.y : null;
  const dataVolleyZone = typeof value.dataVolleyZone === 'string'
    ? value.dataVolleyZone
      : typeof value.zone === 'string'
        ? value.zone
      : x !== null && y !== null
        ? getNearestDataVolleyZone(x, y)
        : DEFAULT_DEFENSE_FALLBACK_ZONE;
  const coordinate = getDataVolleyZoneCoordinate(dataVolleyZone);

  return {
    role,
    dataVolleyZone,
    x: x ?? coordinate.x,
    y: y ?? coordinate.y,
  };
}

function normalizeDefenseRotationSystem(value: unknown, context: DefenseContext): DefenseRotationSystem | null {
  if (!isRecord(value)) {
    return null;
  }

  const rotation = normalizeRotation(value.rotation);
  if (!rotation) {
    return null;
  }

  const positions = Array.isArray(value.positions)
    ? value.positions
        .map(normalizeDefensePosition)
        .filter((position): position is DefensePosition => Boolean(position))
    : [];

  return {
    rotation,
    positions: positions.length > 0
      ? positions
      : createDefaultDefenseRotationSystem(rotation, context).positions,
  };
}

function completeDefenseRotationSystems(
  rotations: readonly DefenseRotationSystem[],
  context: DefenseContext,
): DefenseRotationSystem[] {
  return DEFENSE_ROTATIONS.map((rotation) =>
    rotations.find((entry) => entry.rotation === rotation) ?? createDefaultDefenseRotationSystem(rotation, context)
  );
}

function normalizeDefenseRotationSystems(value: unknown, context: DefenseContext): DefenseRotationSystem[] {
  const normalizedRotations = Array.isArray(value)
    ? value
        .map((entry) => normalizeDefenseRotationSystem(entry, context))
        .filter((rotation): rotation is DefenseRotationSystem => Boolean(rotation))
    : [];

  return completeDefenseRotationSystems(normalizedRotations, context);
}

function normalizeDefenseSystemContexts(value: unknown, legacyRotations: DefenseRotationSystem[]): DefenseSystemContexts {
  const contexts = isRecord(value) ? value : {};

  return {
    break_point: Array.isArray(contexts.break_point)
      ? normalizeDefenseRotationSystems(contexts.break_point, 'break_point')
      : legacyRotations.length > 0
        ? completeDefenseRotationSystems(legacyRotations, 'break_point')
        : createDefaultDefenseContextSystems('break_point'),
    side_out: Array.isArray(contexts.side_out)
      ? normalizeDefenseRotationSystems(contexts.side_out, 'side_out')
      : createDefaultDefenseContextSystems('side_out'),
  };
}

function cloneDefenseSystemBlock(block: DefenseSystemBlock): DefenseSystemBlock {
  return {
    ...block,
    roleSequence: [...block.roleSequence],
    contexts: {
      break_point: block.contexts.break_point.map((rotation) => ({
        ...rotation,
        positions: rotation.positions.map((position) => ({ ...position })),
      })),
      side_out: block.contexts.side_out.map((rotation) => ({
        ...rotation,
        positions: rotation.positions.map((position) => ({ ...position })),
      })),
    },
  };
}

function normalizeDefenseSystemBlock(value: unknown): DefenseSystemBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  const legacyRotations = Array.isArray(value.rotations)
    ? value.rotations
        .map((entry) => normalizeDefenseRotationSystem(entry, 'break_point'))
        .filter((rotation): rotation is DefenseRotationSystem => Boolean(rotation))
    : [];

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `defense-system-block-${Date.now()}`,
    name: typeof value.name === 'string' ? value.name : '',
    teamId: typeof value.teamId === 'string' ? value.teamId : undefined,
    playingSystemId: typeof value.playingSystemId === 'string' ? value.playingSystemId : undefined,
    roleSequence: normalizeRoleSequence(value.roleSequence),
    contexts: normalizeDefenseSystemContexts(value.contexts, legacyRotations),
  };
}

function readStoredDefenseSystemBlocks(): DefenseSystemBlock[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(DEFENSE_SYSTEM_BLOCK_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeDefenseSystemBlock)
          .filter((block): block is DefenseSystemBlock => Boolean(block))
      : [];
  } catch {
    return [];
  }
}

function writeStoredDefenseSystemBlocks(blocks: readonly DefenseSystemBlock[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEFENSE_SYSTEM_BLOCK_STORAGE_KEY, JSON.stringify(blocks));
}

function getInitialDefenseSystemBlocks(): DefenseSystemBlock[] {
  const storedBlocks = readStoredDefenseSystemBlocks();
  if (storedBlocks !== null) {
    return storedBlocks.map(cloneDefenseSystemBlock);
  }

  return [
    createDefaultDefenseSystemBlock({
      id: DEFAULT_DEFENSE_SYSTEM_BLOCK_ID,
    }),
  ];
}

interface DefenseSystemStoreState {
  defenseSystemBlocks: DefenseSystemBlock[];
  activeDefenseSystemBlock: DefenseSystemBlock | null;
  activeDefenseSystemBlockId: string | null;
  setActiveDefenseSystemBlock: (blockId: string) => void;
  createDefenseSystemBlock: (input?: { name?: string; teamId?: string }) => DefenseSystemBlock;
  saveDefenseSystemBlock: (block: DefenseSystemBlock) => void;
  deleteDefenseSystemBlock: (blockId: string) => void;
}

function getActiveBlock(
  blocks: readonly DefenseSystemBlock[],
  blockId: string | null,
): DefenseSystemBlock | null {
  return blocks.find((block) => block.id === blockId) ?? blocks[0] ?? null;
}

const initialDefenseSystemBlocks = getInitialDefenseSystemBlocks();
const initialActiveDefenseSystemBlock = initialDefenseSystemBlocks[0] ?? null;

export const useDefenseSystemStore = create<DefenseSystemStoreState>((set) => ({
  defenseSystemBlocks: initialDefenseSystemBlocks,
  activeDefenseSystemBlock: initialActiveDefenseSystemBlock,
  activeDefenseSystemBlockId: initialActiveDefenseSystemBlock?.id ?? null,
  setActiveDefenseSystemBlock: (blockId) => {
    set((state) => {
      const activeDefenseSystemBlock = getActiveBlock(state.defenseSystemBlocks, blockId);

      return {
        activeDefenseSystemBlock,
        activeDefenseSystemBlockId: activeDefenseSystemBlock?.id ?? null,
      };
    });
  },
  createDefenseSystemBlock: (input) => {
    const nextBlock = createDefaultDefenseSystemBlock(input);

    set((state) => {
      const defenseSystemBlocks = [...state.defenseSystemBlocks, nextBlock];
      writeStoredDefenseSystemBlocks(defenseSystemBlocks);

      return {
        defenseSystemBlocks,
        activeDefenseSystemBlock: nextBlock,
        activeDefenseSystemBlockId: nextBlock.id,
      };
    });

    return nextBlock;
  },
  saveDefenseSystemBlock: (block) => {
    const nextBlock = cloneDefenseSystemBlock(block);

    set((state) => {
      const defenseSystemBlocks = state.defenseSystemBlocks.some((entry) => entry.id === nextBlock.id)
        ? state.defenseSystemBlocks.map((entry) => (entry.id === nextBlock.id ? nextBlock : entry))
        : [...state.defenseSystemBlocks, nextBlock];

      writeStoredDefenseSystemBlocks(defenseSystemBlocks);

      return {
        defenseSystemBlocks,
        activeDefenseSystemBlock: nextBlock,
        activeDefenseSystemBlockId: nextBlock.id,
      };
    });
  },
  deleteDefenseSystemBlock: (blockId) => {
    set((state) => {
      const defenseSystemBlocks = state.defenseSystemBlocks.filter((block) => block.id !== blockId);
      const activeDefenseSystemBlock = getActiveBlock(defenseSystemBlocks, state.activeDefenseSystemBlockId);
      writeStoredDefenseSystemBlocks(defenseSystemBlocks);

      return {
        defenseSystemBlocks,
        activeDefenseSystemBlock,
        activeDefenseSystemBlockId: activeDefenseSystemBlock?.id ?? null,
      };
    });
  },
}));
