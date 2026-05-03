import type { DefenseSystem, DefenseSystemPosition, SystemKind, TacticalSystemDefinition } from './types';

export function createEmptyTacticalSystem(kind: SystemKind = 'reception'): TacticalSystemDefinition {
  return {
    id: crypto.randomUUID(),
    name: '',
    kind,
    responsibilities: [],
  };
}

export const DEFAULT_DEFENSE_SYSTEM_POSITIONS: DefenseSystemPosition[] = [
  {
    role: 'S1',
    zone: '7',
    x: 30,
    y: 70,
  },
  {
    role: 'C1',
    zone: '6',
    x: 50,
    y: 80,
  },
  {
    role: 'S2',
    zone: '9',
    x: 70,
    y: 70,
  },
];

function createSystemId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getZoneFromCoordinates(x: number, _y: number): string {
  if (x < 40) {
    return '7';
  }

  if (x > 60) {
    return '9';
  }

  return '6';
}

export function createDefaultDefenseSystem(input: {
  id?: string;
  name?: string;
  teamId?: string;
} = {}): DefenseSystem {
  return {
    id: input.id ?? createSystemId('defense-system'),
    name: input.name ?? 'Base Defense',
    teamId: input.teamId,
    positions: DEFAULT_DEFENSE_SYSTEM_POSITIONS.map((position) => ({ ...position })),
  };
}
