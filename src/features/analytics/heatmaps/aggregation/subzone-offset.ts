/**
 * Converts a raw live-scouting stage point into a fractional offset within
 * its DataVolley subzone cell, so heatmaps can plot a real point instead of
 * always collapsing every touch onto the subzone's center.
 *
 * When no stage point is available (DataVolley import, text-code entry),
 * `jitterOffsetForId` provides a deterministic pseudo-random offset instead,
 * so every touch — regardless of how it was entered — resolves to a point
 * inside its subzone rather than a repeated single dot.
 */
// Value imports are relative (not @src/) so this file can be tested under
// ts-node/esm, which does not resolve the @src/ path alias at runtime.
import {
  SCOUTING_GRID_COLUMNS,
  SCOUTING_GRID_ROWS,
  SCOUTING_SIDE_WIDTH,
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
} from '../../../../domain/spatial/types';
import type { StagePoint } from '../../../../domain/trajectory/types';

export interface SubzoneOffset {
  /** 0 = DV-left edge of the subzone cell, 1 = DV-right edge. */
  dCol: number;
  /** 0 = net-side edge of the subzone cell, 1 = baseline edge. */
  dRow: number;
}

/**
 * Mirrors the physical-side mapping in datavolley-code.ts's getZoneCode
 * (column = depth/net axis, row = DV-left/right axis, direction flips
 * between sides since the two courts face each other across the net) so the
 * offset always lands inside the same subzone the point's zone code encodes.
 */
export function resolveSubzoneOffset(point: StagePoint): SubzoneOffset {
  const isAway = point.x < 50;
  const cellWidth = SCOUTING_SIDE_WIDTH / SCOUTING_GRID_COLUMNS;
  const cellHeight = SCOUTING_SURFACE_HEIGHT / SCOUTING_GRID_ROWS;
  const sideOriginX = isAway ? SCOUTING_SURFACE_INSET_X : SCOUTING_SURFACE_INSET_X + SCOUTING_SIDE_WIDTH;
  const sideOriginY = SCOUTING_SURFACE_INSET_Y;

  const rawCol = (point.x - sideOriginX) / cellWidth;
  const rawRow = (point.y - sideOriginY) / cellHeight;
  const colFrac = fractionOf(rawCol);
  const rowFrac = fractionOf(rawRow);

  return isAway
    ? { dCol: rowFrac, dRow: 1 - colFrac }
    : { dCol: 1 - rowFrac, dRow: colFrac };
}

function fractionOf(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  const frac = value - Math.floor(value);
  return Math.min(1, Math.max(0, frac));
}

/** Deterministic pseudo-random offset used when a touch has no recorded stage point. */
export function jitterOffsetForId(id: string): SubzoneOffset {
  const hash = hashString(id);
  const dCol = 0.2 + ((hash % 1000) / 1000) * 0.6;
  const dRow = 0.2 + (((hash >>> 10) % 1000) / 1000) * 0.6;
  return { dCol, dRow };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}
