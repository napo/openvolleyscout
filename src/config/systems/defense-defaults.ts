import { PlayerRole, type DefenseContext, type DefenseRotation } from '@src/domain/systems/types';

export const DEFENSE_ROTATIONS: DefenseRotation[] = [1, 2, 3, 4, 5, 6];
export const DEFENSE_CONTEXTS: DefenseContext[] = ['break_point', 'side_out'];
export const DEFAULT_DEFENSE_SYSTEM_NAME = 'Base Defense';
export const DEFAULT_DEFENSE_FALLBACK_ZONE = '6b';

export type DefenseRoleZoneMap = Array<{
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

export const DEFAULT_DEFENSE_ROTATION_ZONE_MAPS: Record<
  DefenseContext,
  Record<DefenseRotation, DefenseRoleZoneMap>
> = {
  break_point: DEFAULT_BREAK_POINT_DEFENSE_ROTATION_ZONE_MAP,
  side_out: DEFAULT_SIDE_OUT_DEFENSE_ROTATION_ZONE_MAP,
};
