// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  createFullScoutingCells,
  findNearestScoutingZone,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
} from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import { getZoneCode } from './datavolley-code';

const COURT_CELLS = createFullScoutingCells().filter((zone) => zone.kind === 'in_court');

/** A drawn attack starts where the scout put the ball, independently of the player marker. */
export function drawnAttackStartZoneCode(touch: Pick<BallTouch, 'ballDirection' | 'trajectory'>): string | undefined {
  const start = touch.ballDirection?.start ?? touch.trajectory?.direction?.start;
  if (!start || !Number.isFinite(start.x) || !Number.isFinite(start.y)
    || start.x < SCOUTING_SURFACE_INSET_X || start.x > 100 - SCOUTING_SURFACE_INSET_X
    || start.y < SCOUTING_SURFACE_INSET_Y || start.y > 100 - SCOUTING_SURFACE_INSET_Y) return undefined;
  const physicalSide = start.x < 50 ? 'away' : 'home';
  const zone = findNearestScoutingZone(start, COURT_CELLS.filter((cell) => cell.teamSide === physicalSide));
  return getZoneCode({ teamSide: physicalSide, zoneId: zone.id, gridCoordinate: zone.gridCoordinate, point: start });
}
