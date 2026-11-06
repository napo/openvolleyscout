/**
 * Pure model and SVG renderer for the free tactical drawing board (Phase 5):
 * multi-sheet management, shape creation/movement/editing, undo/redo history,
 * JSON serialization, and self-contained SVG output shared by screen and PDF.
 */
import type {
  OpponentReportArrowShape,
  OpponentReportConeShape,
  OpponentReportDrawing,
  OpponentReportDrawingTeam,
  OpponentReportPlayerShape,
  OpponentReportShape,
  OpponentReportTextShape,
} from '@src/domain/opponent-report/types';

export const TEAM_COLORS: Record<OpponentReportDrawingTeam, { fill: string; stroke: string; text: string }> = {
  opponent: { fill: '#dc2626', stroke: '#991b1b', text: '#ffffff' },
  own: { fill: '#2563eb', stroke: '#1e40af', text: '#ffffff' },
};

export function clampCourtCoord(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

// ── Multi-sheet operations ──────────────────────────────────────────────────

export function createTacticalDrawing(input: {
  id: string;
  title?: string;
  note?: string;
  court?: 'half' | 'full';
  orientation?: 'horizontal' | 'vertical';
  shapes?: OpponentReportShape[];
}): OpponentReportDrawing {
  return {
    id: input.id,
    title: input.title ?? '',
    note: input.note ?? '',
    court: input.court ?? 'half',
    orientation: input.orientation ?? 'vertical',
    shapes: input.shapes ? input.shapes.map((shape) => ({ ...shape })) : [],
  };
}

export function addTacticalDrawing(
  drawings: readonly OpponentReportDrawing[],
  drawing: OpponentReportDrawing,
): OpponentReportDrawing[] {
  return [...drawings, drawing];
}

export function duplicateTacticalDrawing(
  drawings: readonly OpponentReportDrawing[],
  drawingId: string,
  newId: string,
  copyTitle: string,
): OpponentReportDrawing[] {
  const index = drawings.findIndex((entry) => entry.id === drawingId);
  if (index < 0) return [...drawings];
  const source = drawings[index];
  const copy: OpponentReportDrawing = {
    ...source,
    id: newId,
    title: copyTitle,
    shapes: source.shapes.map((shape, shapeIndex) => ({
      ...shape,
      id: `${newId}-s${shapeIndex + 1}`,
    })),
  };
  const next = [...drawings];
  next.splice(index + 1, 0, copy);
  return next;
}

export function moveTacticalDrawing(
  drawings: readonly OpponentReportDrawing[],
  index: number,
  delta: number,
): OpponentReportDrawing[] {
  const target = index + delta;
  if (index < 0 || index >= drawings.length || target < 0 || target >= drawings.length) {
    return [...drawings];
  }
  const next = [...drawings];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function removeTacticalDrawing(
  drawings: readonly OpponentReportDrawing[],
  drawingId: string,
): OpponentReportDrawing[] {
  return drawings.filter((entry) => entry.id !== drawingId);
}

export function updateTacticalDrawing(
  drawings: readonly OpponentReportDrawing[],
  drawingId: string,
  change: (drawing: OpponentReportDrawing) => OpponentReportDrawing,
): OpponentReportDrawing[] {
  return drawings.map((entry) => (entry.id === drawingId ? change(entry) : entry));
}

// ── Shape creation, movement & editing ──────────────────────────────────────

export function addDrawingShape(
  drawing: OpponentReportDrawing,
  shape: OpponentReportShape,
): OpponentReportDrawing {
  return {
    ...drawing,
    shapes: [...drawing.shapes, shape],
  };
}

export function updateDrawingShape(
  drawing: OpponentReportDrawing,
  shapeId: string,
  updater: (shape: OpponentReportShape) => OpponentReportShape,
): OpponentReportDrawing {
  return {
    ...drawing,
    shapes: drawing.shapes.map((shape) => (shape.id === shapeId ? updater(shape) : shape)),
  };
}

/**
 * Moves a shape to a new court position (`0..100`).
 * - For `player` and `text`, sets `(x, y)` directly.
 * - For `arrow`, translates the whole arrow so its midpoint moves to `(x, y)`
 *   while keeping all points inside `[0, 100]`.
 */
export function moveDrawingShape(
  drawing: OpponentReportDrawing,
  shapeId: string,
  position: { x: number; y: number },
): OpponentReportDrawing {
  return updateDrawingShape(drawing, shapeId, (shape) => {
    if (shape.kind === 'player' || shape.kind === 'text' || shape.kind === 'area') {
      return {
        ...shape,
        x: clampCourtCoord(position.x),
        y: clampCourtCoord(position.y),
      };
    }
    if (shape.kind === 'cone') {
      const cx = (shape.x1 + shape.x2 + shape.x3) / 3;
      const cy = (shape.y1 + shape.y2 + shape.y3) / 3;
      return translateConeShape(shape, position.x - cx, position.y - cy);
    }
    const midX = (shape.x1 + shape.x2) / 2;
    const midY = (shape.y1 + shape.y2) / 2;
    return translateArrowShape(shape, position.x - midX, position.y - midY);
  });
}

function translateConeShape(
  cone: OpponentReportConeShape,
  dx: number,
  dy: number,
): OpponentReportConeShape {
  const xs = [cone.x1, cone.x2, cone.x3];
  const ys = [cone.y1, cone.y2, cone.y3];
  const minDx = -Math.min(...xs);
  const maxDx = 100 - Math.max(...xs);
  const minDy = -Math.min(...ys);
  const maxDy = 100 - Math.max(...ys);
  const clampedDx = Math.min(maxDx, Math.max(minDx, dx));
  const clampedDy = Math.min(maxDy, Math.max(minDy, dy));
  return {
    ...cone,
    x1: clampCourtCoord(cone.x1 + clampedDx),
    y1: clampCourtCoord(cone.y1 + clampedDy),
    x2: clampCourtCoord(cone.x2 + clampedDx),
    y2: clampCourtCoord(cone.y2 + clampedDy),
    x3: clampCourtCoord(cone.x3 + clampedDx),
    y3: clampCourtCoord(cone.y3 + clampedDy),
  };
}

export function translateDrawingCone(
  drawing: OpponentReportDrawing,
  shapeId: string,
  dx: number,
  dy: number,
): OpponentReportDrawing {
  return updateDrawingShape(drawing, shapeId, (shape) => (
    shape.kind === 'cone' ? translateConeShape(shape, dx, dy) : shape
  ));
}

export function updateConeHandle(
  drawing: OpponentReportDrawing,
  shapeId: string,
  handle: 'apex' | 'left' | 'right',
  x: number,
  y: number,
): OpponentReportDrawing {
  const cx = clampCourtCoord(x);
  const cy = clampCourtCoord(y);
  return updateDrawingShape(drawing, shapeId, (shape) => {
    if (shape.kind !== 'cone') return shape;
    if (handle === 'apex') return { ...shape, x1: cx, y1: cy };
    if (handle === 'left') return { ...shape, x2: cx, y2: cy };
    return { ...shape, x3: cx, y3: cy };
  });
}

function translateArrowShape(
  arrow: OpponentReportArrowShape,
  dx: number,
  dy: number,
): OpponentReportArrowShape {
  const xs = [arrow.x1, arrow.x2, ...(arrow.cx !== undefined ? [arrow.cx] : [])];
  const ys = [arrow.y1, arrow.y2, ...(arrow.cy !== undefined ? [arrow.cy] : [])];
  const minDx = -Math.min(...xs);
  const maxDx = 100 - Math.max(...xs);
  const minDy = -Math.min(...ys);
  const maxDy = 100 - Math.max(...ys);
  const clampedDx = Math.min(maxDx, Math.max(minDx, dx));
  const clampedDy = Math.min(maxDy, Math.max(minDy, dy));
  return {
    ...arrow,
    x1: clampCourtCoord(arrow.x1 + clampedDx),
    y1: clampCourtCoord(arrow.y1 + clampedDy),
    x2: clampCourtCoord(arrow.x2 + clampedDx),
    y2: clampCourtCoord(arrow.y2 + clampedDy),
    ...(arrow.cx !== undefined && arrow.cy !== undefined
      ? {
        cx: clampCourtCoord(arrow.cx + clampedDx),
        cy: clampCourtCoord(arrow.cy + clampedDy),
      }
      : {}),
  };
}

export function translateDrawingArrow(
  drawing: OpponentReportDrawing,
  shapeId: string,
  dx: number,
  dy: number,
): OpponentReportDrawing {
  return updateDrawingShape(drawing, shapeId, (shape) => (
    shape.kind === 'arrow' ? translateArrowShape(shape, dx, dy) : shape
  ));
}

export function updateArrowHandle(
  drawing: OpponentReportDrawing,
  shapeId: string,
  handle: 'start' | 'end' | 'control',
  x: number,
  y: number,
): OpponentReportDrawing {
  const cx = clampCourtCoord(x);
  const cy = clampCourtCoord(y);
  return updateDrawingShape(drawing, shapeId, (shape) => {
    if (shape.kind !== 'arrow') return shape;
    if (handle === 'start') return { ...shape, x1: cx, y1: cy };
    if (handle === 'end') return { ...shape, x2: cx, y2: cy };
    return { ...shape, cx, cy };
  });
}

export function resetArrowCurve(
  drawing: OpponentReportDrawing,
  shapeId: string,
): OpponentReportDrawing {
  return updateDrawingShape(drawing, shapeId, (shape) => {
    if (shape.kind !== 'arrow') return shape;
    const { cx: _cx, cy: _cy, ...rest } = shape;
    return rest;
  });
}

export function removeDrawingShape(
  drawing: OpponentReportDrawing,
  shapeId: string,
): OpponentReportDrawing {
  return {
    ...drawing,
    shapes: drawing.shapes.filter((shape) => shape.id !== shapeId),
  };
}

// ── Undo / Redo stack ───────────────────────────────────────────────────────

export interface DrawingHistoryState {
  past: OpponentReportShape[][];
  present: OpponentReportShape[];
  future: OpponentReportShape[][];
}

const MAX_HISTORY_STEPS = 40;

export function createDrawingHistory(initial: readonly OpponentReportShape[] = []): DrawingHistoryState {
  return {
    past: [],
    present: initial.map((shape) => ({ ...shape })),
    future: [],
  };
}

export function pushDrawingHistory(
  history: DrawingHistoryState,
  next: readonly OpponentReportShape[],
): DrawingHistoryState {
  const nextClone = next.map((shape) => ({ ...shape }));
  if (JSON.stringify(history.present) === JSON.stringify(nextClone)) {
    return history;
  }
  const past = [...history.past, history.present].slice(-MAX_HISTORY_STEPS);
  return {
    past,
    present: nextClone,
    future: [],
  };
}

export function undoDrawingHistory(history: DrawingHistoryState): DrawingHistoryState {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous.map((shape) => ({ ...shape })),
    future: [history.present, ...history.future],
  };
}

export function redoDrawingHistory(history: DrawingHistoryState): DrawingHistoryState {
  if (history.future.length === 0) return history;
  const [next, ...restFuture] = history.future;
  return {
    past: [...history.past, history.present],
    present: next.map((shape) => ({ ...shape })),
    future: restFuture,
  };
}

// ── JSON normalization & serialization ──────────────────────────────────────

function isTeam(value: unknown): value is OpponentReportDrawingTeam {
  return value === 'opponent' || value === 'own';
}

export function normalizeOpponentReportShape(raw: unknown): OpponentReportShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
  if (!id) return null;

  if (record.kind === 'area') {
    if (![record.x, record.y, record.rx, record.ry].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
    return { id, kind: 'area', x: clampCourtCoord(Number(record.x)), y: clampCourtCoord(Number(record.y)), rx: Math.max(1, Math.min(50, Number(record.rx))), ry: Math.max(1, Math.min(50, Number(record.ry))) };
  }
  if (record.kind === 'player') {
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const radius = record.radius !== undefined ? Number(record.radius) : undefined;
    const shape: OpponentReportPlayerShape = {
      id,
      kind: 'player',
      team: isTeam(record.team) ? record.team : 'opponent',
      number: typeof record.number === 'string' ? record.number.slice(0, 12) : String(record.number ?? ''),
      ...(typeof record.label === 'string' && record.label.trim() ? { label: record.label.trim() } : {}),
      x: clampCourtCoord(x),
      y: clampCourtCoord(y),
      ...(typeof record.fillColor === 'string' && record.fillColor ? { fillColor: record.fillColor } : {}),
      ...(typeof record.strokeColor === 'string' && record.strokeColor ? { strokeColor: record.strokeColor } : {}),
      ...(typeof record.textColor === 'string' && record.textColor ? { textColor: record.textColor } : {}),
      ...(radius !== undefined && Number.isFinite(radius) && radius > 0 ? { radius } : {}),
    };
    return shape;
  }

  if (record.kind === 'arrow') {
    const x1 = Number(record.x1);
    const y1 = Number(record.y1);
    const x2 = Number(record.x2);
    const y2 = Number(record.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    const cx = record.cx !== undefined ? Number(record.cx) : undefined;
    const cy = record.cy !== undefined ? Number(record.cy) : undefined;
    const hasCurve = cx !== undefined && cy !== undefined && Number.isFinite(cx) && Number.isFinite(cy);
    const strokeWidth = record.strokeWidth !== undefined ? Number(record.strokeWidth) : undefined;
    const shape: OpponentReportArrowShape = {
      id,
      kind: 'arrow',
      team: isTeam(record.team) ? record.team : 'opponent',
      x1: clampCourtCoord(x1),
      y1: clampCourtCoord(y1),
      x2: clampCourtCoord(x2),
      y2: clampCourtCoord(y2),
      ...(hasCurve ? { cx: clampCourtCoord(cx), cy: clampCourtCoord(cy) } : {}),
      ...(typeof record.color === 'string' && record.color ? { color: record.color } : {}),
      ...(strokeWidth !== undefined && Number.isFinite(strokeWidth) && strokeWidth > 0 ? { strokeWidth } : {}),
    };
    return shape;
  }

  if (record.kind === 'cone') {
    const x1 = Number(record.x1);
    const y1 = Number(record.y1);
    const x2 = Number(record.x2);
    const y2 = Number(record.y2);
    const x3 = Number(record.x3);
    const y3 = Number(record.y3);
    if (![x1, y1, x2, y2, x3, y3].every(Number.isFinite)) return null;
    const opacity = record.opacity !== undefined ? Number(record.opacity) : undefined;
    const shape: OpponentReportConeShape = {
      id,
      kind: 'cone',
      team: isTeam(record.team) ? record.team : 'opponent',
      x1: clampCourtCoord(x1),
      y1: clampCourtCoord(y1),
      x2: clampCourtCoord(x2),
      y2: clampCourtCoord(y2),
      x3: clampCourtCoord(x3),
      y3: clampCourtCoord(y3),
      ...(typeof record.color === 'string' && record.color ? { color: record.color } : {}),
      ...(opacity !== undefined && Number.isFinite(opacity) ? { opacity: Math.min(1, Math.max(0.05, opacity)) } : {}),
    };
    return shape;
  }

  if (record.kind === 'text') {
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const text = typeof record.text === 'string' ? record.text : '';
    const fontSize = record.fontSize !== undefined ? Number(record.fontSize) : undefined;
    const anchor = record.anchor === 'start' || record.anchor === 'end' || record.anchor === 'middle'
      ? record.anchor
      : undefined;
    const shape: OpponentReportTextShape = {
      id,
      kind: 'text',
      text,
      x: clampCourtCoord(x),
      y: clampCourtCoord(y),
      ...(typeof record.color === 'string' && record.color ? { color: record.color } : {}),
      ...(fontSize !== undefined && Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
      ...(anchor ? { anchor } : {}),
    };
    return shape;
  }

  return null;
}

export function normalizeOpponentReportDrawing(raw: unknown): OpponentReportDrawing | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
  if (!id) return null;
  const court = record.court === 'full' ? 'full' : 'half';
  const orientation = record.orientation === 'horizontal' ? 'horizontal' : 'vertical';
  const shapesRaw = Array.isArray(record.shapes) ? record.shapes : [];
  const shapes = shapesRaw
    .map(normalizeOpponentReportShape)
    .filter((entry): entry is OpponentReportShape => entry !== null);
  const viewBoxWidth = record.viewBoxWidth !== undefined ? Number(record.viewBoxWidth) : undefined;
  const viewBoxHeight = record.viewBoxHeight !== undefined ? Number(record.viewBoxHeight) : undefined;
  return {
    id,
    title: typeof record.title === 'string' ? record.title : '',
    note: typeof record.note === 'string' ? record.note : '',
    court,
    orientation,
    shapes,
    ...(typeof record.backgroundSvg === 'string' && record.backgroundSvg ? { backgroundSvg: record.backgroundSvg } : {}),
    ...(viewBoxWidth !== undefined && Number.isFinite(viewBoxWidth) && viewBoxWidth > 0 ? { viewBoxWidth } : {}),
    ...(viewBoxHeight !== undefined && Number.isFinite(viewBoxHeight) && viewBoxHeight > 0 ? { viewBoxHeight } : {}),
  };
}

export function serializeTacticalDrawings(drawings: readonly OpponentReportDrawing[]): string {
  return JSON.stringify(drawings);
}

export function deserializeTacticalDrawings(json: string): OpponentReportDrawing[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeOpponentReportDrawing)
      .filter((entry): entry is OpponentReportDrawing => entry !== null);
  } catch {
    return [];
  }
}

