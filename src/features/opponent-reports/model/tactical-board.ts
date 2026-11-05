/**
 * Pure model and SVG renderer for the free tactical drawing board (Phase 5):
 * multi-sheet management, shape creation/movement/editing, undo/redo history,
 * JSON serialization, and self-contained SVG output shared by screen and PDF.
 */
import type {
  OpponentReportArrowShape,
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
    if (shape.kind === 'player' || shape.kind === 'text') {
      return {
        ...shape,
        x: clampCourtCoord(position.x),
        y: clampCourtCoord(position.y),
      };
    }
    const midX = (shape.x1 + shape.x2) / 2;
    const midY = (shape.y1 + shape.y2) / 2;
    return translateArrowShape(shape, position.x - midX, position.y - midY);
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

  if (record.kind === 'player') {
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const shape: OpponentReportPlayerShape = {
      id,
      kind: 'player',
      team: isTeam(record.team) ? record.team : 'opponent',
      number: typeof record.number === 'string' ? record.number.slice(0, 6) : String(record.number ?? ''),
      ...(typeof record.label === 'string' && record.label.trim() ? { label: record.label.trim() } : {}),
      x: clampCourtCoord(x),
      y: clampCourtCoord(y),
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
    const shape: OpponentReportArrowShape = {
      id,
      kind: 'arrow',
      team: isTeam(record.team) ? record.team : 'opponent',
      x1: clampCourtCoord(x1),
      y1: clampCourtCoord(y1),
      x2: clampCourtCoord(x2),
      y2: clampCourtCoord(y2),
      ...(hasCurve ? { cx: clampCourtCoord(cx), cy: clampCourtCoord(cy) } : {}),
    };
    return shape;
  }

  if (record.kind === 'text') {
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const text = typeof record.text === 'string' ? record.text : '';
    const shape: OpponentReportTextShape = {
      id,
      kind: 'text',
      text,
      x: clampCourtCoord(x),
      y: clampCourtCoord(y),
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
  return {
    id,
    title: typeof record.title === 'string' ? record.title : '',
    note: typeof record.note === 'string' ? record.note : '',
    court,
    orientation,
    shapes,
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

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
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
 * Self-contained SVG of a tactical drawing sheet, used directly in the PDF
 * and matching the interactive board on screen.
 */
export function buildTacticalBoardSvg(
  drawing: OpponentReportDrawing,
  options: { netLabel?: string } = {},
): string {
  const dims = getTacticalBoardDimensions(drawing.court, drawing.orientation);
  const { width, height } = dims;

  const arrows = drawing.shapes
    .filter((shape): shape is OpponentReportArrowShape => shape.kind === 'arrow')
    .map((arrow) => {
      const start = courtPercentToSvgPoint(arrow.x1, arrow.y1, dims);
      const end = courtPercentToSvgPoint(arrow.x2, arrow.y2, dims);
      const markerId = `board-arrow-${arrow.team}`;
      const color = TEAM_COLORS[arrow.team].stroke;
      if (arrow.cx !== undefined && arrow.cy !== undefined) {
        const control = courtPercentToSvgPoint(arrow.cx, arrow.cy, dims);
        const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
        return `<path data-shape-id="${escapeXml(arrow.id)}" data-shape-kind="arrow" d="${d}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" marker-end="url(#${markerId})"/>`;
      }
      return `<line data-shape-id="${escapeXml(arrow.id)}" data-shape-kind="arrow" x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${color}" stroke-width="2.6" stroke-linecap="round" marker-end="url(#${markerId})"/>`;
    });

  const players = drawing.shapes
    .filter((shape): shape is OpponentReportPlayerShape => shape.kind === 'player')
    .map((player) => {
      const pt = courtPercentToSvgPoint(player.x, player.y, dims);
      const colors = TEAM_COLORS[player.team];
      const text = player.number || '•';
      return [
        `<g data-shape-id="${escapeXml(player.id)}" data-shape-kind="player" data-team="${player.team}">`,
        `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="15" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.6"/>`,
        `<text x="${pt.x.toFixed(1)}" y="${(pt.y + 4).toFixed(1)}" font-size="${text.length > 2 ? 9.5 : 11.5}" font-weight="bold" fill="${colors.text}" text-anchor="middle">${escapeXml(text)}</text>`,
        player.label
          ? `<text x="${pt.x.toFixed(1)}" y="${(pt.y + 26).toFixed(1)}" font-size="8.5" font-weight="600" fill="#1e293b" text-anchor="middle">${escapeXml(player.label)}</text>`
          : '',
        '</g>',
      ].join('');
    });

  const texts = drawing.shapes
    .filter((shape): shape is OpponentReportTextShape => shape.kind === 'text' && shape.text.trim().length > 0)
    .map((label) => {
      const pt = courtPercentToSvgPoint(label.x, label.y, dims);
      return [
        `<g data-shape-id="${escapeXml(label.id)}" data-shape-kind="text">`,
        `<text x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" font-size="11" font-weight="bold" fill="#0f172a" stroke="#ffffff" stroke-width="3" paint-order="stroke" text-anchor="middle">${escapeXml(label.text)}</text>`,
        `<text x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" font-size="11" font-weight="bold" fill="#0f172a" text-anchor="middle">${escapeXml(label.text)}</text>`,
        '</g>',
      ].join('');
    });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    drawing.title ? `<title>${escapeXml(drawing.title)}</title>` : '',
    '<defs>',
    `<marker id="board-arrow-opponent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${TEAM_COLORS.opponent.stroke}"/></marker>`,
    `<marker id="board-arrow-own" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${TEAM_COLORS.own.stroke}"/></marker>`,
    '</defs>',
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    buildTacticalBoardCourtLinesSvg(drawing.court, drawing.orientation, dims, options.netLabel),
    ...arrows,
    ...players,
    ...texts,
    '</svg>',
  ].join('');
}
