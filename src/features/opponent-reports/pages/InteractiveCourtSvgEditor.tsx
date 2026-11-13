import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from '@src/i18n';
import type {
  OpponentReportDrawing,
  OpponentReportDrawingTeam,
  OpponentReportShape,
} from '@src/domain/opponent-report/types';
import type { ReportPlayer } from '../model/report-metrics';
import {
  addDrawingShape,
  buildTacticalBoardCourtLinesSvg,
  clampCourtCoord,
  
  courtPercentToSvgPoint,
  createDrawingHistory,
  duplicateDrawingShape,
  drawingTextContrast,
  curveDrawingArrow,
  getTacticalBoardDimensionsForDrawing,
  moveDrawingShape,
  pushDrawingHistory,
  redoDrawingHistory,
  removeDrawingShape,
  TEAM_COLORS,
  translateDrawingArrow,
  translateDrawingCone,
  undoDrawingHistory,
  updateArrowHandle,
  updateConeHandle,
  updateDrawingShape,
  type DrawingHistoryState } from '../model/tactical-board';

import { DrawingToolbar, DRAWING_TOOLS, type DrawingTool } from './DrawingToolbar';
import { DrawingProperties, type DrawingPointHandle } from './DrawingProperties';
import { drawingViewport, clampDrawingZoom, clientPointToDrawingCourt } from '../model/drawing-viewport';
type ToolMode = DrawingTool;

type DragOperation =
  | { kind: 'shape'; shapeId: string; offsetX?: number; offsetY?: number }
  | { kind: 'pan'; clientX: number; clientY: number; panX: number; panY: number }
  | { kind: 'area-handle'; shapeId: string }
  | { kind: 'arrow-body'; shapeId: string; lastX: number; lastY: number }
  | { kind: 'arrow-handle'; shapeId: string; handle: 'start' | 'end' | 'control' }
  | { kind: 'cone-body'; shapeId: string; lastX: number; lastY: number }
  | { kind: 'cone-handle'; shapeId: string; handle: 'apex' | 'left' | 'right' }
  | { kind: 'new-arrow'; shapeId: string }
  | { kind: 'new-cone'; shapeId: string; originX: number; originY: number };