// ── Geometry & SVG rendering ────────────────────────────────────────────────

export interface TacticalBoardDimensions {
  width: number;
  height: number;
  margin: number;
  courtLeft: number;
  courtTop: number;
  courtWidth: number;
  courtHeight: number;
}

export function getTacticalBoardDimensions(
  court: 'half' | 'full',
  orientation: 'horizontal' | 'vertical',
): TacticalBoardDimensions {
  const margin = 20;
  if (court === 'half') {
    const width = 320;
    const height = 320;
    return {
      width,
      height,
      margin,
      courtLeft: margin,
      courtTop: margin,
      courtWidth: width - margin * 2,
      courtHeight: height - margin * 2,
    };
  }
  if (orientation === 'vertical') {
    const width = 300;
    const height = 540;
    return {
      width,
      height,
      margin,
      courtLeft: margin,
      courtTop: margin,
      courtWidth: width - margin * 2,
      courtHeight: height - margin * 2,
    };
  }
  const width = 540;
  const height = 300;
  return {
    width,
    height,
    margin,
    courtLeft: margin,
    courtTop: margin,
    courtWidth: width - margin * 2,
    courtHeight: height - margin * 2,
  };
}

export function getTacticalBoardDimensionsForDrawing(
  drawing: Pick<OpponentReportDrawing, 'court' | 'orientation' | 'backgroundSvg' | 'viewBoxWidth' | 'viewBoxHeight'>,
): TacticalBoardDimensions {
  if (drawing.backgroundSvg && drawing.viewBoxWidth && drawing.viewBoxHeight) {
    return {
      width: drawing.viewBoxWidth,
      height: drawing.viewBoxHeight,
      margin: 0,
      courtLeft: 0,
      courtTop: 0,
      courtWidth: drawing.viewBoxWidth,
      courtHeight: drawing.viewBoxHeight,
    };
  }
  return getTacticalBoardDimensions(drawing.court, drawing.orientation);
}

