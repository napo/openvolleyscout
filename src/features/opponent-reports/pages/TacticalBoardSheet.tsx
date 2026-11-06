import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from '@src/i18n';
import type {
  OpponentReport,
  OpponentReportDrawing,
  OpponentReportDrawingTeam,
  OpponentReportPieceEdit,
  OpponentReportShape,
} from '@src/domain/opponent-report/types';
import {
  buildBoardPieceCatalog,
  extraPieceId,
  isPieceOnBoard,
  moveBoardPiece,
  openPieceCourtForEditing,
  resetBoardPieceEdit,
  resolveBoardPieces,
  toggleBoardPiece,
  updateBoardPieceEdit,
  type ResolvedBoardCourt,
  type ResolvedBoardPiece,
} from '../model/board-pieces';
import type { ReportPlayer } from '../model/report-metrics';
import { playerLabel } from '../model/report-keys';
import type { ReportView, ViewT, ViewTable } from '../model/report-view';
import {
  addDrawingShape,
  addTacticalDrawing,
  arrowMidpoint,
  buildTacticalBoardCourtLinesSvg,
  clampCourtCoord,
  coneCentroid,
  courtPercentToSvgPoint,
  createDrawingHistory,
  createTacticalDrawing,
  getTacticalBoardDimensionsForDrawing,
  moveDrawingShape,
  pushDrawingHistory,
  redoDrawingHistory,
  removeDrawingShape,
  removeTacticalDrawing,
  resetArrowCurve,
  TEAM_COLORS,
  translateDrawingArrow,
  translateDrawingCone,
  undoDrawingHistory,
  updateArrowHandle,
  updateConeHandle,
  updateDrawingShape,
  updateTacticalDrawing,
  type DrawingHistoryState,
} from '../model/tactical-board';

type Update = (change: (current: OpponentReport) => OpponentReport) => void;
type ToolMode = 'select' | 'player' | 'arrow' | 'cone' | 'text';

type DragOperation =
  | { kind: 'shape'; shapeId: string }
  | { kind: 'arrow-body'; shapeId: string; lastX: number; lastY: number }
  | { kind: 'arrow-handle'; shapeId: string; handle: 'start' | 'end' | 'control' }
  | { kind: 'cone-body'; shapeId: string; lastX: number; lastY: number }
  | { kind: 'cone-handle'; shapeId: string; handle: 'apex' | 'left' | 'right' }
  | { kind: 'new-arrow'; shapeId: string }
  | { kind: 'new-cone'; shapeId: string; originX: number; originY: number };

