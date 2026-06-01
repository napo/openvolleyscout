// Value imports are relative so this file can be tested under ts-node/esm.
// Direction extraction is inlined (not imported from trajectory/helpers) to avoid
// importing import.meta.env which ts-node rejects at type-check time.
import type { SkillEvaluation, SkillType, TeamSide } from '../../../../domain/common/enums';
import type { BallTouch } from '../../../../domain/touch/types';
import type { StagePoint } from '../../../../domain/trajectory/types';
import {
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
  SCOUTING_SURFACE_HEIGHT,
} from '../../../../domain/spatial/types';

export const DEFAULT_GRID_COLS = 12;
export const DEFAULT_GRID_ROWS = 12;

export interface HeatmapEvent {
  touchId: string;
  teamSide: TeamSide;
  skill: SkillType;
  evaluation?: SkillEvaluation | undefined;
  playerId?: string | undefined;
  setNumber: number;
  rallyNumber: number;
  start: StagePoint;
  end: StagePoint;
  isInferred: boolean;
  direction?: {
    via?: StagePoint[];
  };
}

export interface HeatmapGridCell {
  col: number;
  row: number;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  count: number;
  density: number;
}

export interface HeatmapDensityGrid {
  cells: HeatmapGridCell[];
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  maxCount: number;
  totalPoints: number;
}

function isValidPoint(p: unknown): p is StagePoint {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as StagePoint).x === 'number' &&
    typeof (p as StagePoint).y === 'number' &&
    Number.isFinite((p as StagePoint).x) &&
    Number.isFinite((p as StagePoint).y)
  );
}

function extractDirection(
  touch: BallTouch,
  prev?: BallTouch,
): { start: StagePoint; end: StagePoint } | null {
  // Primary: explicit ballDirection
  const bd = touch.ballDirection;
  if (bd && isValidPoint(bd.start) && isValidPoint(bd.end)) {
    return { start: bd.start, end: bd.end };
  }

  // Secondary: trajectory direction
  const td = touch.trajectory?.direction;
  if (td && isValidPoint(td.start) && isValidPoint(td.end)) {
    return { start: td.start, end: td.end };
  }

  // Fallback: reconstruct from zone references (DataVolley imports)
  const startPoint =
    touch.originZone?.point ??
    prev?.targetZone?.point ??
    prev?.zone?.point ??
    null;
  const endPoint = touch.targetZone?.point ?? touch.zone?.point ?? null;

  if (!isValidPoint(startPoint) || !isValidPoint(endPoint)) return null;
  return { start: startPoint, end: endPoint };
}

export function extractHeatmapEvents(touches: readonly BallTouch[]): HeatmapEvent[] {
  const events: HeatmapEvent[] = [];

  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const prev = i > 0 ? touches[i - 1] : undefined;

    const direction = extractDirection(touch, prev);
    if (!direction) continue;

    events.push({
      touchId: touch.id,
      teamSide: touch.teamSide,
      skill: touch.skill,
      evaluation: touch.evaluation,
      playerId: touch.playerId,
      setNumber: touch.setNumber,
      rallyNumber: touch.rallyNumber,
      start: direction.start,
      end: direction.end,
      isInferred:
        touch.source === 'inferred' ||
        Boolean(touch.trajectory?.inferred) ||
        (!touch.ballDirection && !touch.trajectory?.direction),
    });
  }

  return events;
}

export function buildDensityGrid(
  events: readonly HeatmapEvent[],
  useEndPoint = true,
  cols = DEFAULT_GRID_COLS,
  rows = DEFAULT_GRID_ROWS,
  teamSide?: 'home' | 'away',
): HeatmapDensityGrid {
  const cellWidth = SCOUTING_SURFACE_WIDTH / cols;
  const cellHeight = SCOUTING_SURFACE_HEIGHT / rows;

  const counts = new Map<string, number>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (teamSide && event.teamSide !== teamSide) continue;
    const pt = useEndPoint ? event.end : event.start;
    const col = Math.min(
      cols - 1,
      Math.max(0, Math.floor((pt.x - SCOUTING_SURFACE_INSET_X) / cellWidth)),
    );
    const row = Math.min(
      rows - 1,
      Math.max(0, Math.floor((pt.y - SCOUTING_SURFACE_INSET_Y) / cellHeight)),
    );
    const key = `${col}:${row}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let maxCount = 0;
  counts.forEach((v) => {
    if (v > maxCount) maxCount = v;
  });

  const cells: HeatmapGridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const count = counts.get(`${col}:${row}`) ?? 0;
      if (count === 0) continue;
      const cellX = SCOUTING_SURFACE_INSET_X + col * cellWidth;
      const cellY = SCOUTING_SURFACE_INSET_Y + row * cellHeight;
      cells.push({
        col,
        row,
        x: cellX + cellWidth / 2,
        y: cellY + cellHeight / 2,
        cellX,
        cellY,
        cellWidth,
        cellHeight,
        count,
        density: maxCount > 0 ? count / maxCount : 0,
      });
    }
  }

  return { cells, cols, rows, cellWidth, cellHeight, maxCount, totalPoints: events.length };
}

export function countInferredEvents(events: readonly HeatmapEvent[]): number {
  return events.filter((e) => e.isInferred).length;
}
