import type { TacticalSystemDefinition } from '@src/domain/systems';

const STORAGE_KEY = 'openvolleyscout.systems';

function readStoredSystems(): TacticalSystemDefinition[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed as TacticalSystemDefinition[] : [];
  } catch {
    return [];
  }
}

function writeStoredSystems(systems: TacticalSystemDefinition[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(systems));
}

export async function getAllSystems(): Promise<TacticalSystemDefinition[]> {
  return readStoredSystems();
}

export async function getSystemById(id: string): Promise<TacticalSystemDefinition | null> {
  return readStoredSystems().find((system) => system.id === id) ?? null;
}

export async function saveSystem(system: TacticalSystemDefinition): Promise<TacticalSystemDefinition> {
  const systems = readStoredSystems();
  const nextSystems = systems.some((entry) => entry.id === system.id)
    ? systems.map((entry) => (entry.id === system.id ? system : entry))
    : [...systems, system];

  writeStoredSystems(nextSystems);
  return system;
}

export async function deleteSystem(id: string): Promise<void> {
  const systems = readStoredSystems().filter((system) => system.id !== id);
  writeStoredSystems(systems);
}

export const systemRepository = {
  getAllSystems,
  getSystemById,
  saveSystem,
  deleteSystem,
};