const newDrawingId = () => `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const newShapeId = () => `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function EditableViewTable({
  table,
  editTable,
  onChange,
}: {
  table: ViewTable;
  editTable: OpponentReportPieceEdit['table'] | undefined;
  onChange: (nextTable: NonNullable<OpponentReportPieceEdit['table']>) => void;
}) {
  const updateColumn = (colIndex: number, value: string) => {
    const columns = table.columns.map((col, index) => (index === colIndex ? value : (editTable?.columns?.[index] ?? col)));
    onChange({
      columns,
      rows: editTable?.rows ?? table.rows.map((row) => row.map((cell) => cell.text)),
    });
  };

  const updateCell = (rowIndex: number, cellIndex: number, value: string) => {
    const rows = table.rows.map((row, rIdx) =>
      row.map((cell, cIdx) => {
        if (rIdx === rowIndex && cIdx === cellIndex) return value;
        return editTable?.rows?.[rIdx]?.[cIdx] ?? cell.text;
      }),
    );
    onChange({
      columns: editTable?.columns ?? [...table.columns],
      rows,
    });
  };

  return (
    <div className="opponent-report__table-wrap">
      <table className="opponent-report__table opponent-report__table--editable">
        <thead>
          <tr>
            {table.columns.map((column, colIndex) => (
              // eslint-disable-next-line react/no-array-index-key
              <th key={colIndex}>
                <input
                  type="text"
                  className="opponent-report__cell-input opponent-report__cell-input--th"
                  value={column}
                  onChange={(event) => updateColumn(colIndex, event.target.value)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <td
                  key={cellIndex}
                  className={[
                    cell.band ? `opponent-report__cell--${cell.band}` : '',
                    cell.few ? 'opponent-report__cell--few' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <input
                    type="text"
                    className="opponent-report__cell-input"
                    value={cell.text}
                    onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InteractiveCourtSvgEditor({
  drawing,
  rosterPlayers,
  allowLayoutChange = false,
  onChange,
  onReset,
  onClose,
}: {
  drawing: OpponentReportDrawing;
  rosterPlayers: readonly ReportPlayer[];
  allowLayoutChange?: boolean;
  onChange: (next: OpponentReportDrawing) => void;
  onReset?: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<ToolMode>('select');
  const [team, setTeam] = useState<OpponentReportDrawingTeam>('opponent');
  const [jerseyInput, setJerseyInput] = useState<string>('1');
  const [textInput, setTextInput] = useState<string>('');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [history, setHistory] = useState<DrawingHistoryState>(() => createDrawingHistory(drawing.shapes));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragOperation | null>(null);
  const preDragShapesRef = useRef<OpponentReportShape[] | null>(null);

  useEffect(() => {
    setHistory(createDrawingHistory(drawing.shapes));
  }, [drawing.id]);

  const dims = useMemo(
    () => getTacticalBoardDimensionsForDrawing(drawing),
    [drawing.court, drawing.orientation, drawing.backgroundSvg, drawing.viewBoxWidth, drawing.viewBoxHeight],
  );

  const selectedShape = useMemo(
    () => drawing.shapes.find((shape) => shape.id === selectedShapeId) ?? null,
    [drawing.shapes, selectedShapeId],
  );

  const applyShapesWithHistory = (nextShapes: OpponentReportShape[]) => {
    setHistory((prev) => pushDrawingHistory(prev, nextShapes));
    onChange({ ...drawing, shapes: nextShapes });
  };

  const applyShapesLive = (nextShapes: OpponentReportShape[]) => {
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
    const svgX = ((clientX - rect.left) / rect.width) * dims.width;
    const svgY = ((clientY - rect.top) / rect.height) * dims.height;
    const pctX = ((svgX - dims.courtLeft) / dims.courtWidth) * 100;
    const pctY = ((svgY - dims.courtTop) / dims.courtHeight) * 100;
    return {
      x: clampCourtCoord(pctX),
      y: clampCourtCoord(pctY),
    };
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const pt = clientToCourtPercent(event.clientX, event.clientY);

    if (tool === 'player') {
      const id = newShapeId();
      const shape: OpponentReportShape = {
        id,
        kind: 'player',
        team,
        number: jerseyInput.trim() || '1',
        x: pt.x,
        y: pt.y,
      };
      const updated = addDrawingShape(drawing, shape);
      applyShapesWithHistory(updated.shapes);
      setSelectedShapeId(id);
      return;
    }

    if (tool === 'text') {
      const id = newShapeId();
      const shape: OpponentReportShape = {
        id,
        kind: 'text',
        text: textInput.trim() || t('opponentReportBoardTextValue'),
        x: pt.x,
        y: pt.y,
      };
      const updated = addDrawingShape(drawing, shape);
      applyShapesWithHistory(updated.shapes);
      setSelectedShapeId(id);
      return;
    }

    if (tool === 'arrow') {
      const id = newShapeId();
      const shape: OpponentReportShape = {
        id,
        kind: 'arrow',
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
        color: TEAM_COLORS[team].fill,
        opacity: 0.28,
      };
      preDragShapesRef.current = drawing.shapes;
      const updated = addDrawingShape(drawing, shape);
      applyShapesLive(updated.shapes);
      setSelectedShapeId(id);
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
    event.stopPropagation();
    setSelectedShapeId(shapeId);
    preDragShapesRef.current = drawing.shapes;
    dragRef.current = operation;
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const op = dragRef.current;
    if (!op) return;
    const pt = clientToCourtPercent(event.clientX, event.clientY);

    if (op.kind === 'shape') {
      const updated = moveDrawingShape(drawing, op.shapeId, pt);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'arrow-body') {
      const dx = pt.x - op.lastX;
      const dy = pt.y - op.lastY;
      dragRef.current = { ...op, lastX: pt.x, lastY: pt.y };
      const updated = translateDrawingArrow(drawing, op.shapeId, dx, dy);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'cone-body') {
      const dx = pt.x - op.lastX;
      const dy = pt.y - op.lastY;
      dragRef.current = { ...op, lastX: pt.x, lastY: pt.y };
      const updated = translateDrawingCone(drawing, op.shapeId, dx, dy);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'arrow-handle') {
      const updated = updateArrowHandle(drawing, op.shapeId, op.handle, pt.x, pt.y);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'cone-handle') {
      const updated = updateConeHandle(drawing, op.shapeId, op.handle, pt.x, pt.y);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'new-arrow') {
      const updated = updateArrowHandle(drawing, op.shapeId, 'end', pt.x, pt.y);
      applyShapesLive(updated.shapes);
      return;
    }

    if (op.kind === 'new-cone') {
      const spread = 12;
      const updated = updateDrawingShape(drawing, op.shapeId, (shape) => (
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
      setHistory((prev) => pushDrawingHistory(
        { ...prev, present: preDragShapesRef.current! },
        drawing.shapes,
      ));
      preDragShapesRef.current = null;
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedShapeId) return;
    const updated = removeDrawingShape(drawing, selectedShapeId);
    applyShapesWithHistory(updated.shapes);
    setSelectedShapeId(null);
  };

  return (
    <div className="opponent-report__svg-editor">
      <div className="opponent-report__board-controls">
        {allowLayoutChange ? (
          <>
            <label className="opponent-report__board-field">
              <span>{t('opponentReportBoardCourt')}</span>
              <select
                value={drawing.court}
                onChange={(event) => onChange({
                  ...drawing,
                  court: event.target.value === 'full' ? 'full' : 'half',
                })}
              >
                <option value="half">{t('opponentReportBoardCourtHalf')}</option>
                <option value="full">{t('opponentReportBoardCourtFull')}</option>
              </select>
            </label>
            <label className="opponent-report__board-field">
              <span>{t('opponentReportBoardOrientation')}</span>
              <select
                value={drawing.orientation}
                onChange={(event) => onChange({
                  ...drawing,
                  orientation: event.target.value === 'horizontal' ? 'horizontal' : 'vertical',
                })}
              >
                <option value="vertical">{t('opponentReportBoardOrientationVertical')}</option>
                <option value="horizontal">{t('opponentReportBoardOrientationHorizontal')}</option>
              </select>
            </label>
          </>
        ) : null}

        <div className="opponent-report__board-tools" role="group" aria-label="Drawing tools">
          <button
            type="button"
            className={tool === 'select' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => setTool('select')}
          >
            {t('opponentReportBoardToolSelect')}
          </button>
          <button
            type="button"
            className={tool === 'player' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => setTool('player')}
          >
            {t('opponentReportBoardToolPlayer')}
          </button>
          <button
            type="button"
            className={tool === 'arrow' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => setTool('arrow')}
          >
            {t('opponentReportBoardToolArrow')}
          </button>
          <button
            type="button"
            className={tool === 'cone' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => setTool('cone')}
          >
            {t('opponentReportBoardToolCone')}
          </button>
          <button
            type="button"
            className={tool === 'text' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => setTool('text')}
          >
            {t('opponentReportBoardToolText')}
          </button>
        </div>

        <div className="opponent-report__board-team-toggle">
          <button
            type="button"
            className={team === 'opponent' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => setTeam('opponent')}
          >
            {t('opponentReportBoardTeamOpponent')}
          </button>
          <button
            type="button"
            className={team === 'own' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => setTeam('own')}
          >
            {t('opponentReportBoardTeamOwn')}
          </button>
        </div>

        {tool === 'player' ? (
          <label className="opponent-report__board-field opponent-report__board-field--inline">
            <span>{t('opponentReportBoardJerseyNumber')}</span>
            <input
              type="text"
              maxLength={10}
              value={jerseyInput}
              onChange={(event) => setJerseyInput(event.target.value)}
            />
          </label>
        ) : null}

        {tool === 'text' ? (
          <label className="opponent-report__board-field opponent-report__board-field--inline">
            <span>{t('opponentReportBoardTextValue')}</span>
            <input
              type="text"
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
            />
          </label>
        ) : null}

        <div className="opponent-report__board-history">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleUndo}
            disabled={history.past.length === 0}
          >
            {t('opponentReportBoardUndo')}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleRedo}
            disabled={history.future.length === 0}
          >
            {t('opponentReportBoardRedo')}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleDeleteSelected}
            disabled={!selectedShapeId}
          >
            {t('opponentReportBoardDeleteSelected')}
          </button>
          {onReset ? (
            <button type="button" className="btn-secondary btn-small" onClick={onReset}>
              {`↺ ${t('opponentReportBoardResetSvg')}`}
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="btn-secondary btn-small" onClick={onClose}>
              {t('opponentReportBoardCloseSvg')}
            </button>
          ) : null}
        </div>
      </div>

      {rosterPlayers.length > 0 && tool === 'player' ? (
        <div className="opponent-report__board-roster">
          <small>{t('opponentReportBoardQuickPlayers')}:</small>
          {rosterPlayers.map((player) => (
            <button
              key={player.key}
              type="button"
              className="btn-secondary btn-small"
              onClick={() => {
                setJerseyInput(player.jersey || '?');
                setTool('player');
              }}
            >
              {playerLabel(player)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="opponent-report__board-workspace">
        <div className="opponent-report__board-canvas-wrap">
          <svg
            ref={svgRef}
            className="opponent-report__board-canvas"
            width={dims.width}
            height={dims.height}
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            style={{ touchAction: 'none', userSelect: 'none' }}
          >
            <defs>
              <marker id="board-arrow-opponent-ui" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={TEAM_COLORS.opponent.stroke} />
              </marker>
              <marker id="board-arrow-own-ui" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={TEAM_COLORS.own.stroke} />
              </marker>
              <marker id="board-arrow-dark-ui" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#111827" />
              </marker>
            </defs>
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
                <g key={shape.id}>
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
                        r={6.5}
                        fill="#f59e0b"
                        stroke="#0f172a"
                        strokeWidth={1.5}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'cone-handle', shapeId: shape.id, handle: 'apex' }, shape.id)}
                      />
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={6}
                        fill="#ffffff"
                        stroke={fill}
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'cone-handle', shapeId: shape.id, handle: 'left' }, shape.id)}
                      />
                      <circle
                        cx={p3.x}
                        cy={p3.y}
                        r={6}
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
              const mid = arrowMidpoint(shape);
              const midSvg = courtPercentToSvgPoint(mid.x, mid.y, dims);
              const color = shape.color ?? TEAM_COLORS[shape.team].stroke;
              const strokeWidth = shape.strokeWidth ?? 2.6;
              const isSelected = shape.id === selectedShapeId;
              const markerId = shape.color === '#111827'
                ? 'board-arrow-dark-ui'
                : `board-arrow-${shape.team}-ui`;
              const pathD = shape.cx !== undefined && shape.cy !== undefined
                ? (() => {
                  const ctrl = courtPercentToSvgPoint(shape.cx, shape.cy, dims);
                  return `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`;
                })()
                : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

              return (
                <g key={shape.id}>
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
                    strokeLinecap="round"
                    markerEnd={`url(#${markerId})`}
                    pointerEvents="none"
                  />
                  {isSelected ? (
                    <>
                      <circle
                        cx={start.x}
                        cy={start.y}
                        r={6}
                        fill="#ffffff"
                        stroke={color}
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'arrow-handle', shapeId: shape.id, handle: 'start' }, shape.id)}
                      />
                      <circle
                        cx={end.x}
                        cy={end.y}
                        r={6}
                        fill="#ffffff"
                        stroke={color}
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(event) => startShapeDrag(event, { kind: 'arrow-handle', shapeId: shape.id, handle: 'end' }, shape.id)}
                      />
                      <circle
                        cx={midSvg.x}
                        cy={midSvg.y}
                        r={5.5}
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
          <p className="opponent-report__hint">{t('opponentReportBoardHint')}</p>
        </div>

        {/* Selected object inspector */}
        <aside className="opponent-report__board-inspector">
          <h4>{t('opponentReportBoardEditSelected')}</h4>
          {!selectedShape ? (
            <p className="opponent-report__hint">{t('opponentReportBoardHint')}</p>
          ) : null}

          {selectedShape?.kind === 'player' ? (
            <div className="opponent-report__board-inspector-fields">
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardJerseyNumber')}</span>
                <input
                  type="text"
                  maxLength={12}
                  value={selectedShape.number}
                  onChange={(event) => {
                    const updated = updateDrawingShape(drawing, selectedShape.id, (current) => (
                      current.kind === 'player' ? { ...current, number: event.target.value } : current
                    ));
                    applyShapesWithHistory(updated.shapes);
                  }}
                />
              </label>
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardTextValue')}</span>
                <input
                  type="text"
                  value={selectedShape.label ?? ''}
                  onChange={(event) => {
                    const updated = updateDrawingShape(drawing, selectedShape.id, (current) => (
                      current.kind === 'player'
                        ? { ...current, label: event.target.value || undefined }
                        : current
                    ));
                    applyShapesWithHistory(updated.shapes);
                  }}
                />
              </label>
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardCoordX')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(selectedShape.x)}
                  onChange={(event) => {
                    const updated = moveDrawingShape(drawing, selectedShape.id, {
                      x: Number(event.target.value),
                      y: selectedShape.y,
                    });
                    applyShapesWithHistory(updated.shapes);
                  }}
                />
              </label>
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardCoordY')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(selectedShape.y)}
                  onChange={(event) => {
                    const updated = moveDrawingShape(drawing, selectedShape.id, {
                      x: selectedShape.x,
                      y: Number(event.target.value),
                    });
                    applyShapesWithHistory(updated.shapes);
                  }}
                />
              </label>
            </div>
          ) : null}

          {selectedShape?.kind === 'text' ? (
            <div className="opponent-report__board-inspector-fields">
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardTextValue')}</span>
                <input
                  type="text"
                  value={selectedShape.text}
                  onChange={(event) => {
                    const updated = updateDrawingShape(drawing, selectedShape.id, (current) => (
                      current.kind === 'text' ? { ...current, text: event.target.value } : current
                    ));
                    applyShapesWithHistory(updated.shapes);
                  }}
                />
              </label>
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardCoordX')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(selectedShape.x)}
                  onChange={(event) => {
                    const updated = moveDrawingShape(drawing, selectedShape.id, {
                      x: Number(event.target.value),
                      y: selectedShape.y,
                    });
                    applyShapesWithHistory(updated.shapes);
                  }}
                />
              </label>
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardCoordY')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(selectedShape.y)}
                  onChange={(event) => {
                    const updated = moveDrawingShape(drawing, selectedShape.id, {
                      x: selectedShape.x,
                      y: Number(event.target.value),
                    });
                    applyShapesWithHistory(updated.shapes);
                  }}
                />
              </label>
            </div>
          ) : null}

          {selectedShape?.kind === 'arrow' ? (
            <div className="opponent-report__board-inspector-fields">
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardArrowStart')}</span>
                <div className="opponent-report__board-coord-pair">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.x1)}
                    onChange={(event) => {
                      const updated = updateArrowHandle(drawing, selectedShape.id, 'start', Number(event.target.value), selectedShape.y1);
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.y1)}
                    onChange={(event) => {
                      const updated = updateArrowHandle(drawing, selectedShape.id, 'start', selectedShape.x1, Number(event.target.value));
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                </div>
              </label>
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardArrowEnd')}</span>
                <div className="opponent-report__board-coord-pair">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.x2)}
                    onChange={(event) => {
                      const updated = updateArrowHandle(drawing, selectedShape.id, 'end', Number(event.target.value), selectedShape.y2);
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.y2)}
                    onChange={(event) => {
                      const updated = updateArrowHandle(drawing, selectedShape.id, 'end', selectedShape.x2, Number(event.target.value));
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                </div>
              </label>
              {selectedShape.cx !== undefined ? (
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => {
                    const updated = resetArrowCurve(drawing, selectedShape.id);
                    applyShapesWithHistory(updated.shapes);
                  }}
                >
                  {t('opponentReportBoardResetCurve')}
                </button>
              ) : null}
            </div>
          ) : null}

          {selectedShape?.kind === 'cone' ? (
            <div className="opponent-report__board-inspector-fields">
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardConeApex')}</span>
                <div className="opponent-report__board-coord-pair">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.x1)}
                    onChange={(event) => {
                      const updated = updateConeHandle(drawing, selectedShape.id, 'apex', Number(event.target.value), selectedShape.y1);
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.y1)}
                    onChange={(event) => {
                      const updated = updateConeHandle(drawing, selectedShape.id, 'apex', selectedShape.x1, Number(event.target.value));
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                </div>
              </label>
              <label className="opponent-report__board-field">
                <span>{t('opponentReportBoardConeBase')}</span>
                <div className="opponent-report__board-coord-pair">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.x2)}
                    onChange={(event) => {
                      const updated = updateConeHandle(drawing, selectedShape.id, 'left', Number(event.target.value), selectedShape.y2);
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(selectedShape.x3)}
                    onChange={(event) => {
                      const updated = updateConeHandle(drawing, selectedShape.id, 'right', Number(event.target.value), selectedShape.y3);
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                </div>
              </label>
              <div className="opponent-report__board-team-toggle">
                <button
                  type="button"
                  className={selectedShape.color === '#dc2626' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
                  onClick={() => {
                    const updated = updateDrawingShape(drawing, selectedShape.id, (current) => (
                      current.kind === 'cone' ? { ...current, color: '#dc2626', team: 'opponent' } : current
                    ));
                    applyShapesWithHistory(updated.shapes);
                  }}
                >
                  {t('opponentReportBoardTeamOpponent')}
                </button>
                <button
                  type="button"
                  className={selectedShape.color === '#2563eb' ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
                  onClick={() => {
                    const updated = updateDrawingShape(drawing, selectedShape.id, (current) => (
                      current.kind === 'cone' ? { ...current, color: '#2563eb', team: 'own' } : current
                    ));
                    applyShapesWithHistory(updated.shapes);
                  }}
                >
                  {t('opponentReportBoardTeamOwn')}
                </button>
              </div>
              <label className="opponent-report__board-field">
                <span>{`${t('opponentReportBoardCoordX')} / ${t('opponentReportBoardCoordY')}`}</span>
                <div className="opponent-report__board-coord-pair">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(coneCentroid(selectedShape).x)}
                    onChange={(event) => {
                      const c = coneCentroid(selectedShape);
                      const updated = moveDrawingShape(drawing, selectedShape.id, { x: Number(event.target.value), y: c.y });
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(coneCentroid(selectedShape).y)}
                    onChange={(event) => {
                      const c = coneCentroid(selectedShape);
                      const updated = moveDrawingShape(drawing, selectedShape.id, { x: c.x, y: Number(event.target.value) });
                      applyShapesWithHistory(updated.shapes);
                    }}
                  />
                </div>
              </label>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function EditableStringList({
  items,
  ordered = false,
  onChange,
}: {
  items: string[];
  ordered?: boolean;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <div className="opponent-report__editable-list-wrap">
      <Tag className="opponent-report__editable-list">
        {items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className="opponent-report__editable-list-item">
            <input
              type="text"
              value={item}
              onChange={(event) => onChange(items.map((entry, idx) => (idx === index ? event.target.value : entry)))}
            />
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => onChange(items.filter((_, idx) => idx !== index))}
              aria-label={t('opponentReportDelete')}
            >
              ✕
            </button>
          </li>
        ))}
      </Tag>
      <button
        type="button"
        className="btn-secondary btn-small"
        onClick={() => onChange([...items, ''])}
      >
        {`+ ${t('opponentReportBoardAddItem')}`}
      </button>
    </div>
  );
}

export function TacticalBoardSheet({
  report,
  view,
  viewT,
  rosterPlayers,
  update,
}: {
  report: OpponentReport;
  view: ReportView;
  viewT: ViewT;
  rosterPlayers: readonly ReportPlayer[];
  update: Update;
}) {
  const { t } = useTranslation();
  const [editingCourtTarget, setEditingCourtTarget] = useState<{ pieceId: string; courtKey: string } | null>(null);

  const catalog = useMemo(() => buildBoardPieceCatalog(report, view, viewT), [report, view, viewT]);
  const activePieces = useMemo(() => resolveBoardPieces(report, view, viewT), [report, view, viewT]);

  const handleAddExtraSheet = () => {
    const id = newDrawingId();
    const nextNumber = (report.drawings?.length ?? 0) + 1;
    const sheet = createTacticalDrawing({
      id,
      title: t('opponentReportBoardDefaultTitle', { number: nextNumber }),
      court: 'half',
      orientation: 'vertical',
    });
    update((current) => {
      const nextDrawings = addTacticalDrawing(current.drawings ?? [], sheet);
      const nextWithPiece = isPieceOnBoard(current, view, extraPieceId(id))
        ? current
        : toggleBoardPiece(current, view, extraPieceId(id));
      return {
        ...nextWithPiece,
        drawings: nextDrawings,
      };
    });
  };

  const renderCourtBlock = (piece: ResolvedBoardPiece, court: ResolvedBoardCourt) => {
    const isEditing = editingCourtTarget?.pieceId === piece.id && editingCourtTarget?.courtKey === court.key;
    const edit = report.pieceEdits?.[piece.id];
    const hasCustomDrawing = Boolean(edit?.courtDrawings?.[court.key]);

    return (
      <div className="opponent-report__board-court-card" key={court.key}>
        {isEditing ? (
          <InteractiveCourtSvgEditor
            drawing={openPieceCourtForEditing(piece, court.key)!}
            rosterPlayers={rosterPlayers}
            onChange={(nextDrawing) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
              ...prev,
              courtDrawings: {
                ...(prev.courtDrawings ?? {}),
                [court.key]: nextDrawing,
              },
            })))}
            onReset={hasCustomDrawing ? () => {
              update((current) => updateBoardPieceEdit(current, piece.id, (prev) => {
                const nextDrawings = { ...(prev.courtDrawings ?? {}) };
                delete nextDrawings[court.key];
                return { ...prev, courtDrawings: nextDrawings };
              }));
              setEditingCourtTarget(null);
            } : undefined}
            onClose={() => setEditingCourtTarget(null)}
          />
        ) : (
          <>
            {/* Produced by pure SVG builders or user-edited vector shapes (buildTacticalBoardSvg). */}
            {/* eslint-disable-next-line react/no-danger */}
            <div className="opponent-report__court" dangerouslySetInnerHTML={{ __html: court.svg }} />
            {court.sample !== undefined ? (
              <input
                type="text"
                className="opponent-report__board-inline-sample"
                value={court.sample}
                onChange={(event) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                  ...prev,
                  courtSamples: {
                    ...(prev.courtSamples ?? {}),
                    [court.key]: event.target.value,
                  },
                })))}
              />
            ) : null}
            <div className="opponent-report__board-court-actions">
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => {
                  const initial = openPieceCourtForEditing(piece, court.key);
                  if (initial && !hasCustomDrawing) {
                    update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                      ...prev,
                      courtDrawings: {
                        ...(prev.courtDrawings ?? {}),
                        [court.key]: initial,
                      },
                    })));
                  }
                  setEditingCourtTarget({ pieceId: piece.id, courtKey: court.key });
                }}
              >
                {`✎ ${t('opponentReportBoardEditSvg')}`}
              </button>
              {hasCustomDrawing ? (
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => {
                    const nextDrawings = { ...(prev.courtDrawings ?? {}) };
                    delete nextDrawings[court.key];
                    return { ...prev, courtDrawings: nextDrawings };
                  }))}
                >
                  {`↺ ${t('opponentReportBoardResetSvg')}`}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <section className="opponent-report__sheet opponent-report__board">
      <div className="opponent-report__board-top">
        <p className="opponent-report__hint">{t('opponentReportBoardComposerHelp')}</p>
        <div className="opponent-report__board-top-actions">
          <button type="button" className="btn-primary btn-small" onClick={handleAddExtraSheet}>
            {`+ ${t('opponentReportBoardAddExtraSheet')}`}
          </button>
        </div>
      </div>

      <details className="opponent-report__sheets-config">
        <summary>{t('opponentReportBoardAvailablePieces', { count: activePieces.length })}</summary>
        <div className="opponent-report__board-catalog-list">
          {[...catalog.values()].map((piece) => {
            const onBoard = isPieceOnBoard(report, view, piece.id);
            return (
              <label key={piece.id} className="opponent-report__board-catalog-item">
                <input
                  type="checkbox"
                  checked={onBoard}
                  onChange={() => update((current) => toggleBoardPiece(current, view, piece.id))}
                />
                <span className="opponent-report__board-piece-badge">{t(`opponentReportSheet_${piece.sheetId}`)}</span>
                <span>{piece.title}</span>
              </label>
            );
          })}
        </div>
      </details>

      {activePieces.length === 0 ? (
        <div className="opponent-report__board-empty">
          <p className="opponent-report__hint">{t('opponentReportBoardEmpty')}</p>
        </div>
      ) : (
        <div className="opponent-report__board-pieces">
          {activePieces.map((piece, index) => {
            const edit = report.pieceEdits?.[piece.id];
            return (
              <article key={piece.id} className="opponent-report__board-piece">
                <header className="opponent-report__board-piece-header">
                  <span className="opponent-report__board-piece-badge">
                    {t(`opponentReportSheet_${piece.sheetId}`)}
                  </span>
                  <input
                    type="text"
                    className="opponent-report__board-piece-title"
                    value={piece.title}
                    onChange={(event) => {
                      if (piece.kind === 'extra-sheet' && piece.drawingId) {
                        update((current) => ({
                          ...current,
                          drawings: updateTacticalDrawing(current.drawings ?? [], piece.drawingId!, (d) => ({
                            ...d,
                            title: event.target.value,
                          })),
                        }));
                      } else {
                        update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                          ...prev,
                          title: event.target.value,
                        })));
                      }
                    }}
                  />
                  <div className="opponent-report__key-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={index === 0}
                      onClick={() => update((current) => moveBoardPiece(current, view, piece.id, -1))}
                      aria-label={t('opponentReportMoveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={index === activePieces.length - 1}
                      onClick={() => update((current) => moveBoardPiece(current, view, piece.id, 1))}
                      aria-label={t('opponentReportMoveDown')}
                    >
                      ↓
                    </button>
                    {piece.isModified ? (
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => update((current) => resetBoardPieceEdit(current, piece.id))}
                      >
                        {`↺ ${t('opponentReportBoardResetPiece')}`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => {
                        if (piece.kind === 'extra-sheet' && piece.drawingId) {
                          update((current) => ({
                            ...toggleBoardPiece(current, view, piece.id),
                            drawings: removeTacticalDrawing(current.drawings ?? [], piece.drawingId!),
                          }));
                        } else {
                          update((current) => toggleBoardPiece(current, view, piece.id));
                        }
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </header>

                {piece.subtitle !== undefined ? (
                  <input
                    type="text"
                    className="opponent-report__board-piece-subtitle"
                    value={piece.subtitle}
                    onChange={(event) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                      ...prev,
                      subtitle: event.target.value,
                    })))}
                  />
                ) : null}

                {piece.kind === 'ordered-list' ? (
                  <EditableStringList
                    ordered
                    items={piece.items ?? []}
                    onChange={(items) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                      ...prev,
                      items,
                    })))}
                  />
                ) : null}

                {piece.kind === 'dual-bullets' ? (
                  <div className="opponent-report__columns">
                    <div className="opponent-report__bullets opponent-report__bullets--good">
                      <input
                        type="text"
                        className="opponent-report__board-piece-subtitle"
                        value={piece.itemsTitle ?? ''}
                        onChange={(event) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                          ...prev,
                          itemsTitle: event.target.value,
                        })))}
                      />
                      <EditableStringList
                        items={piece.items ?? []}
                        onChange={(items) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                          ...prev,
                          items,
                        })))}
                      />
                    </div>
                    <div className="opponent-report__bullets opponent-report__bullets--bad">
                      <input
                        type="text"
                        className="opponent-report__board-piece-subtitle"
                        value={piece.secondaryItemsTitle ?? ''}
                        onChange={(event) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                          ...prev,
                          secondaryItemsTitle: event.target.value,
                        })))}
                      />
                      <EditableStringList
                        items={piece.secondaryItems ?? []}
                        onChange={(secondaryItems) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                          ...prev,
                          secondaryItems,
                        })))}
                      />
                    </div>
                  </div>
                ) : null}

                {piece.kind === 'table' && piece.table ? (
                  <EditableViewTable
                    table={piece.table}
                    editTable={edit?.table}
                    onChange={(table) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                      ...prev,
                      table,
                    })))}
                  />
                ) : null}

                {piece.kind === 'court-grid' && piece.courts ? (
                  <div className="opponent-report__setter-courts">
                    {piece.courts.map((court) => renderCourtBlock(piece, court))}
                  </div>
                ) : null}

                {piece.kind === 'court-with-bullets' ? (
                  <div className="opponent-report__serve-targets">
                    {piece.court ? renderCourtBlock(piece, piece.court) : null}
                    <div>
                      <EditableStringList
                        items={piece.items ?? []}
                        onChange={(items) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                          ...prev,
                          items,
                        })))}
                      />
                    </div>
                  </div>
                ) : null}

                {piece.kind === 'player-card' ? (
                  <div className="opponent-report__attacker-summary">
                    {piece.court ? renderCourtBlock(piece, piece.court) : null}
                    {piece.table ? (
                      <div>
                        <input
                          type="text"
                          className="opponent-report__board-piece-subtitle"
                          value={piece.tableTitle ?? ''}
                          onChange={(event) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                            ...prev,
                            itemsTitle: event.target.value,
                          })))}
                        />
                        <EditableViewTable
                          table={piece.table}
                          editTable={edit?.table}
                          onChange={(table) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                            ...prev,
                            table,
                          })))}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {piece.kind === 'extra-sheet' && piece.drawing && piece.drawingId ? (
                  <InteractiveCourtSvgEditor
                    drawing={piece.drawing}
                    rosterPlayers={rosterPlayers}
                    allowLayoutChange
                    onChange={(nextDrawing) => update((current) => ({
                      ...current,
                      drawings: updateTacticalDrawing(current.drawings ?? [], piece.drawingId!, () => nextDrawing),
                    }))}
                  />
                ) : null}

                <label className="opponent-report__notes">
                  <span>{t('opponentReportBoardSheetNote')}</span>
                  <textarea
                    rows={2}
                    value={piece.note}
                    onChange={(event) => {
                      if (piece.kind === 'extra-sheet' && piece.drawingId) {
                        update((current) => ({
                          ...current,
                          drawings: updateTacticalDrawing(current.drawings ?? [], piece.drawingId!, (d) => ({
                            ...d,
                            note: event.target.value,
                          })),
                        }));
                      } else {
                        update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                          ...prev,
                          note: event.target.value,
                        })));
                      }
                    }}
                  />
                </label>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
