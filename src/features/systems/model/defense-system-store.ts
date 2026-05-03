import { create } from 'zustand';
import {
  createDefaultDefenseSystem,
  type DefenseSystem,
} from '@src/domain/systems';

const DEFENSE_SYSTEM_STORAGE_KEY = 'openvolleyscout.defenseSystems';
const DEFAULT_DEFENSE_SYSTEM_ID = 'defense-system-default';

function cloneDefenseSystem(system: DefenseSystem): DefenseSystem {
  return {
    ...system,
    positions: system.positions.map((position) => ({ ...position })),
  };
}

function readStoredDefenseSystems(): DefenseSystem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawValue = window.localStorage.getItem(DEFENSE_SYSTEM_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed as DefenseSystem[] : [];
  } catch {
    return [];
  }
}

function writeStoredDefenseSystems(systems: readonly DefenseSystem[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEFENSE_SYSTEM_STORAGE_KEY, JSON.stringify(systems));
}

function getInitialDefenseSystems(): DefenseSystem[] {
  const storedSystems = readStoredDefenseSystems();
  if (storedSystems.length > 0) {
    return storedSystems.map(cloneDefenseSystem);
  }

  return [
    createDefaultDefenseSystem({
      id: DEFAULT_DEFENSE_SYSTEM_ID,
    }),
  ];
}

interface DefenseSystemStoreState {
  defenseSystems: DefenseSystem[];
  activeDefenseSystem: DefenseSystem | null;
  activeDefenseSystemId: string | null;
  setActiveDefenseSystem: (systemId: string) => void;
  createDefenseSystem: (input?: { name?: string; teamId?: string }) => DefenseSystem;
  saveDefenseSystem: (system: DefenseSystem) => void;
}

function getActiveSystem(systems: readonly DefenseSystem[], systemId: string | null): DefenseSystem | null {
  return systems.find((system) => system.id === systemId) ?? systems[0] ?? null;
}

const initialDefenseSystems = getInitialDefenseSystems();
const initialActiveDefenseSystem = initialDefenseSystems[0] ?? null;

export const useDefenseSystemStore = create<DefenseSystemStoreState>((set) => ({
  defenseSystems: initialDefenseSystems,
  activeDefenseSystem: initialActiveDefenseSystem,
  activeDefenseSystemId: initialActiveDefenseSystem?.id ?? null,
  setActiveDefenseSystem: (systemId) => {
    set((state) => {
      const activeDefenseSystem = getActiveSystem(state.defenseSystems, systemId);

      return {
        activeDefenseSystem,
        activeDefenseSystemId: activeDefenseSystem?.id ?? null,
      };
    });
  },
  createDefenseSystem: (input) => {
    const nextSystem = createDefaultDefenseSystem(input);

    set((state) => {
      const defenseSystems = [...state.defenseSystems, nextSystem];
      writeStoredDefenseSystems(defenseSystems);

      return {
        defenseSystems,
        activeDefenseSystem: nextSystem,
        activeDefenseSystemId: nextSystem.id,
      };
    });

    return nextSystem;
  },
  saveDefenseSystem: (system) => {
    const nextSystem = cloneDefenseSystem(system);

    set((state) => {
      const defenseSystems = state.defenseSystems.some((entry) => entry.id === nextSystem.id)
        ? state.defenseSystems.map((entry) => (entry.id === nextSystem.id ? nextSystem : entry))
        : [...state.defenseSystems, nextSystem];

      writeStoredDefenseSystems(defenseSystems);

      return {
        defenseSystems,
        activeDefenseSystem: nextSystem,
        activeDefenseSystemId: nextSystem.id,
      };
    });
  },
}));
