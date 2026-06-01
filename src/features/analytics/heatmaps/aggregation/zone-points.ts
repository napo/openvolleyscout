/**
 * DataVolley zone and sub-zone geometric reference points.
 * Used for zone-based density heatmap aggregation.
 */

import type { StagePoint } from '@src/domain/trajectory/types';

const NET_X = 50;
const HALF_DEPTH = 38;
const INSET_Y = 12;
const HEIGHT = 76;

// Half-court zone coordinates (from DataVolley standard)
const DV_HALF_COURT: Record<string, StagePoint> = {
  '1': { x: 82, y: 78 },
  '1a': { x: 82, y: 52 },
  '2': { x: 82, y: 24 },
  '2a': { x: 82, y: 14 },
  '2b': { x: 82, y: 24 },
  '2c': { x: 82, y: 34 },
  '2d': { x: 88, y: 24 },
  '3': { x: 50, y: 20 },
  '3b': { x: 50, y: 24 },
  '3c': { x: 50, y: 34 },
  '4': { x: 18, y: 24 },
  '4a': { x: 18, y: 14 },
  '4b': { x: 18, y: 24 },
  '4c': { x: 18, y: 34 },
  '5a': { x: 18, y: 52 },
  '5': { x: 18, y: 78 },
  '6': { x: 50, y: 58 },
  '6b': { x: 50, y: 74 },
  '7': { x: 18, y: 76 },
  '7a': { x: 18, y: 72 },
  '8': { x: 50, y: 82 },
  '9': { x: 82, y: 76 },
  '9a': { x: 82, y: 72 },
  '9d': { x: 72, y: 74 },
};

// Cone-to-subzone mapping (from datavolley-zone-to-stage.ts)
const CONE_TO_SUBZONE_GENERIC: Record<string, 'A' | 'B' | 'C' | 'D'> = {
  '1': 'A',
  '2': 'A',
  '3': 'A',
  '4': 'B',
  '5': 'B',
  '6': 'A',
  '7': 'A',
  '8': 'A',
  '9': 'D',
  '0': 'B',
};

function halfCourtToStageLeft(halfX: number, halfY: number): StagePoint {
  return {
    x: NET_X - (halfY * HALF_DEPTH) / 100,
    y: INSET_Y + (halfX * HEIGHT) / 100,
  };
}

function mirrorStagePoint(pt: StagePoint): StagePoint {
  return { x: 100 - pt.x, y: 100 - pt.y };
}

/**
 * Get the geometric center point for a zone or sub-zone.
 * Used as reference point for zone-based density aggregation.
 *
 * @param zoneCode Zone code (1-9, optionally with subzone letter like "2a", "3b")
 * @param displaySide 'left' for home team, 'right' for away team
 * @returns Stage coordinate point, or null if zone not recognized
 */
export function getZonePoint(zoneCode: string | undefined, displaySide: 'left' | 'right'): StagePoint | null {
  if (!zoneCode) return null;

  const normalized = zoneCode.trim().toLowerCase();
  const halfPt = DV_HALF_COURT[normalized];
  if (!halfPt) return null;

  const stagePt = halfCourtToStageLeft(halfPt.x, halfPt.y);
  return displaySide === 'left' ? stagePt : mirrorStagePoint(stagePt);
}

/**
 * Convert cone number to sub-zone letter.
 * Generic mapping used when attacker position is not available.
 */
export function coneToSubzone(cone: string | undefined): 'A' | 'B' | 'C' | 'D' | null {
  if (!cone) return null;
  const coneStr = cone.trim().toUpperCase();
  const subzone = CONE_TO_SUBZONE_GENERIC[coneStr];
  return subzone || null;
}

/**
 * Get zone reference point, handling zone + optional subzone.
 * If subzone is provided, uses subzone-specific point.
 * Otherwise uses main zone point.
 */
export function getZoneReferencePoint(
  zoneCode: string | undefined,
  subzone?: 'A' | 'B' | 'C' | 'D',
  displaySide: 'left' | 'right' = 'left',
): StagePoint | null {
  if (!zoneCode) return null;

  const normalized = zoneCode.trim().toLowerCase();

  // If we have subzone, try to find the subzone-specific point first
  if (subzone) {
    const subzoneCode = `${normalized}${subzone.toLowerCase()}`;
    const subzoneHalf = DV_HALF_COURT[subzoneCode];
    if (subzoneHalf) {
      const stagePt = halfCourtToStageLeft(subzoneHalf.x, subzoneHalf.y);
      return displaySide === 'left' ? stagePt : mirrorStagePoint(stagePt);
    }
  }

  // Fallback to main zone point
  return getZonePoint(zoneCode, displaySide);
}