export function courtPercentToSvgPoint(
  x: number,
  y: number,
  dims: TacticalBoardDimensions,
): { x: number; y: number } {
  return {
    x: dims.courtLeft + (clampCourtCoord(x) / 100) * dims.courtWidth,
    y: dims.courtTop + (clampCourtCoord(y) / 100) * dims.courtHeight,
  };
}

export function arrowMidpoint(arrow: OpponentReportArrowShape): { x: number; y: number } {
  if (arrow.cx !== undefined && arrow.cy !== undefined) {
    // Point on quadratic Bezier at t = 0.5: 0.25*P0 + 0.5*C + 0.25*P1
    return {
      x: clampCourtCoord(0.25 * arrow.x1 + 0.5 * arrow.cx + 0.25 * arrow.x2),
      y: clampCourtCoord(0.25 * arrow.y1 + 0.5 * arrow.cy + 0.25 * arrow.y2),
    };
  }
  return {
    x: clampCourtCoord((arrow.x1 + arrow.x2) / 2),
    y: clampCourtCoord((arrow.y1 + arrow.y2) / 2),
  };
}

export function coneCentroid(cone: OpponentReportConeShape): { x: number; y: number } {
  return {
    x: clampCourtCoord((cone.x1 + cone.x2 + cone.x3) / 3),
    y: clampCourtCoord((cone.y1 + cone.y2 + cone.y3) / 3),
  };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function readAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? match[1] : undefined;
}