const newShapeId = () => `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const NEUTRAL_BG_COLORS = new Set(['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8']);

function normalizeHexColor(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  return null;
}

function extractDrawingColors(drawing: OpponentReportDrawing): string[] {
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const hex = normalizeHexColor(raw);
    if (!hex || NEUTRAL_BG_COLORS.has(hex) || seen.has(hex)) return;
    seen.add(hex);
  };
  for (const shape of drawing.shapes) {
    if (shape.kind === 'player') { add(shape.fillColor); add(shape.strokeColor); }
    else add(shape.color);
  }
  if (drawing.backgroundSvg) {
    for (const match of drawing.backgroundSvg.matchAll(/(?:fill|stroke)\s*=\s*["'](#[0-9a-fA-F]{3,6})["']/g)) {
      add(match[1]);
      if (seen.size >= 8) break;
    }
  }
  add(TEAM_COLORS.opponent.fill);
  add(TEAM_COLORS.own.fill);
  return [...seen].slice(0, 10);
}

export function InteractiveCourtSvgEditor({
  drawing,
  rosterPlayers,
  opponentTeamName,
  ownTeamName,
  allowLayoutChange = false,
  onChange,
  onOpenHeatmapGrid,
  onReset,
  onClose,
}: {
  drawing: OpponentReportDrawing;
  rosterPlayers: readonly ReportPlayer[];
  opponentTeamName?: string;
  ownTeamName?: string;
  allowLayoutChange?: boolean;
  onChange: (next: OpponentReportDrawing) => void;
  onOpenHeatmapGrid?: () => void;
  onReset?: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const favoriteColors = useMemo(() => extractDrawingColors(drawing), [drawing]);
  const [tool, setTool] = useState<ToolMode>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [inkColor, setInkColor] = useState<string>(() => favoriteColors[0] ?? TEAM_COLORS.opponent.fill);
  const editorId = useId().replace(/:/g, '');
  const propertyStartRef = useRef<OpponentReportShape[] | null>(null);
  const [team, setTeam] = useState<OpponentReportDrawingTeam>('opponent');
  const [jerseyInput, setJerseyInput] = useState<string>('1');
  const [textInput, setTextInput] = useState<string>('');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [newShapeNeedsLegendId, setNewShapeNeedsLegendId] = useState<string | null>(null);
  const [history, setHistory] = useState<DrawingHistoryState>(() => createDrawingHistory(drawing.shapes));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragOperation | null>(null);
  const liveShapesRef = useRef(drawing.shapes);
  liveShapesRef.current = drawing.shapes;
  const preDragShapesRef = useRef<OpponentReportShape[] | null>(null);

  useEffect(() => {
    setHistory(createDrawingHistory(drawing.shapes));
    setSelectedShapeId(null);
    setZoom(1); setPan({ x: 0, y: 0 });
  }, [drawing.id]);

  const dims = useMemo(
    () => getTacticalBoardDimensionsForDrawing(drawing),
    [drawing.court, drawing.orientation, drawing.backgroundSvg, drawing.viewBoxWidth, drawing.viewBoxHeight],
  );

  const viewport = drawingViewport(dims.width, dims.height, zoom, pan);

  const selectedShape = useMemo(
    () => drawing.shapes.find((shape) => shape.id === selectedShapeId) ?? null,
    [drawing.shapes, selectedShapeId],
  );

  const applyShapesWithHistory = (nextShapes: OpponentReportShape[]) => {
    liveShapesRef.current = nextShapes;
    setHistory((prev) => pushDrawingHistory(prev, nextShapes));
    onChange({ ...drawing, shapes: nextShapes });
  };

  const applyShapesLive = (nextShapes: OpponentReportShape[]) => {
    liveShapesRef.current = nextShapes;
    onChange({ ...drawing, shapes: nextShapes });
  };

  const handleUndo = () => {
    if (history.past.length === 0) return;
    const nextHistory = undoDrawingHistory(history);
    setHistory(nextHistory);
    onChange({ ...drawing, shapes: nextHistory.present });
  };

  const handleRedo = () => {
    if (history.future.length === 0) return;
    const nextHistory = redoDrawingHistory(history);
    setHistory(nextHistory);
    onChange({ ...drawing, shapes: nextHistory.present });
  };

  const clientToCourtPercent = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 50 };
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 50, y: 50 };
    return clientPointToDrawingCourt({ x: clientX, y: clientY }, rect, viewport, dims);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.focus();
    if (tool === 'pan') {
      dragRef.current = { kind: 'pan', clientX: event.clientX, clientY: event.clientY, panX: pan.x, panY: pan.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const pt = clientToCourtPercent(event.clientX, event.clientY);

    if (tool === 'area') {
      const shape: OpponentReportShape = { id: newShapeId(), kind: 'area', x: pt.x, y: pt.y, rx: 12, ry: 10, color: inkColor };
      applyShapesWithHistory(addDrawingShape(drawing, shape).shapes);
      setSelectedShapeId(shape.id);
      return;
    }
    if (tool === 'player') {
      const id = newShapeId();
      const shape: OpponentReportShape = {
        id,
        kind: 'player',
        team,
        number: jerseyInput.trim(),
        fillColor: inkColor, strokeColor: inkColor, textColor: drawingTextContrast(inkColor),
        x: pt.x,
        y: pt.y,
      };
      const updated = addDrawingShape(drawing, shape);
      applyShapesWithHistory(updated.shapes);
      setSelectedShapeId(id);
      setNewShapeNeedsLegendId(id);
      return;
    }

    if (tool === 'text') {
      const id = newShapeId();
      const shape: OpponentReportShape = {
        id,
        kind: 'text',
        color: inkColor,
        text: textInput.trim() || t('opponentReportBoardTextValue'),
        x: pt.x,
        y: pt.y,
      };
      const updated = addDrawingShape(drawing, shape);
      applyShapesWithHistory(updated.shapes);
      setSelectedShapeId(id);
      setNewShapeNeedsLegendId(id);
      return;
    }

    if (tool === 'arrow' || tool === 'move') {
      const id = newShapeId();
      const isMove = tool === 'move';
      const shape: OpponentReportShape = {
        id,
        kind: 'arrow',
        ...(isMove ? { variant: 'move', strokeWidth: 1.6 } : {}),
        color: isMove ? '#475569' : inkColor,
        team,
        x1: pt.x,
        y1: pt.y,
        x2: clampCourtCoord(pt.x + 8),
        y2: clampCourtCoord(pt.y + 8),
      };
      preDragShapesRef.current = drawing.shapes;
      const updated = addDrawingShape(drawing, shape);
      applyShapesLive(updated.shapes);
      setSelectedShapeId(id);
      setNewShapeNeedsLegendId(id);
      dragRef.current = { kind: 'new-arrow', shapeId: id };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'cone') {
      const id = newShapeId();
      const shape: OpponentReportShape = {
        id,
        kind: 'cone',
        team,
        x1: pt.x,
        y1: pt.y,
        x2: clampCourtCoord(pt.x - 12),
        y2: clampCourtCoord(pt.y + 35),
        x3: clampCourtCoord(pt.x + 12),
        y3: clampCourtCoord(pt.y + 35),
        color: inkColor,
        opacity: 0.28,
      };
      preDragShapesRef.current = drawing.shapes;
      const updated = addDrawingShape(drawing, shape);
      applyShapesLive(updated.shapes);
      setSelectedShapeId(id);
      setNewShapeNeedsLegendId(id);
      dragRef.current = { kind: 'new-cone', shapeId: id, originX: pt.x, originY: pt.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setSelectedShapeId(null);
  };

  const startShapeDrag = (
    event: ReactPointerEvent<SVGElement>,
    operation: DragOperation,
    shapeId: string,
  ) => {
    if (!event.isPrimary || event.button !== 0 || (tool !== 'select' && !['arrow-handle', 'cone-handle', 'area-handle'].includes(operation.kind))) return;
    event.stopPropagation();
    setSelectedShapeId(shapeId);
    preDragShapesRef.current = drawing.shapes;
    if (operation.kind === 'shape') {
      const shape = drawing.shapes.find((entry) => entry.id === shapeId);
      const point = clientToCourtPercent(event.clientX, event.clientY);
      if (shape && 'x' in shape) operation = { ...operation, offsetX: shape.x - point.x, offsetY: shape.y - point.y };
    }
    svgRef.current?.focus();
    dragRef.current = operation;
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const op = dragRef.current;
    if (!op) return;
    if (op.kind === 'pan') {
      const rect = event.currentTarget.getBoundingClientRect();
      const next = drawingViewport(dims.width, dims.height, zoom, {
        x: op.panX - (event.clientX - op.clientX) / rect.width * viewport.width,
        y: op.panY - (event.clientY - op.clientY) / rect.height * viewport.height,
      });
      setPan({ x: next.x - (dims.width - next.width) / 2, y: next.y - (dims.height - next.height) / 2 });
      return;
    }
    const currentDrawing = { ...drawing, shapes: liveShapesRef.current };
    const pt = clientToCourtPercent(event.clientX, event.clientY);
    if (op.kind === 'area-handle') {
      applyShapesLive(updateDrawingShape(currentDrawing, op.shapeId, (shape) => shape.kind === 'area' ? { ...shape, rx: Math.max(1, Math.min(50, Math.abs(pt.x - shape.x))), ry: Math.max(1, Math.min(50, Math.abs(pt.y - shape.y))) } : shape).shapes);
      return;
    }

    if (op.kind === 'shape') {
      const updated = moveDrawingShape(currentDrawing, op.shapeId, { x: pt.x + (op.offsetX ?? 0), y: pt.y + (op.offsetY ?? 0) });
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'arrow-body') {
      const dx = pt.x - op.lastX;
      const dy = pt.y - op.lastY;
      dragRef.current = { ...op, lastX: pt.x, lastY: pt.y };
      const updated = translateDrawingArrow(currentDrawing, op.shapeId, dx, dy);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'cone-body') {
      const dx = pt.x - op.lastX;
      const dy = pt.y - op.lastY;
      dragRef.current = { ...op, lastX: pt.x, lastY: pt.y };
      const updated = translateDrawingCone(currentDrawing, op.shapeId, dx, dy);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'arrow-handle') {
      const updated = updateArrowHandle(currentDrawing, op.shapeId, op.handle, pt.x, pt.y);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'cone-handle') {
      const updated = updateConeHandle(currentDrawing, op.shapeId, op.handle, pt.x, pt.y);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'new-arrow') {
      const updated = updateArrowHandle(currentDrawing, op.shapeId, 'end', pt.x, pt.y);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'new-cone') {
      const spread = 12;
      const updated = updateDrawingShape(currentDrawing, op.shapeId, (shape) => (
        shape.kind === 'cone'
          ? {
            ...shape,
            x2: clampCourtCoord(pt.x - spread),
            y2: pt.y,
            x3: clampCourtCoord(pt.x + spread),
            y3: pt.y,
          }
          : shape
      ));
      applyShapesLive(updated.shapes);
    }
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    if (preDragShapesRef.current) {
      const before = preDragShapesRef.current;
      const after = liveShapesRef.current;
      setHistory((prev) => pushDrawingHistory({ ...prev, present: before }, after));
      preDragShapesRef.current = null;
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedShapeId) return;
    const updated = removeDrawingShape(drawing, selectedShapeId);
    applyShapesWithHistory(updated.shapes);
    setSelectedShapeId(null);
  };

  const beginProperty = () => { propertyStartRef.current ??= liveShapesRef.current.map((shape) => ({ ...shape })); };
  const finishProperty = () => {
    const before = propertyStartRef.current;
    if (!before) return;
    propertyStartRef.current = null;
    const after = liveShapesRef.current;
    setHistory((previous) => pushDrawingHistory({ ...previous, present: before }, after));
  };
  const patchSelected = (change: (shape: OpponentReportShape) => OpponentReportShape) => {
    if (!selectedShapeId) return;
    const next = updateDrawingShape({ ...drawing, shapes: liveShapesRef.current }, selectedShapeId, change);
    if (propertyStartRef.current) applyShapesLive(next.shapes); else applyShapesWithHistory(next.shapes);
  };
  const changeColor = (color: string) => {
    setInkColor(color);
    patchSelected((shape) => shape.kind === 'player' ? { ...shape, fillColor: color, strokeColor: color, textColor: drawingTextContrast(color) } : { ...shape, color });
  };
  const chooseTeam = (side: OpponentReportDrawingTeam) => {
    setTeam(side);
    setInkColor(TEAM_COLORS[side].fill);
    patchSelected((shape) => 'team' in shape ? { ...shape, team: side, ...(shape.kind === 'player' ? { fillColor: TEAM_COLORS[side].fill, strokeColor: TEAM_COLORS[side].stroke, textColor: TEAM_COLORS[side].text } : { color: TEAM_COLORS[side].stroke }) } : shape);
  };
  const chooseTool = (next: DrawingTool) => {
    finishProperty();
    setTool(next); setSelectedShapeId(null);
    setInkColor(next === 'text' ? '#0f172a' : next === 'area' ? '#facc15' : (favoriteColors[0] ?? TEAM_COLORS[team].fill));
  };
  const duplicateSelected = () => {
    if (!selectedShapeId) return;
    const id = newShapeId();
    applyShapesWithHistory(duplicateDrawingShape(drawing, selectedShapeId, id).shapes);
    setSelectedShapeId(id);
  };
  const changePoint = (handle: DrawingPointHandle, x: number, y: number) => {
    if (!selectedShapeId) return;
    const next = handle === 'position' ? moveDrawingShape(drawing, selectedShapeId, { x, y })
      : handle === 'start' || handle === 'end' || handle === 'control' ? updateArrowHandle(drawing, selectedShapeId, handle, x, y)
      : updateConeHandle(drawing, selectedShapeId, handle, x, y);
    applyShapesWithHistory(next.shapes);
  };
  const selectedColor = selectedShape?.kind === 'player' ? selectedShape.fillColor ?? TEAM_COLORS[selectedShape.team].fill
    : selectedShape?.kind === 'arrow' ? selectedShape.color ?? TEAM_COLORS[selectedShape.team].stroke
    : selectedShape?.kind === 'cone' ? selectedShape.color ?? TEAM_COLORS[selectedShape.team].fill
    : selectedShape?.kind === 'area' ? selectedShape.color ?? '#facc15'
    : selectedShape?.kind === 'text' ? selectedShape.color ?? '#0f172a' : inkColor;

  return (
    <div className="opponent-report__svg-editor tactical-drawing-editor" onKeyDown={(event) => {
      if (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z') { event.preventDefault(); event.shiftKey ? handleRedo() : handleUndo(); }
        if (key === 'y') { event.preventDefault(); handleRedo(); }
        if (key === 'd') { event.preventDefault(); duplicateSelected(); }
        return;
      }
      if (event.altKey) return;
      const entry = DRAWING_TOOLS.find((item) => item.key === key);
      if (entry) { event.preventDefault(); chooseTool(entry.tool); }
      if (['Delete', 'Backspace'].includes(event.key) && selectedShape) { event.preventDefault(); handleDeleteSelected(); }
      if (event.key === 'Escape') { setTool('select'); setSelectedShapeId(null); }
    }}>
      <DrawingToolbar tool={tool} onTool={chooseTool} canUndo={history.past.length > 0} canRedo={history.future.length > 0} selected={Boolean(selectedShape)} onUndo={handleUndo} onRedo={handleRedo} onDuplicate={duplicateSelected} onDelete={handleDeleteSelected} zoom={zoom} canFit={zoom > 1 || pan.x !== 0 || pan.y !== 0} onZoom={(value) => setZoom(clampDrawingZoom(value))} onFit={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} onOpenHeatmapGrid={onOpenHeatmapGrid} onClose={onClose} onReset={onReset} />
      {allowLayoutChange ? <details className="tactical-court-settings"><summary>{t('tacticalEditorCourtSettings')}</summary><div className="tactical-court-settings-fields">
        <label>{t('opponentReportBoardCourt')}<select value={drawing.court} onChange={(event) => { onChange({ ...drawing, court: event.target.value === 'full' ? 'full' : 'half' }); setPan({ x: 0, y: 0 }); }}><option value="half">{t('opponentReportBoardCourtHalf')}</option><option value="full">{t('opponentReportBoardCourtFull')}</option></select></label>
        <label>{t('opponentReportBoardOrientation')}<select value={drawing.orientation} onChange={(event) => { onChange({ ...drawing, orientation: event.target.value === 'horizontal' ? 'horizontal' : 'vertical' }); setPan({ x: 0, y: 0 }); }}><option value="vertical">{t('opponentReportBoardOrientationVertical')}</option><option value="horizontal">{t('opponentReportBoardOrientationHorizontal')}</option></select></label>
      </div></details> : null}
      <div className="opponent-report__board-workspace">
        <div className="opponent-report__board-canvas-wrap" style={{ maxWidth: `min(100%, ${62 * dims.width / dims.height}vh)` }}>
          <svg
            ref={svgRef}
            className="opponent-report__board-canvas"
            width={dims.width}
            height={dims.height}
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            tabIndex={0}
            aria-label={t('tacticalEditorCanvas')}
            data-tool={tool}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={() => {
              const before = preDragShapesRef.current;
              const operation = dragRef.current;
              if (operation?.kind === 'pan') setPan({ x: operation.panX, y: operation.panY });
              dragRef.current = null;
              preDragShapesRef.current = null;
              if (before) applyShapesLive(before);
            }}
            onLostPointerCapture={(event) => { if (dragRef.current) handleCanvasPointerUp(event); }}
            style={{ touchAction: 'none', userSelect: 'none' }}
          >
            <defs>{drawing.shapes.filter((shape): shape is Extract<OpponentReportShape, { kind: 'arrow' }> => shape.kind === 'arrow').map((arrow) => {
              const size = arrow.variant === 'move' ? 4.2 : 6;
              return <marker key={arrow.id} id={`${editorId}-${arrow.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth={size} markerHeight={size} orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={arrow.color ?? (arrow.variant === 'move' ? '#475569' : TEAM_COLORS[arrow.team].stroke)} /></marker>;
            })}</defs>
            {drawing.backgroundSvg ? (
              // Extracted court backdrop from pure report view SVG builders.
              // eslint-disable-next-line react/no-danger
              <g dangerouslySetInnerHTML={{ __html: drawing.backgroundSvg }} />
            ) : (
              <>
                <rect width={dims.width} height={dims.height} fill="#ffffff" />
                {/* eslint-disable-next-line react/no-danger */}
                <g dangerouslySetInnerHTML={{
                  __html: buildTacticalBoardCourtLinesSvg(
                    drawing.court,
                    drawing.orientation,
                    dims,
                    t('opponentReportNet'),
                  ),
                }} />
              </>
            )}

            {drawing.shapes.map((shape) => {
              if (shape.kind !== 'area') return null;
              const p = courtPercentToSvgPoint(shape.x, shape.y, dims);
              const handle = courtPercentToSvgPoint(shape.x + shape.rx, shape.y + shape.ry, dims);
              return <g key={shape.id} data-shape-id={shape.id} data-selected={selectedShapeId === shape.id || undefined}>
                <ellipse cx={p.x} cy={p.y} rx={shape.rx * dims.courtWidth / 100} ry={shape.ry * dims.courtHeight / 100} fill={shape.color ?? '#facc15'} fillOpacity={shape.opacity ?? .3} stroke={selectedShapeId === shape.id ? '#2563eb' : shape.color ?? '#92400e'} strokeWidth={2} strokeDasharray="5 3" onPointerDown={(event) => startShapeDrag(event, { kind: 'shape', shapeId: shape.id }, shape.id)} />
                {selectedShapeId === shape.id ? <circle data-handle="resize" cx={handle.x} cy={handle.y} r={9} fill="#fff" stroke="#2563eb" strokeWidth={2} onPointerDown={(event) => startShapeDrag(event, { kind: 'area-handle', shapeId: shape.id }, shape.id)} /> : null}
              </g>;
            })}
            {/* Cones / Triangles */}
            {drawing.shapes.map((shape) => {
              if (shape.kind !== 'cone') return null;
              const p1 = courtPercentToSvgPoint(shape.x1, shape.y1, dims);
              const p2 = courtPercentToSvgPoint(shape.x2, shape.y2, dims);
              const p3 = courtPercentToSvgPoint(shape.x3, shape.y3, dims);
              const fill = shape.color ?? TEAM_COLORS[shape.team].fill;
              const opacity = shape.opacity ?? 0.28;
              const isSelected = shape.id === selectedShapeId;
              return (
                <g key={shape.id} data-shape-id={shape.id} data-selected={isSelected || undefined}>
                  <polygon
                    points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
                    fill={fill}
                    fillOpacity={opacity}
                    stroke={fill}
                    strokeOpacity={isSelected ? 0.95 : 0.55}
                    strokeWidth={isSelected ? 2.2 : 1}
                    style={{ cursor: 'move' }}
                    onPointerDown={(event) => {
                      const pt = clientToCourtPercent(event.clientX, event.clientY);
                      startShapeDrag(event, { kind: 'cone-body', shapeId: shape.id, lastX: pt.x, lastY: pt.y }, shape.id);
                    }}
                  />
                  <circle cx={p1.x} cy={p1.y} r={3.5} fill={fill} stroke="#ffffff" strokeWidth={1} />
                  {isSelected ? (
                    <>
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={9}
                        fill="#f59e0b"
                        stroke="#0f172a"
                        strokeWidth={1.5}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'cone-handle', shapeId: shape.id, handle: 'apex' }, shape.id)}
                      />
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={9}
                        fill="#ffffff"
                        stroke={fill}
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'cone-handle', shapeId: shape.id, handle: 'left' }, shape.id)}
                      />
                      <circle
                        cx={p3.x}
                        cy={p3.y}
                        r={9}
                        fill="#ffffff"
                        stroke={fill}
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'cone-handle', shapeId: shape.id, handle: 'right' }, shape.id)}
                      />
                    </>
                  ) : null}
                </g>
              );
            })}

            {/* Arrows */}
            {drawing.shapes.map((shape) => {
              if (shape.kind !== 'arrow') return null;
              const start = courtPercentToSvgPoint(shape.x1, shape.y1, dims);
              const end = courtPercentToSvgPoint(shape.x2, shape.y2, dims);
              const mid = { x: shape.cx ?? (shape.x1 + shape.x2) / 2, y: shape.cy ?? (shape.y1 + shape.y2) / 2 };
              const midSvg = courtPercentToSvgPoint(mid.x, mid.y, dims);
              const isMove = shape.variant === 'move';
              const color = shape.color ?? (isMove ? '#475569' : TEAM_COLORS[shape.team].stroke);
              const strokeWidth = shape.strokeWidth ?? (isMove ? 1.6 : 2.6);
              const isSelected = shape.id === selectedShapeId;
              const markerId = `${editorId}-${shape.id}`;
              const pathD = shape.cx !== undefined && shape.cy !== undefined
                ? (() => {
                  const ctrl = courtPercentToSvgPoint(shape.cx, shape.cy, dims);
                  return `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`;
                })()
                : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

              return (
                <g key={shape.id} data-shape-id={shape.id} data-selected={isSelected || undefined}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: 'move' }}
                    onPointerDown={(event) => {
                      const pt = clientToCourtPercent(event.clientX, event.clientY);
                      startShapeDrag(event, { kind: 'arrow-body', shapeId: shape.id, lastX: pt.x, lastY: pt.y }, shape.id);
                    }}
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSelected ? strokeWidth + 0.8 : strokeWidth}
                    strokeDasharray={isMove ? '4 3' : undefined}
                    strokeOpacity={isMove ? 0.85 : undefined}
                    strokeLinecap="round"
                    markerEnd={`url(#${markerId})`}
                    pointerEvents="none"
                  />
                  {isSelected ? (
                    <>
                      <circle
                        cx={start.x}
                        cy={start.y}
                        r={9}
                        fill="#ffffff"
                        stroke={color}
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'arrow-handle', shapeId: shape.id, handle: 'start' }, shape.id)}
                      />
                      <circle
                        cx={end.x}
                        cy={end.y}
                        r={9}
                        fill="#ffffff"
                        stroke={color}
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'arrow-handle', shapeId: shape.id, handle: 'end' }, shape.id)}
                      />
                      <circle
                        cx={midSvg.x}
                        cy={midSvg.y}
                        r={9}
                        fill="#f59e0b"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'arrow-handle', shapeId: shape.id, handle: 'control' }, shape.id)}
                      />
                    </>
                  ) : null}
                </g>
              );
            })}

            {/* Players / Zone Badges */}
            {drawing.shapes.map((shape) => {
              if (shape.kind !== 'player') return null;
              const pt = courtPercentToSvgPoint(shape.x, shape.y, dims);
              const colors = TEAM_COLORS[shape.team];
              const fill = shape.fillColor ?? colors.fill;
              const stroke = shape.strokeColor ?? colors.stroke;
              const textColor = shape.textColor ?? colors.text;
              const radius = shape.radius ?? 15;
              const isSelected = shape.id === selectedShapeId;
              const text = shape.number || '•';
              const fontSize = text.length > 5 ? 8.5 : text.length > 2 ? 9.5 : 11;
              return (
                <g
                  key={shape.id}
                  data-shape-id={shape.id}
                  data-selected={isSelected || undefined}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(event) => startShapeDrag(event, { kind: 'shape', shapeId: shape.id }, shape.id)}
                >
                  {isSelected ? (
                    <circle cx={pt.x} cy={pt.y} r={radius + 4} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="3 2" />
                  ) : null}
                  <circle cx={pt.x} cy={pt.y} r={radius} fill={fill} stroke={stroke} strokeWidth={1.6} />
                  <text
                    x={pt.x}
                    y={pt.y + 4}
                    fontSize={fontSize}
                    fontWeight="bold"
                    fill={textColor}
                    textAnchor="middle"
                  >
                    {text}
                  </text>
                  {shape.label ? (
                    <text
                      x={pt.x}
                      y={pt.y + radius + 11}
                      fontSize={8.5}
                      fontWeight={600}
                      fill="#1e293b"
                      textAnchor="middle"
                    >
                      {shape.label}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Text labels */}
            {drawing.shapes.map((shape) => {
              if (shape.kind !== 'text') return null;
              const pt = courtPercentToSvgPoint(shape.x, shape.y, dims);
              const isSelected = shape.id === selectedShapeId;
              const fontSize = shape.fontSize ?? 11;
              const color = shape.color ?? '#0f172a';
              const anchor = shape.anchor ?? 'middle';
              return (
                <g
                  key={shape.id}
                  data-shape-id={shape.id}
                  data-selected={isSelected || undefined}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(event) => startShapeDrag(event, { kind: 'shape', shapeId: shape.id }, shape.id)}
                >
                  <text
                    x={pt.x}
                    y={pt.y}
                    fontSize={fontSize}
                    fontWeight="bold"
                    fill={color}
                    stroke={isSelected ? '#fde68a' : '#ffffff'}
                    strokeWidth={3.5}
                    paintOrder="stroke"
                    textAnchor={anchor}
                  >
                    {shape.text}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="opponent-report__hint">{t(tool === 'pan' ? 'tacticalEditorPanHint' : 'tacticalEditorCanvasHint')}</p>
        </div>

        <DrawingProperties shape={selectedShape} tool={tool} team={team} onTeam={chooseTeam} opponentTeamName={opponentTeamName} ownTeamName={ownTeamName} color={selectedColor} favoriteColors={favoriteColors} onColor={changeColor} number={jerseyInput} onNumber={(number) => { setJerseyInput(number); patchSelected((shape) => shape.kind === 'player' ? { ...shape, number } : shape); }} text={textInput} onText={(text) => { setTextInput(text); patchSelected((shape) => shape.kind === 'text' ? { ...shape, text } : shape); }} roster={rosterPlayers} needsLegendPrompt={Boolean(selectedShape && selectedShape.id === newShapeNeedsLegendId && !selectedShape.legendLabel?.trim())} onPatch={patchSelected} onPoint={changePoint} onBend={(bend) => {
          if (!selectedShapeId) return;
          const next = curveDrawingArrow({ ...drawing, shapes: liveShapesRef.current }, selectedShapeId, bend);
          if (propertyStartRef.current) applyShapesLive(next.shapes); else applyShapesWithHistory(next.shapes);
        }} begin={beginProperty} finish={finishProperty} />
      </div>
    </div>
  );
}

