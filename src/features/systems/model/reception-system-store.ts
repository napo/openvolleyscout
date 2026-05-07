import { create } from 'zustand';
import {
  createDefaultReceptionRotationSystem,
  createDefaultReceptionSystemBlock,
  DEFAULT_ROLE_SEQUENCE,
  getDataVolleyZoneCoordinate,
  getNearestDataVolleyZone,
  PlayerRole,
  RECEPTION_ROTATIONS,
  type ReceptionPosition,
  type ReceptionRotation,
  type ReceptionRotationSystem,
  type ReceptionSystemBlock,
} from '@src/domain/systems';

const RECEPTION_SYSTEM_BLOCK_STORAGE_KEY = 'openvolleyscout.receptionSystemBlocks';
const DEFAULT_RECEPTION_SYSTEM_BLOCK_ID = 'reception-system-block-default';

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

function normalizeRotation(value: unknown): ReceptionRotation | null {
  const numericRotation = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/^[PS]/i, ''))
      : Number.NaN;

  if (!Number.isInteger(numericRotation)) {
    return null;
  }

  return RECEPTION_ROTATIONS.includes(numericRotation as ReceptionRotation)
    ? numericRotation as ReceptionRotation
    : null;
}

function normalizeRoleSequence(value: unknown): PlayerRole[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ROLE_SEQUENCE];
  }

  const roles = value
    .map(normalizeRole)
    .filter((role): role is PlayerRole => Boolean(role));

  return roles.length > 0 ? roles : [...DEFAULT_ROLE_SEQUENCE];
}

function normalizeReceptionPosition(value: unknown): ReceptionPosition | null {
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
        : '8';
  const coordinate = getDataVolleyZoneCoordinate(dataVolleyZone);

  return {
    role,
    dataVolleyZone,
    x: x ?? coordinate.x,
    y: y ?? coordinate.y,
  };
}

function normalizeReceptionRotationSystem(value: unknown): ReceptionRotationSystem | null {
  if (!isRecord(value)) {
    return null;
  }

  const rotation = normalizeRotation(value.rotation);
  if (!rotation) {
    return null;
  }

  const positions = Array.isArray(value.positions)
    ? value.positions
        .map(normalizeReceptionPosition)
        .filter((position): position is ReceptionPosition => Boolean(position))
    : [];

  return {
    rotation,
    positions: positions.length > 0
      ? positions
      : createDefaultReceptionRotationSystem(rotation).positions,
  };
}

function completeReceptionRotationSystems(
  rotations: readonly ReceptionRotationSystem[],
): ReceptionRotationSystem[] {
  return RECEPTION_ROTATIONS.map((rotation) =>
    rotations.find((entry) => entry.rotation === rotation) ?? createDefaultReceptionRotationSystem(rotation)
  );
}

function normalizeReceptionRotationSystems(value: unknown): ReceptionRotationSystem[] {
  const normalizedRotations = Array.isArray(value)
    ? value
        .map(normalizeReceptionRotationSystem)
        .filter((rotation): rotation is ReceptionRotationSystem => Boolean(rotation))
    : [];

  return completeReceptionRotationSystems(normalizedRotations);
}

function cloneReceptionSystemBlock(block: ReceptionSystemBlock): ReceptionSystemBlock {
  return {
    ...block,
    roleSequence: [...block.roleSequence],
    rotations: block.rotations.map((rotation) => ({
      ...rotation,
      positions: rotation.positions.map((position) => ({ ...position })),
    })),
  };
}

function normalizeReceptionSystemBlock(value: unknown): ReceptionSystemBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `reception-system-block-${Date.now()}`,
    name: typeof value.name === 'string' ? value.name : '',
    teamId: typeof value.teamId === 'string' ? value.teamId : undefined,
    playingSystemId: typeof value.playingSystemId === 'string' ? value.playingSystemId : undefined,
    roleSequence: normalizeRoleSequence(value.roleSequence),
    rotations: normalizeReceptionRotationSystems(value.rotations),
  };
}

function readStoredReceptionSystemBlocks(): ReceptionSystemBlock[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(RECEPTION_SYSTEM_BLOCK_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeReceptionSystemBlock)
          .filter((block): block is ReceptionSystemBlock => Boolean(block))
      : [];
  } catch {
    return [];
  }
}