/**
 * Converts a generated analysis court SVG (`buildReceptionFormationSvg`,
 * `buildSetterRotationCourtSvg`, `buildAttackerCourtSvg`, `buildServerCourtSvg`,
 * `buildServeTargetCourtSvg`) into an editable `OpponentReportDrawing` where
 * cones/polygons, player/zone circles, arrows, and text labels become
 * selectable and draggable vector shapes while court lines/cells stay in `backgroundSvg`.
 */
export function extractEditableDrawingFromSvg(
  svgString: string,
  id: string,
  title = '',
): OpponentReportDrawing {
  const widthAttr = Number(readAttr(svgString, 'width') ?? 270);
  const heightAttr = Number(readAttr(svgString, 'height') ?? 300);
  const viewBoxWidth = Number.isFinite(widthAttr) && widthAttr > 0 ? widthAttr : 270;
  const viewBoxHeight = Number.isFinite(heightAttr) && heightAttr > 0 ? heightAttr : 300;
  const toPctX = (px: number) => clampCourtCoord((px / viewBoxWidth) * 100);
  const toPctY = (py: number) => clampCourtCoord((py / viewBoxHeight) * 100);

  // Strip outer <svg ...>, </svg>, <title>...</title>, and <defs>...</defs>
  const inner = svgString
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>[\s\S]*$/i, '')
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<defs>[\s\S]*?<\/defs>/gi, '');

  const shapes: OpponentReportShape[] = [];
  let shapeIndex = 1;
  const nextId = (prefix: string) => `${id}-${prefix}-${shapeIndex++}`;

  // 1. Collect all <circle .../> and <text ...>...</text> so we can pair circles with inner jersey text
  interface ParsedCircle {
    raw: string;
    cx: number;
    cy: number;
    r: number;
    fill: string;
    stroke: string;
  }
  interface ParsedText {
    raw: string;
    x: number;
    y: number;
    text: string;
    fill: string;
    fontSize: number;
    anchor: 'start' | 'middle' | 'end';
    isHalo: boolean;
    consumed: boolean;
  }

  const circles: ParsedCircle[] = [];
  const texts: ParsedText[] = [];
  const backgroundParts: string[] = [];

  const tokenRegex = /<ellipse\b[^>]*\/>|<polygon\b[^>]*\/>|<circle\b[^>]*\/>|<line\b[^>]*\/>|<rect\b[^>]*\/>|<path\b[^>]*\/>|<text\b[^>]*>[\s\S]*?<\/text>/gi;
  const tokens = inner.match(tokenRegex) ?? [];

  for (const token of tokens) {
    if (/^<ellipse\b/i.test(token)) {
      const x = Number(readAttr(token, 'cx'));
      const y = Number(readAttr(token, 'cy'));
      const rx = Number(readAttr(token, 'rx'));
      const ry = Number(readAttr(token, 'ry'));
      if ([x, y, rx, ry].every(Number.isFinite)) shapes.push({ id: nextId('area'), kind: 'area', x: toPctX(x), y: toPctY(y), rx: rx / viewBoxWidth * 100, ry: ry / viewBoxHeight * 100 });
      continue;
    }
    if (/^<polygon\b/i.test(token)) {
      const pointsStr = readAttr(token, 'points') ?? '';
      const coords = pointsStr
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
        .filter((pair) => pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
      if (coords.length >= 3) {
        const fill = readAttr(token, 'fill') ?? '#dc2626';
        const opacity = Number(readAttr(token, 'fill-opacity') ?? 0.28);
        shapes.push({
          id: nextId('cone'),
          kind: 'cone',
          team: fill === '#2563eb' ? 'own' : 'opponent',
          x1: toPctX(coords[0][0]),
          y1: toPctY(coords[0][1]),
          x2: toPctX(coords[1][0]),
          y2: toPctY(coords[1][1]),
          x3: toPctX(coords[2][0]),
          y3: toPctY(coords[2][1]),
          color: fill,
          opacity: Number.isFinite(opacity) ? opacity : 0.28,
        });
      }
      continue;
    }

    if (/^<line\b/i.test(token)) {
      const markerEnd = readAttr(token, 'marker-end');
      if (markerEnd) {
        const x1 = Number(readAttr(token, 'x1') ?? 0);
        const y1 = Number(readAttr(token, 'y1') ?? 0);
        const x2 = Number(readAttr(token, 'x2') ?? 0);
        const y2 = Number(readAttr(token, 'y2') ?? 0);
        const stroke = readAttr(token, 'stroke') ?? '#111827';
        const strokeWidth = Number(readAttr(token, 'stroke-width') ?? 2.5);
        shapes.push({
          id: nextId('arrow'),
          kind: 'arrow',
          team: 'opponent',
          x1: toPctX(x1),
          y1: toPctY(y1),
          x2: toPctX(x2),
          y2: toPctY(y2),
          color: stroke,
          ...(Number.isFinite(strokeWidth) && strokeWidth > 0 ? { strokeWidth } : {}),
        });
      } else {
        backgroundParts.push(token);
      }
      continue;
    }

    if (/^<circle\b/i.test(token)) {
      const cx = Number(readAttr(token, 'cx') ?? 0);
      const cy = Number(readAttr(token, 'cy') ?? 0);
      const r = Number(readAttr(token, 'r') ?? 14);
      const fill = readAttr(token, 'fill') ?? '#dc2626';
      const stroke = readAttr(token, 'stroke') ?? '#ffffff';
      // Small vertex dots (r <= 5) belong to cones, which render their own apex dot
      if (r > 5) {
        circles.push({ raw: token, cx, cy, r, fill, stroke });
      }
      continue;
    }

    if (/^<text\b/i.test(token)) {
      const x = Number(readAttr(token, 'x') ?? 0);
      const y = Number(readAttr(token, 'y') ?? 0);
      const fill = readAttr(token, 'fill') ?? '#0f172a';
      const fontSize = Number(readAttr(token, 'font-size') ?? 10);
      const anchorRaw = readAttr(token, 'text-anchor');
      const anchor: 'start' | 'middle' | 'end' =
        anchorRaw === 'start' || anchorRaw === 'end' || anchorRaw === 'middle'
          ? anchorRaw
          : 'start';
      const isHalo = readAttr(token, 'stroke') === '#ffffff' && readAttr(token, 'paint-order') === 'stroke';
      const contentMatch = token.match(/^<text\b[^>]*>([\s\S]*?)<\/text>$/i);
      const text = unescapeXml((contentMatch ? contentMatch[1] : '').trim());
      if (text) {
        texts.push({
          raw: token,
          x,
          y,
          text,
          fill,
          fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 10,
          anchor,
          isHalo,
          consumed: false,
        });
      }
      continue;
    }

    backgroundParts.push(token);
  }

  // Pair circles with their centered inner text label
  for (const circle of circles) {
    const innerText = texts.find(
      (entry) => !entry.consumed
        && Math.abs(entry.x - circle.cx) <= circle.r * 0.9
        && Math.abs(entry.y - circle.cy) <= circle.r * 0.9,
    );
    if (innerText) {
      innerText.consumed = true;
    }
    shapes.push({
      id: nextId('player'),
      kind: 'player',
      team: 'opponent',
      number: innerText ? innerText.text : '',
      x: toPctX(circle.cx),
      y: toPctY(circle.cy),
      fillColor: circle.fill,
      strokeColor: circle.stroke,
      textColor: innerText ? innerText.fill : '#ffffff',
      radius: circle.r,
    });
  }

  // Convert remaining texts (deduplicating stroke-halo copies)
  for (let index = 0; index < texts.length; index += 1) {
    const entry = texts[index];
    if (entry.consumed) continue;
    const duplicate = texts.find(
      (other, otherIndex) => otherIndex > index
        && !other.consumed
        && Math.abs(other.x - entry.x) < 0.5
        && Math.abs(other.y - entry.y) < 0.5
        && other.text === entry.text,
    );
    if (entry.isHalo && duplicate) {
      continue;
    }
    shapes.push({
      id: nextId('text'),
      kind: 'text',
      text: entry.text,
      x: toPctX(entry.x),
      y: toPctY(entry.y),
      color: entry.fill,
      fontSize: entry.fontSize,
      anchor: entry.anchor,
    });
  }

  return {
    id,
    title,
    note: '',
    court: 'half',
    orientation: 'vertical',
    shapes,
    backgroundSvg: backgroundParts.join(''),
    viewBoxWidth,
    viewBoxHeight,
  };
}

