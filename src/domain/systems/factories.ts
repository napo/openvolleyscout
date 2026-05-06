import {
  type DefenseContext,
  type DefensePosition,
  type DefenseRotation,
  type DefenseRotationSystem,
  type DefenseSystemBlock,
  type PlayingSystem,
  PlayerRole,
  type SystemKind,
  type TacticalSystemDefinition,
} from './types';
import { getDataVolleyZoneCoordinate } from './datavolley-zones';

export const DEFAULT_PLAYING_SYSTEM_ID = 'default-playing-system';

export const DEFENSE_ROTATIONS: DefenseRotation[] = [1, 2, 3, 4, 5, 6];
export const DEFENSE_CONTEXTS: DefenseContext[] = ['break_point', 'side_out'];

export const DEFAULT_ROLE_SEQUENCE: PlayerRole[] = [
  PlayerRole.SETTER,
  PlayerRole.OUTSIDE_HITTER_1,
  PlayerRole.MIDDLE_BLOCKER_2,
  PlayerRole.OPPOSITE,
  PlayerRole.OUTSIDE_HITTER_2,
  PlayerRole.MIDDLE_BLOCKER_1,
];

export const DEFAULT_PLAYING_SYSTEM: PlayingSystem = {
  id: DEFAULT_PLAYING_SYSTEM_ID,
  roleSequence: DEFAULT_ROLE_SEQUENCE,
};

type DefenseRoleZoneMap = Array<{
  role: PlayerRole;
  dataVolleyZone: string;
}>;

const DEFAULT_BREAK_POINT_DEFENSE_ROTATION_ZONE_MAP: Record<DefenseRotation, DefenseRoleZoneMap> = {
  1: [
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '6b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9a' },
  ],
  2: [
    { role: PlayerRole.SETTER, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '6b' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '9a' },
  ],
  3: [
    { role: PlayerRole.SETTER, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '6b' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '9a' },
  ],
  4: [
    { role: PlayerRole.SETTER, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '6b' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '9a' },
  ],
  5: [
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '6b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9a' },
  ],
  6: [
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '6b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9a' },
  ],
};

const DEFAULT_SIDE_OUT_DEFENSE_ROTATION_ZONE_MAP: Record<DefenseRotation, DefenseRoleZoneMap> = {
  ...DEFAULT_BREAK_POINT_DEFENSE_ROTATION_ZONE_MAP,
  1: [
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '6b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9a' },
  ],
};

const DEFAULT_DEFENSE_ROTATION_ZONE_MAPS: Record<DefenseContext, Record<DefenseRotation, DefenseRoleZoneMap>> = {
  break_point: DEFAULT_BREAK_POINT_DEFENSE_ROTATION_ZONE_MAP,
  side_out: DEFAULT_SIDE_OUT_DEFENSE_ROTATION_ZONE_MAP,
};

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

export function createDefaultDefenseSystemBlock(input: {
  id?: string;
  name?: string;
  teamId?: string;
  playingSystemId?: string;
} = {}): DefenseSystemBlock {
  return {
    id: input.id ?? createSystemId('defense-system-block'),
    name: input.name ?? 'Base Defense',
    teamId: input.teamId,
    playingSystemId: input.playingSystemId ?? DEFAULT_PLAYING_SYSTEM_ID,
    roleSequence: [...DEFAULT_ROLE_SEQUENCE],
    contexts: {
      break_point: createDefaultDefenseContextSystems('break_point'),
      side_out: createDefaultDefenseContextSystems('side_out'),
    },
  };
}
