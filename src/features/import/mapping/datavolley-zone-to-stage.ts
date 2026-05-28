/**
 * DataVolley zone → OVS StagePoint mapper.
 *
 * DataVolley uses single-digit zone codes 1–9 in touch action lines
 * (fields startZone / endZone).  This module converts those codes to
 * full-stage StagePoint values ({x,y} in the 0..100 stage coordinate
 * space) and assembles skill-aware BallDirection objects for heatmap use.
 *
 * All coordinate math is inlined so the file can run under ts-node/esm
 * without requiring @src/ path-alias resolution at runtime.
 * All @src/ imports are type-only and are erased by TypeScript.
 */

import type { BallDirection, StagePoint } from '@src/domain/trajectory/types';
import type { SkillType } from '@src/domain/common/enums';

// ─── Inlined court constants (from domain/spatial/types.ts) ──────────────────
// Keep in sync with SCOUTING_SURFACE_INSET_Y, SCOUTING_SURFACE_HEIGHT, and
// SCOUTING_SIDE_WIDTH (= SCOUTING_SURFACE_WIDTH / 2).

const NET_X = 50;
const HALF_DEPTH = 38;   // SCOUTING_SIDE_WIDTH = (100 - 12*2) / 2 = 38
const INSET_Y = 12;      // SCOUTING_SURFACE_INSET_Y
const HEIGHT = 76;       // SCOUTING_SURFACE_HEIGHT = 100 - 12*2

// ─── Half-court zone coordinates ─────────────────────────────────────────────
// Each zone is expressed in the half-court system where
//   x = lateral position (0 = left edge, 100 = right edge from the viewer)
//   y = depth from net    (0 = at the net,   100 = back line)
// Values match AWAY_COURT_POSITION_COORDINATES and DATA_VOLLEY_ZONE_COORDINATES.

const DV_HALF_COURT: Record<string, StagePoint> = {
  '1': { x: 82, y: 78 },  // back right  (server position / rotation 1)
  '2': { x: 82, y: 24 },  // front right (rotation 2)
  '3': { x: 50, y: 24 },  // front center (rotation 3)
  '4': { x: 18, y: 24 },  // front left  (rotation 4)
  '5': { x: 18, y: 78 },  // back left   (rotation 5)
  '6': { x: 50, y: 78 },  // back center (rotation 6)
  '7': { x: 18, y: 76 },  // deep back left  (DataVolley extended zone 7)
  '8': { x: 50, y: 82 },  // deep back center (DataVolley extended zone 8)
  '9': { x: 82, y: 76 },  // deep back right  (DataVolley extended zone 9)
};

export type DvDisplaySide = 'left' | 'right';

// ─── Half-court → full-stage conversion ──────────────────────────────────────

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
 * Convert a single DataVolley zone code (1–9) to a full-stage StagePoint.
 *
 * `displaySide` is the side of the court this zone belongs to:
 *   - 'left'  → the left half of the stage  (home in DataVolley imports)
 *   - 'right' → the right half of the stage (away in DataVolley imports)
 *
 * Returns null for unrecognised zone codes; callers should emit a diagnostic.
 */
export function dvZoneToStagePoint(zone: string, displaySide: DvDisplaySide): StagePoint | null {
  const half = DV_HALF_COURT[zone];
  if (!half) return null;
  const leftPt = halfCourtToStageLeft(half.x, half.y);
  return displaySide === 'left' ? leftPt : mirrorStagePoint(leftPt);
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export type DvBallDirectionDiagnostic =
  | 'synthetic_from_zones'      // direction successfully generated from zone codes
  | 'missing_start_zone'        // endZone present but startZone absent or invalid
  | 'missing_end_zone'          // startZone present but endZone absent or invalid
  | 'unsupported_zone_code'     // zone value outside 1–9 (e.g. a sub-zone letter)
  | 'no_zone_data';             // no zone codes present in the action

export interface DvBallDirectionResult {
  direction: BallDirection | null;
  diagnostic: DvBallDirectionDiagnostic;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isSupportedZone(zone: string | undefined): boolean {
  return zone !== undefined && DV_HALF_COURT[zone] !== undefined;
}

function buildResult(
  startPt: StagePoint | null,
  endPt: StagePoint | null,
  startZone: string | undefined,
  endZone: string | undefined,
): DvBallDirectionResult {
  if (!startPt && !endPt) {
    return { direction: null, diagnostic: 'no_zone_data' };
  }
  if (!startPt) {
    return { direction: null, diagnostic: 'missing_start_zone' };
  }
  if (!endPt) {
    return { direction: null, diagnostic: 'missing_end_zone' };
  }
  return {
    direction: {
      start: startPt,
      end: endPt,
      courtZoneStart: startZone,
      courtZoneEnd: endZone,
    },
    diagnostic: 'synthetic_from_zones',
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build a BallDirection from DataVolley zone codes for a given skill.
 *
 * Cross-net skills (serve, attack, freeball):
 *   start = own court (`selfDisplaySide`), end = opponent court (`oppositeDisplaySide`)
 *
 * Receive:
 *   start = opponent court (where ball came from), end = own court (landing/pass target)
 *
 * Own-court skills (dig, block, set, cover):
 *   both points on own court (`selfDisplaySide`)
 *
 * @param selfDisplaySide     display side of the touch's team
 * @param oppositeDisplaySide display side of the opposing team
 */
export function dvZonesToBallDirection(input: {
  skill: SkillType;
  startZone: string | undefined;
  endZone: string | undefined;
  selfDisplaySide: DvDisplaySide;
  oppositeDisplaySide: DvDisplaySide;
}): DvBallDirectionResult {
  const { skill, startZone, endZone, selfDisplaySide, oppositeDisplaySide } = input;

  const hasAnyZone = startZone !== undefined || endZone !== undefined;
  if (!hasAnyZone) {
    return { direction: null, diagnostic: 'no_zone_data' };
  }

  const startSupported = startZone === undefined || isSupportedZone(startZone);
  const endSupported = endZone === undefined || isSupportedZone(endZone);
  if (!startSupported || !endSupported) {
    return { direction: null, diagnostic: 'unsupported_zone_code' };
  }

  switch (skill) {
    case 'serve':
    case 'attack':
    case 'freeball': {
      const startPt = startZone ? dvZoneToStagePoint(startZone, selfDisplaySide) : null;
      const endPt = endZone ? dvZoneToStagePoint(endZone, oppositeDisplaySide) : null;
      return buildResult(startPt, endPt, startZone, endZone);
    }

    case 'receive': {
      // Ball arrived from opponent's court; startZone = origin on opponent side,
      // endZone = landing / pass target on own side.
      const startPt = startZone ? dvZoneToStagePoint(startZone, oppositeDisplaySide) : null;
      const endPt = endZone ? dvZoneToStagePoint(endZone, selfDisplaySide) : null;
      return buildResult(startPt, endPt, startZone, endZone);
    }

    case 'dig':
    case 'block':
    case 'set':
    case 'cover': {
      const startPt = startZone ? dvZoneToStagePoint(startZone, selfDisplaySide) : null;
      const endPt = endZone ? dvZoneToStagePoint(endZone, selfDisplaySide) : null;
      return buildResult(startPt, endPt, startZone, endZone);
    }

    default: {
      const startPt = startZone ? dvZoneToStagePoint(startZone, selfDisplaySide) : null;
      const endPt = endZone ? dvZoneToStagePoint(endZone, selfDisplaySide) : null;
      return buildResult(startPt, endPt, startZone, endZone);
    }
  }
}