function writeStoredReceptionSystemBlocks(blocks: readonly ReceptionSystemBlock[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(RECEPTION_SYSTEM_BLOCK_STORAGE_KEY, JSON.stringify(blocks));
}

function getInitialReceptionSystemBlocks(): ReceptionSystemBlock[] {
  const storedBlocks = readStoredReceptionSystemBlocks();
  if (storedBlocks !== null) {
    return storedBlocks.map(cloneReceptionSystemBlock);
  }

  return [
    createDefaultReceptionSystemBlock({
      id: DEFAULT_RECEPTION_SYSTEM_BLOCK_ID,
    }),
  ];
}

interface ReceptionSystemStoreState {
  receptionSystemBlocks: ReceptionSystemBlock[];
  activeReceptionSystemBlock: ReceptionSystemBlock | null;
  activeReceptionSystemBlockId: string | null;
  setActiveReceptionSystemBlock: (blockId: string) => void;
  createReceptionSystemBlock: (input?: { name?: string; teamId?: string }) => ReceptionSystemBlock;
  saveReceptionSystemBlock: (block: ReceptionSystemBlock) => void;
  deleteReceptionSystemBlock: (blockId: string) => void;
}

function getActiveBlock(
  blocks: readonly ReceptionSystemBlock[],
  blockId: string | null,
): ReceptionSystemBlock | null {
  return blocks.find((block) => block.id === blockId) ?? blocks[0] ?? null;
}

const initialReceptionSystemBlocks = getInitialReceptionSystemBlocks();
const initialActiveReceptionSystemBlock = initialReceptionSystemBlocks[0] ?? null;

export const useReceptionSystemStore = create<ReceptionSystemStoreState>((set) => ({
  receptionSystemBlocks: initialReceptionSystemBlocks,
  activeReceptionSystemBlock: initialActiveReceptionSystemBlock,
  activeReceptionSystemBlockId: initialActiveReceptionSystemBlock?.id ?? null,
  setActiveReceptionSystemBlock: (blockId) => {
    set((state) => {
      const activeReceptionSystemBlock = getActiveBlock(state.receptionSystemBlocks, blockId);

      return {
        activeReceptionSystemBlock,
        activeReceptionSystemBlockId: activeReceptionSystemBlock?.id ?? null,
      };
    });
  },
  createReceptionSystemBlock: (input) => {
    const nextBlock = createDefaultReceptionSystemBlock(input);

    set((state) => {
      const receptionSystemBlocks = [...state.receptionSystemBlocks, nextBlock];
      writeStoredReceptionSystemBlocks(receptionSystemBlocks);

      return {
        receptionSystemBlocks,
        activeReceptionSystemBlock: nextBlock,
        activeReceptionSystemBlockId: nextBlock.id,
      };
    });

    return nextBlock;
  },
  saveReceptionSystemBlock: (block) => {
    const nextBlock = cloneReceptionSystemBlock(block);

    set((state) => {
      const receptionSystemBlocks = state.receptionSystemBlocks.some((entry) => entry.id === nextBlock.id)
        ? state.receptionSystemBlocks.map((entry) => (entry.id === nextBlock.id ? nextBlock : entry))
        : [...state.receptionSystemBlocks, nextBlock];

      writeStoredReceptionSystemBlocks(receptionSystemBlocks);

      return {
        receptionSystemBlocks,
        activeReceptionSystemBlock: nextBlock,
        activeReceptionSystemBlockId: nextBlock.id,
      };
    });
  },
  deleteReceptionSystemBlock: (blockId) => {
    set((state) => {
      const receptionSystemBlocks = state.receptionSystemBlocks.filter((block) => block.id !== blockId);
      const activeReceptionSystemBlock = getActiveBlock(receptionSystemBlocks, state.activeReceptionSystemBlockId);
      writeStoredReceptionSystemBlocks(receptionSystemBlocks);

      return {
        receptionSystemBlocks,
        activeReceptionSystemBlock,
        activeReceptionSystemBlockId: activeReceptionSystemBlock?.id ?? null,
      };
    });
  },
}));
