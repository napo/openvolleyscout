import {
  type DefenseContext,
  type DefensePosition,
  type DefenseRotation,
  type DefenseRotationSystem,
  type DefenseSystemBlock,
  type ReceptionPosition,
  type ReceptionRotation,
  type ReceptionRotationSystem,
  type ReceptionSystemBlock,
  type PlayerRole,
  type SystemKind,
  type TacticalSystemDefinition,
} from './types';
import { getDataVolleyZoneCoordinate } from './datavolley-zones';
import {
  DEFAULT_DEFENSE_SYSTEM_NAME,
  DEFAULT_DEFENSE_ROTATION_ZONE_MAPS,
  DEFAULT_PLAYING_SYSTEM_ID,
  DEFAULT_RECEPTION_ROTATION_ZONE_MAP,
  DEFAULT_RECEPTION_SYSTEM_NAME,
  DEFAULT_ROLE_SEQUENCE,
  DEFENSE_ROTATIONS,
  RECEPTION_ROTATIONS,
} from '@src/config/systems';

export {
  DEFAULT_PLAYING_SYSTEM,
  DEFAULT_PLAYING_SYSTEM_ID,
  DEFAULT_DEFENSE_SYSTEM_NAME,
  DEFAULT_RECEPTION_SYSTEM_NAME,
  DEFAULT_ROLE_SEQUENCE,
  DEFENSE_CONTEXTS,
  DEFENSE_ROTATIONS,
  RECEPTION_ROTATIONS,
} from '@src/config/systems';

export function createEmptyTacticalSystem(kind: SystemKind = 'reception'): TacticalSystemDefinition {
  return {
    id: crypto.randomUUID(),
    name: '',
    kind,
    responsibilities: [],
  };
}

function createSystemId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefensePosition(role: PlayerRole, dataVolleyZone: string): DefensePosition {
  return {
    role,
    dataVolleyZone,
    ...getDataVolleyZoneCoordinate(dataVolleyZone),
  };
}

export function createReceptionPosition(role: PlayerRole, dataVolleyZone: string): ReceptionPosition {
  return {
    role,
    dataVolleyZone,
    ...getDataVolleyZoneCoordinate(dataVolleyZone),
  };
}

export function createDefaultDefenseRotationSystem(
  rotation: DefenseRotation,
  context: DefenseContext = 'break_point',
): DefenseRotationSystem {
  return {
    rotation,
    positions: DEFAULT_DEFENSE_ROTATION_ZONE_MAPS[context][rotation].map(({ role, dataVolleyZone }) =>
      createDefensePosition(role, dataVolleyZone)
    ),
  };
}

export function createDefaultDefenseContextSystems(context: DefenseContext): DefenseRotationSystem[] {
  return DEFENSE_ROTATIONS.map((rotation) => createDefaultDefenseRotationSystem(rotation, context));
}

export function createDefaultReceptionRotationSystem(rotation: ReceptionRotation): ReceptionRotationSystem {
  return {
    rotation,
    positions: DEFAULT_RECEPTION_ROTATION_ZONE_MAP[rotation].map(({ role, dataVolleyZone }) =>
      createReceptionPosition(role, dataVolleyZone)
    ),
  };
}

export function createDefaultReceptionRotationSystems(): ReceptionRotationSystem[] {
  return RECEPTION_ROTATIONS.map((rotation) => createDefaultReceptionRotationSystem(rotation));
}

export function createDefaultDefenseSystemBlock(input: {
  id?: string;
  name?: string;
  teamId?: string;
  playingSystemId?: string;
} = {}): DefenseSystemBlock {
  return {
    id: input.id ?? createSystemId('defense-system-block'),
    name: input.name ?? DEFAULT_DEFENSE_SYSTEM_NAME,
    teamId: input.teamId,
    playingSystemId: input.playingSystemId ?? DEFAULT_PLAYING_SYSTEM_ID,
    roleSequence: [...DEFAULT_ROLE_SEQUENCE],
    contexts: {
      break_point: createDefaultDefenseContextSystems('break_point'),
      side_out: createDefaultDefenseContextSystems('side_out'),
    },
  };
}

export function createDefaultReceptionSystemBlock(input: {
  id?: string;
  name?: string;
  teamId?: string;
  playingSystemId?: string;
} = {}): ReceptionSystemBlock {
  return {
    id: input.id ?? createSystemId('reception-system-block'),
    name: input.name ?? DEFAULT_RECEPTION_SYSTEM_NAME,
    teamId: input.teamId,
    playingSystemId: input.playingSystemId ?? DEFAULT_PLAYING_SYSTEM_ID,
    roleSequence: [...DEFAULT_ROLE_SEQUENCE],
    rotations: createDefaultReceptionRotationSystems(),
  };
}
