// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchProject } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { TeamSide } from '@src/domain/common/enums';
import { dvZonesToBallDirection, type DvDisplaySide } from './datavolley-zone-to-stage';

// DataVolley imports always place home on the left, away on the right (same as the importer).
const selfSide = (teamSide: TeamSide): DvDisplaySide => (teamSide === 'home' ? 'left' : 'right');
const oppositeSide = (teamSide: TeamSide): DvDisplaySide => (teamSide === 'home' ? 'right' : 'left');

/**
 * Matches imported before subzone codes such as `6d` or `3a` fell back to their base
 * zone lost the ball direction (and so their heatmap events) of those touches. The
 * zone codes are still stored on every touch, so the direction is rebuilt from them
 * exactly as the importer does now.
 *
 * Only DataVolley imports are repaired (they carry `dataVolleyCodeTables`); live-scouted
 * directions are drawn by hand and never touched. Touches that already have a direction
 * and inferred blocks (which borrow the attack's zones) are left alone. Idempotent: the
 * same project object is returned when there is nothing to repair.
 */
export function repairDataVolleyBallDirections(project: MatchProject): MatchProject {
  if (!project.dataVolleyCodeTables) return project;

  let changed = false;
  const events = project.events.map((event): MatchEvent => {
    if (event.type !== 'touch_recorded') return event;
    const touch = event.touch;
    if (touch.ballDirection || touch.inferenceReason === 'block_from_attack') return event;
    if (!touch.startZoneCode && !touch.endZoneCode) return event;

    const { direction } = dvZonesToBallDirection({
      skill: touch.skill,
      startZone: touch.startZoneCode,
      endZone: touch.endZoneCode,
      selfDisplaySide: selfSide(touch.teamSide),
      oppositeDisplaySide: oppositeSide(touch.teamSide),
    });
    if (!direction) return event;

    changed = true;
    return { ...event, touch: { ...touch, ballDirection: direction } };
  });

  return changed ? { ...project, events } : project;
}
