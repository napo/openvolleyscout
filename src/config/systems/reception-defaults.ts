import { PlayerRole, type ReceptionRotation } from '@src/domain/systems/types';

export const RECEPTION_ROTATIONS: ReceptionRotation[] = [1, 2, 3, 4, 5, 6];
export const DEFAULT_RECEPTION_SYSTEM_NAME = 'Base Reception';
export const DEFAULT_RECEPTION_FALLBACK_ZONE = '8';

export type ReceptionRoleZoneMap = Array<{
  role: PlayerRole;
  dataVolleyZone: string;
}>;

export const DEFAULT_RECEPTION_ROTATION_ZONE_MAP: Record<ReceptionRotation, ReceptionRoleZoneMap> = {
  1: [
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '9' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '3' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '4' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '7' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '8' },
    { role: PlayerRole.SETTER, dataVolleyZone: '9-setter-support' },
  ],
  2: [
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '7' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '8' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '9' },
    { role: PlayerRole.SETTER, dataVolleyZone: '2c' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '4b' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '5a' },
  ],
  3: [
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '7' },
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '8' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '9' },
    { role: PlayerRole.SETTER, dataVolleyZone: '3b' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '2a' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '6' },
  ],
  4: [
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '7' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '8' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '9' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '1a' },
    { role: PlayerRole.SETTER, dataVolleyZone: '4b' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '4a' },
  ],
  5: [
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '7' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '8' },
    { role: PlayerRole.MIDDLE_BLOCKER_2, dataVolleyZone: '9' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '4c' },
    { role: PlayerRole.SETTER, dataVolleyZone: '4a' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '2' },
  ],
  6: [
    { role: PlayerRole.OUTSIDE_HITTER_2, dataVolleyZone: '7' },
    { role: PlayerRole.MIDDLE_BLOCKER_1, dataVolleyZone: '8' },
    { role: PlayerRole.OUTSIDE_HITTER_1, dataVolleyZone: '9' },
    { role: PlayerRole.OPPOSITE, dataVolleyZone: '3b' },
    { role: PlayerRole.SETTER, dataVolleyZone: '3c' },
  ],
};
