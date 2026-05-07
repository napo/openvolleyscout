import { PlayerRole, type ReceptionRotation, type ReceptionSystemBlock } from '@src/domain/systems/types';

export const RECEPTION_ROTATIONS: ReceptionRotation[] = [1, 2, 3, 4, 5, 6];
export const DEFAULT_RECEPTION_SYSTEM_NAME = 'Base Reception';
export const DEFAULT_RECEPTION_FALLBACK_ZONE = '8';

export type ReceptionRoleZoneMap = Array<{
  role: PlayerRole;
  dataVolleyZone: string;
}>;

export const DEFAULT_RECEPTION_SYSTEM_BLOCK: ReceptionSystemBlock = {
  id: "reception-system-block-default",
  name: "Base Reception",
  playingSystemId: "default-playing-system",
  roleSequence: [
    PlayerRole.SETTER,
    PlayerRole.OUTSIDE_HITTER_1,
    PlayerRole.MIDDLE_BLOCKER_2,
    PlayerRole.OPPOSITE,
    PlayerRole.OUTSIDE_HITTER_2,
    PlayerRole.MIDDLE_BLOCKER_1,
  ],
  rotations: [
    {
      rotation: 1,
      positions: [
        {
          role: PlayerRole.OUTSIDE_HITTER_1,
          dataVolleyZone: "1a",
          x: 81.6154,
          y: 53.6058,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_2,
          dataVolleyZone: "3b",
          x: 39,
          y: 22.7163,
        },
        {
          role: PlayerRole.OPPOSITE,
          dataVolleyZone: "4",
          x: 8.3846,
          y: 20.6731,
        },
        {
          role: PlayerRole.OUTSIDE_HITTER_2,
          dataVolleyZone: "5a",
          x: 19.3077,
          y: 52.4039,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_1,
          dataVolleyZone: "6",
          x: 54.5385,
          y: 63.101,
        },
        {
          role: PlayerRole.SETTER,
          dataVolleyZone: "9a",
          x: 92.3846,
          y: 67.9087,
        }
      ],
    },
    {
      rotation: 2,
      positions: [
        {
          role: PlayerRole.OUTSIDE_HITTER_1,
          dataVolleyZone: "5a",
          x: 20.8462,
          y: 58.774,
        },
        {
          role: PlayerRole.OUTSIDE_HITTER_2,
          dataVolleyZone: "6b",
          x: 54.8462,
          y: 67.5481,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_1,
          dataVolleyZone: "1a",
          x: 84.3846,
          y: 57.9327,
        },
        {
          role: PlayerRole.SETTER,
          dataVolleyZone: "2a",
          x: 69.4616,
          y: 8.774,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_2,
          dataVolleyZone: "4",
          x: 8.3846,
          y: 20.6731,
        },
        {
          role: PlayerRole.OPPOSITE,
          dataVolleyZone: "7",
          x: 31.1538,
          y: 84.2548,
        }
      ],
    },
    {
      rotation: 3,
      positions: [
        {
          role: PlayerRole.OUTSIDE_HITTER_1,
          dataVolleyZone: "5a",
          x: 24.2308,
          y: 57.6923,
        },
        {
          role: PlayerRole.OUTSIDE_HITTER_2,
          dataVolleyZone: "1a",
          x: 75.1539,
          y: 59.0144,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_1,
          dataVolleyZone: "6b",
          x: 50.8462,
          y: 67.9087,
        },
        {
          role: PlayerRole.SETTER,
          dataVolleyZone: "3",
          x: 51.1538,
          y: 9.976,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_2,
          dataVolleyZone: "2b",
          x: 77,
          y: 22.3558,
        },
        {
          role: PlayerRole.OPPOSITE,
          dataVolleyZone: "9d",
          x: 73,
          y: 81.25,
        }
      ],
    },
    {
      rotation: 4,
      positions: [
        {
          role: PlayerRole.OUTSIDE_HITTER_2,
          dataVolleyZone: "5a",
          x: 24.8462,
          y: 58.6538,
        },
        {
          role: PlayerRole.OUTSIDE_HITTER_1,
          dataVolleyZone: "6",
          x: 54.5385,
          y: 63.8221,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_2,
          dataVolleyZone: "1a",
          x: 84.0769,
          y: 58.0529,
        },
        {
          role: PlayerRole.OPPOSITE,
          dataVolleyZone: "9",
          x: 83.6154,
          y: 86.7789,
        },
        {
          role: PlayerRole.SETTER,
          dataVolleyZone: "4a",
          x: 5.7692,
          y: 6.4904,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_1,
          dataVolleyZone: "4b",
          x: 12.6923,
          y: 24.1587,
        }
      ],
    },
    {
      rotation: 5,
      positions: [
        {
          role: PlayerRole.OUTSIDE_HITTER_2,
          dataVolleyZone: "5a",
          x: 20.8462,
          y: 53.4856,
        },
        {
          role: PlayerRole.OUTSIDE_HITTER_1,
          dataVolleyZone: "6",
          x: 52.2308,
          y: 62.8606,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_2,
          dataVolleyZone: "1a",
          x: 81.6154,
          y: 54.2067,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_1,
          dataVolleyZone: "4a",
          x: 6.5385,
          y: 9.2548,
        },
        {
          role: PlayerRole.SETTER,
          dataVolleyZone: "4",
          x: 29.9231,
          y: 21.1538,
        },
        {
          role: PlayerRole.OPPOSITE,
          dataVolleyZone: "2",
          x: 82,
          y: 20,
        }
      ],
    },
    {
      rotation: 6,
      positions: [
        {
          role: PlayerRole.OUTSIDE_HITTER_2,
          dataVolleyZone: "5a",
          x: 20.5385,
          y: 61.0577,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_1,
          dataVolleyZone: "6b",
          x: 50.2308,
          y: 66.3462,
        },
        {
          role: PlayerRole.OUTSIDE_HITTER_1,
          dataVolleyZone: "1a",
          x: 80.0769,
          y: 58.5337,
        },
        {
          role: PlayerRole.MIDDLE_BLOCKER_2,
          dataVolleyZone: "2b",
          x: 82.8462,
          y: 25,
        },
        {
          role: PlayerRole.OPPOSITE,
          dataVolleyZone: "3",
          x: 50.8462,
          y: 7.0913,
        },
        {
          role: PlayerRole.SETTER,
          dataVolleyZone: "3",
          x: 46.6923,
          y: 19.4712,
        }
      ],
    }
  ],
};
export const BASE_RECEPTION_RECEPTION_SYSTEM = DEFAULT_RECEPTION_SYSTEM_BLOCK;

function getReceptionRoleZoneMap(rotation: ReceptionRotation): ReceptionRoleZoneMap {
  return DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations
    .find((entry) => entry.rotation === rotation)
    ?.positions.map(({ role, dataVolleyZone }) => ({ role, dataVolleyZone })) ?? [];
}

export const DEFAULT_RECEPTION_ROTATION_ZONE_MAP: Record<ReceptionRotation, ReceptionRoleZoneMap> = {
  1: getReceptionRoleZoneMap(1),
  2: getReceptionRoleZoneMap(2),
  3: getReceptionRoleZoneMap(3),
  4: getReceptionRoleZoneMap(4),
  5: getReceptionRoleZoneMap(5),
  6: getReceptionRoleZoneMap(6),
};