export function buildTacticalBoardCourtLinesSvg(
  court: 'half' | 'full',
  orientation: 'horizontal' | 'vertical',
  dims: TacticalBoardDimensions,
  netLabel?: string,
): string {
  const { courtLeft, courtTop, courtWidth, courtHeight } = dims;
  const lines: string[] = [
    `<rect x="${courtLeft}" y="${courtTop}" width="${courtWidth}" height="${courtHeight}" fill="#f8fafc" stroke="#002554" stroke-width="1.6"/>`,
  ];

  if (court === 'half' && orientation === 'vertical') {
    const attackY = courtTop + courtHeight / 3;
    lines.push(
      `<line data-court-line="3m" x1="${courtLeft}" y1="${attackY.toFixed(1)}" x2="${courtLeft + courtWidth}" y2="${attackY.toFixed(1)}" stroke="#002554" stroke-width="1.2" stroke-dasharray="6 4"/>`,
      `<line data-court-line="net" x1="${courtLeft - 6}" y1="${courtTop}" x2="${courtLeft + courtWidth + 6}" y2="${courtTop}" stroke="#002554" stroke-width="4.5"/>`,
    );
    if (netLabel) {
      lines.push(`<text x="${courtLeft + courtWidth / 2}" y="${courtTop - 6}" font-size="9.5" font-weight="600" fill="#002554" text-anchor="middle">${escapeXml(netLabel)}</text>`);
    }
  } else if (court === 'half' && orientation === 'horizontal') {
    const netX = courtLeft + courtWidth;
    const attackX = courtLeft + (courtWidth * 2) / 3;
    lines.push(
      `<line data-court-line="3m" x1="${attackX.toFixed(1)}" y1="${courtTop}" x2="${attackX.toFixed(1)}" y2="${courtTop + courtHeight}" stroke="#002554" stroke-width="1.2" stroke-dasharray="6 4"/>`,
      `<line data-court-line="net" x1="${netX}" y1="${courtTop - 6}" x2="${netX}" y2="${courtTop + courtHeight + 6}" stroke="#002554" stroke-width="4.5"/>`,
    );
    if (netLabel) {
      lines.push(`<text x="${netX - 6}" y="${courtTop - 6}" font-size="9.5" font-weight="600" fill="#002554" text-anchor="end">${escapeXml(netLabel)}</text>`);
    }
  } else if (court === 'full' && orientation === 'vertical') {
    const netY = courtTop + courtHeight / 2;
    const topAttackY = netY - courtHeight / 6;
    const bottomAttackY = netY + courtHeight / 6;
    lines.push(
      `<line data-court-line="3m-top" x1="${courtLeft}" y1="${topAttackY.toFixed(1)}" x2="${courtLeft + courtWidth}" y2="${topAttackY.toFixed(1)}" stroke="#002554" stroke-width="1.2" stroke-dasharray="6 4"/>`,
      `<line data-court-line="3m-bottom" x1="${courtLeft}" y1="${bottomAttackY.toFixed(1)}" x2="${courtLeft + courtWidth}" y2="${bottomAttackY.toFixed(1)}" stroke="#002554" stroke-width="1.2" stroke-dasharray="6 4"/>`,
      `<line data-court-line="net" x1="${courtLeft - 6}" y1="${netY.toFixed(1)}" x2="${courtLeft + courtWidth + 6}" y2="${netY.toFixed(1)}" stroke="#002554" stroke-width="4.5"/>`,
    );
  } else {
    const netX = courtLeft + courtWidth / 2;
    const leftAttackX = netX - courtWidth / 6;
    const rightAttackX = netX + courtWidth / 6;
    lines.push(
      `<line data-court-line="3m-left" x1="${leftAttackX.toFixed(1)}" y1="${courtTop}" x2="${leftAttackX.toFixed(1)}" y2="${courtTop + courtHeight}" stroke="#002554" stroke-width="1.2" stroke-dasharray="6 4"/>`,
      `<line data-court-line="3m-right" x1="${rightAttackX.toFixed(1)}" y1="${courtTop}" x2="${rightAttackX.toFixed(1)}" y2="${courtTop + courtHeight}" stroke="#002554" stroke-width="1.2" stroke-dasharray="6 4"/>`,
      `<line data-court-line="net" x1="${netX.toFixed(1)}" y1="${courtTop - 6}" x2="${netX.toFixed(1)}" y2="${courtTop + courtHeight + 6}" stroke="#002554" stroke-width="4.5"/>`,
    );
  }

  return lines.join('');
}

