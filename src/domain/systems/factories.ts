import {
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

export const DEFENSE_ROTATIONS: DefenseRotation[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

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

const DEFAULT_DEFENSE_ROTATION_ZONE_MAP: Record<DefenseRotation, DefenseRoleZoneMap> = {
  P1: [
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '6b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9a' },
  ],
  P2: [
    { role: PlayerRole.SETTER, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '6b' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '9a' },
  ],
  P3: [
    { role: PlayerRole.SETTER, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '6b' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '9a' },
  ],
  P4: [
    { role: PlayerRole.SETTER, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '6b' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '9a' },
  ],
  P5: [
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '6b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9a' },
  ],
  P6: [
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '2b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3b' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '7a' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '6b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9a' },
  ],
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

export function createDefaultDefenseRotationSystem(rotation: DefenseRotation): DefenseRotationSystem {
  return {
    rotation,
    positions: DEFAULT_DEFENSE_ROTATION_ZONE_MAP[rotation].map(({ role, dataVolleyZone }) =>
      createDefensePosition(role, dataVolleyZone)
    ),
  };
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
    rotations: DEFENSE_ROTATIONS.map(createDefaultDefenseRotationSystem),
  };
}
