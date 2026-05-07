import {
  PlayerRole,
  type DefenseContext,
  type DefenseRotation,
  type DefenseSystemBlock,
} from '@src/domain/systems/types';

export const DEFENSE_ROTATIONS: DefenseRotation[] = [1, 2, 3, 4, 5, 6];

export const DEFENSE_CONTEXTS: DefenseContext[] = [
  'break_point',
  'side_out',
];

export const DEFAULT_DEFENSE_SYSTEM_NAME = 'Base Defense';
export const DEFAULT_DEFENSE_FALLBACK_ZONE = '6b';

export type DefenseRoleZoneMap = Array<{
  role: PlayerRole;
  dataVolleyZone: string;
}>;

export const DEFAULT_DEFENSE_SYSTEM_BLOCK: DefenseSystemBlock = {
  id: 'base-defense',
  name: DEFAULT_DEFENSE_SYSTEM_NAME,

  roleSequence: [
    PlayerRole.SETTER,
    PlayerRole.OUTSIDE_HITTER_1,
    PlayerRole.MIDDLE_BLOCKER_2,
    PlayerRole.OPPOSITE,
    PlayerRole.OUTSIDE_HITTER_2,
    PlayerRole.MIDDLE_BLOCKER_1,
  ],

  contexts: {
    break_point: [
      {
        rotation: 1,
        positions: [
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 6,
        positions: [
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 5,
        positions: [
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 4,
        positions: [
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 3,
        positions: [
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 2,
        positions: [
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },
    ],

    side_out: [
      {
        rotation: 1,
        positions: [
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 6,
        positions: [
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 5,
        positions: [
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 4,
        positions: [
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 3,
        positions: [
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },

      {
        rotation: 2,
        positions: [
          {
            role: PlayerRole.SETTER,
            dataVolleyZone: '2b',
            x: 83,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_2,
            dataVolleyZone: '3b',
            x: 50,
            y: 18,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_1,
            dataVolleyZone: '4b',
            x: 17,
            y: 18,
          },
          {
            role: PlayerRole.MIDDLE_BLOCKER_1,
            dataVolleyZone: '7a',
            x: 17,
            y: 72,
          },
          {
            role: PlayerRole.OUTSIDE_HITTER_2,
            dataVolleyZone: '6b',
            x: 50,
            y: 78,
          },
          {
            role: PlayerRole.OPPOSITE,
            dataVolleyZone: '9a',
            x: 83,
            y: 72,
          },
        ],
      },
    ],
  },
};

export const BASE_DEFENSE_DEFENSE_SYSTEM =
  DEFAULT_DEFENSE_SYSTEM_BLOCK;

function getDefenseRoleZoneMap(context: DefenseContext, rotation: DefenseRotation): DefenseRoleZoneMap {
  return DEFAULT_DEFENSE_SYSTEM_BLOCK.contexts[context]
    .find((entry) => entry.rotation === rotation)
    ?.positions.map(({ role, dataVolleyZone }) => ({ role, dataVolleyZone })) ?? [];
}

export const DEFAULT_DEFENSE_ROTATION_ZONE_MAPS: Record<
  DefenseContext,
  Record<DefenseRotation, DefenseRoleZoneMap>
> = {
  break_point: {
    1: getDefenseRoleZoneMap('break_point', 1),
    2: getDefenseRoleZoneMap('break_point', 2),
    3: getDefenseRoleZoneMap('break_point', 3),
    4: getDefenseRoleZoneMap('break_point', 4),
    5: getDefenseRoleZoneMap('break_point', 5),
    6: getDefenseRoleZoneMap('break_point', 6),
  },
  side_out: {
    1: getDefenseRoleZoneMap('side_out', 1),
    2: getDefenseRoleZoneMap('side_out', 2),
    3: getDefenseRoleZoneMap('side_out', 3),
    4: getDefenseRoleZoneMap('side_out', 4),
    5: getDefenseRoleZoneMap('side_out', 5),
    6: getDefenseRoleZoneMap('side_out', 6),
  },
};