/**
 * Self-contained SVG of a tactical or extracted court drawing sheet, used
 * directly in the PDF and matching the interactive board on screen.
 */
export function buildTacticalBoardSvg(
  drawing: OpponentReportDrawing,
  options: { netLabel?: string } = {},
): string {
  const dims = getTacticalBoardDimensionsForDrawing(drawing);
  const { width, height } = dims;

  const cones = drawing.shapes
    .filter((shape): shape is OpponentReportConeShape => shape.kind === 'cone')
    .map((cone) => {
      const p1 = courtPercentToSvgPoint(cone.x1, cone.y1, dims);
      const p2 = courtPercentToSvgPoint(cone.x2, cone.y2, dims);
      const p3 = courtPercentToSvgPoint(cone.x3, cone.y3, dims);
      const fill = cone.color ?? TEAM_COLORS[cone.team].fill;
      const opacity = cone.opacity ?? 0.28;
      return [
        `<polygon data-shape-id="${escapeXml(cone.id)}" data-shape-kind="cone" points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-opacity="0.55" stroke-width="1"/>`,
        `<circle cx="${p1.x.toFixed(1)}" cy="${p1.y.toFixed(1)}" r="3.2" fill="${fill}" stroke="#ffffff" stroke-width="1"/>`,
      ].join('');
    });

  const customArrowDefs: string[] = [];
  const arrows = drawing.shapes
    .filter((shape): shape is OpponentReportArrowShape => shape.kind === 'arrow')
    .map((arrow, index) => {
      const start = courtPercentToSvgPoint(arrow.x1, arrow.y1, dims);
      const end = courtPercentToSvgPoint(arrow.x2, arrow.y2, dims);
      const color = arrow.color ?? TEAM_COLORS[arrow.team].stroke;
      const strokeWidth = arrow.strokeWidth ?? 2.6;
      const markerId = arrow.color ? `board-arrow-custom-${index}` : `board-arrow-${arrow.team}`;
      if (arrow.color) {
        customArrowDefs.push(
          `<marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`,
        );
      }
      if (arrow.cx !== undefined && arrow.cy !== undefined) {
        const control = courtPercentToSvgPoint(arrow.cx, arrow.cy, dims);
        const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
        return `<path data-shape-id="${escapeXml(arrow.id)}" data-shape-kind="arrow" d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="url(#${markerId})"/>`;
      }
      return `<line data-shape-id="${escapeXml(arrow.id)}" data-shape-kind="arrow" x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="url(#${markerId})"/>`;
    });

  const players = drawing.shapes
    .filter((shape): shape is OpponentReportPlayerShape => shape.kind === 'player')
    .map((player) => {
      const pt = courtPercentToSvgPoint(player.x, player.y, dims);
      const colors = TEAM_COLORS[player.team];
      const fill = player.fillColor ?? colors.fill;
      const stroke = player.strokeColor ?? colors.stroke;
      const textColor = player.textColor ?? colors.text;
      const radius = player.radius ?? 15;
      const text = player.number || '•';
      const fontSize = text.length > 5 ? 8.5 : text.length > 2 ? 9.5 : 11;
      return [
        `<g data-shape-id="${escapeXml(player.id)}" data-shape-kind="player" data-team="${player.team}">`,
        `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`,
        `<text x="${pt.x.toFixed(1)}" y="${(pt.y + 4).toFixed(1)}" font-size="${fontSize}" font-weight="bold" fill="${textColor}" text-anchor="middle">${escapeXml(text)}</text>`,
        player.label
          ? `<text x="${pt.x.toFixed(1)}" y="${(pt.y + radius + 11).toFixed(1)}" font-size="8.5" font-weight="600" fill="#1e293b" text-anchor="middle">${escapeXml(player.label)}</text>`
          : '',
        '</g>',
      ].join('');
    });

  const texts = drawing.shapes
    .filter((shape): shape is OpponentReportTextShape => shape.kind === 'text' && shape.text.trim().length > 0)
    .map((label) => {
      const pt = courtPercentToSvgPoint(label.x, label.y, dims);
      const fontSize = label.fontSize ?? 11;
      const color = label.color ?? '#0f172a';
      const anchor = label.anchor ?? 'middle';
      return [
        `<g data-shape-id="${escapeXml(label.id)}" data-shape-kind="text">`,
        `<text x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" font-size="${fontSize}" font-weight="bold" fill="${color}" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" text-anchor="${anchor}">${escapeXml(label.text)}</text>`,
        `<text x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" font-size="${fontSize}" font-weight="bold" fill="${color}" text-anchor="${anchor}">${escapeXml(label.text)}</text>`,
        '</g>',
      ].join('');
    });

  const backdrop = drawing.backgroundSvg
    ? drawing.backgroundSvg
    : [
      `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
      buildTacticalBoardCourtLinesSvg(drawing.court, drawing.orientation, dims, options.netLabel),
    ].join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    drawing.title ? `<title>${escapeXml(drawing.title)}</title>` : '',
    '<defs>',
    `<marker id="board-arrow-opponent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${TEAM_COLORS.opponent.stroke}"/></marker>`,
    `<marker id="board-arrow-own" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${TEAM_COLORS.own.stroke}"/></marker>`,
    ...customArrowDefs,
    '</defs>',
    backdrop,
    ...drawing.shapes.filter((shape) => shape.kind === 'area').map((area) => {
      const point = courtPercentToSvgPoint(area.x, area.y, dims);
      return `<ellipse data-shape-id="${escapeXml(area.id)}" data-shape-kind="area" cx="${point.x}" cy="${point.y}" rx="${area.rx * dims.courtWidth / 100}" ry="${area.ry * dims.courtHeight / 100}" fill="#facc15" fill-opacity="0.3" stroke="#92400e" stroke-width="2" stroke-dasharray="5 3"/>`;
    }),
    ...cones,
    ...arrows,
    ...players,
    ...texts,
    '</svg>',
  ].join('');
}
