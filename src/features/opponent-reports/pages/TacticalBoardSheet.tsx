import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from '@src/i18n';
import type {
  OpponentReport,
  OpponentReportArrowShape,
  OpponentReportDrawing,
  OpponentReportDrawingTeam,
  OpponentReportPlayerShape,
  OpponentReportShape,
  OpponentReportTextShape,
} from '@src/domain/opponent-report/types';
import type { ReportPlayer } from '../model/report-metrics';
import {
  addDrawingShape,
  addTacticalDrawing,
  arrowMidpoint,
  clampCourtCoord,
  courtPercentToSvgPoint,
  createDrawingHistory,
  createTacticalDrawing,
  duplicateTacticalDrawing,
  getTacticalBoardDimensions,
  moveDrawingShape,
  moveTacticalDrawing,
  pushDrawingHistory,
  redoDrawingHistory,
  removeDrawingShape,
  removeTacticalDrawing,
  resetArrowCurve,
  TEAM_COLORS,
  translateDrawingArrow,
  undoDrawingHistory,
  updateArrowHandle,
  updateDrawingShape,
  updateTacticalDrawing,
  type DrawingHistoryState,
  type TacticalBoardDimensions,
} from '../model/tactical-board';

type Update = (change: (current: OpponentReport) => OpponentReport) => void;
type Tool = 'select' | 'player' | 'arrow' | 'text';

type DragState =
  | { kind: 'move-point'; shapeId: string }
  | { kind: 'move-arrow'; shapeId: string; lastX: number; lastY: number }
  | { kind: 'arrow-handle'; shapeId: string; handle: 'start' | 'end' | 'control' }
  | { kind: 'draw-arrow'; shapeId: string };

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function clientToCourtPercent(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement | null,
  dims: TacticalBoardDimensions,
): { x: number; y: number } | null {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const svgX = ((clientX - rect.left) / rect.width) * dims.width;
  const svgY = ((clientY - rect.top) / rect.height) * dims.height;
  return {
    x: clampCourtCoord(((svgX - dims.courtLeft) / dims.courtWidth) * 100),
    y: clampCourtCoord(((svgY - dims.courtTop) / dims.courtHeight) * 100),
  };
}

export function TacticalBoardSheet({
  report,
  update,
  opponentPlayers,
  ownPlayers,
}: {
  report: OpponentReport;
  update: Update;
  opponentPlayers: readonly ReportPlayer[];
  ownPlayers: readonly ReportPlayer[];
}) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawings = report.drawings ?? [];
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(() => drawings[0]?.id ?? null);
  const activeDrawing: OpponentReportDrawing | undefined =
    drawings.find((entry) => entry.id === selectedDrawingId) ?? drawings[0];

  const [tool, setTool] = useState<Tool>('select');
  const [team, setTeam] = useState<OpponentReportDrawingTeam>('opponent');
  const [jerseyNumber, setJerseyNumber] = useState<string>('7');
  const [textDraft, setTextDraft] = useState<string>('');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, DrawingHistoryState>>({});

  const getHistory = (drawing: OpponentReportDrawing): DrawingHistoryState => (
    historyById[drawing.id] ?? createDrawingHistory(drawing.shapes)
  );

  const commitDrawingChange = (
    drawing: OpponentReportDrawing,
    nextDrawing: OpponentReportDrawing,
    recordHistory = true,
  ) => {
    update((current) => ({
      ...current,
      drawings: updateTacticalDrawing(current.drawings, drawing.id, () => nextDrawing),
    }));
    if (recordHistory) {
      setHistoryById((current) => ({
        ...current,
        [drawing.id]: pushDrawingHistory(
          current[drawing.id] ?? createDrawingHistory(drawing.shapes),
          nextDrawing.shapes,
        ),
      }));
    }
  };

  const handleAddSheet = () => {
    const id = newId('sheet');
    const created = createTacticalDrawing({
      id,
      title: t('opponentReportBoardDefaultTitle', { number: drawings.length + 1 }),
    });
    update((current) => ({
      ...current,
      drawings: addTacticalDrawing(current.drawings, created),
    }));
    setSelectedDrawingId(id);
    setSelectedShapeId(null);
  };

  const handleDuplicateSheet = (drawing: OpponentReportDrawing) => {
    const id = newId('sheet');
    const copyTitle = t('opponentReportCopyTitle', { title: drawing.title || t('opponentReportBoardDefaultTitle', { number: 1 }) });
    update((current) => ({
      ...current,
      drawings: duplicateTacticalDrawing(current.drawings, drawing.id, id, copyTitle),
    }));
    setSelectedDrawingId(id);
    setSelectedShapeId(null);
  };

  const handleMoveSheet = (index: number, delta: number) => {
    update((current) => ({
      ...current,
      drawings: moveTacticalDrawing(current.drawings, index, delta),
    }));
  };

  const handleRemoveSheet = (drawingId: string) => {
    const remaining = removeTacticalDrawing(drawings, drawingId);
    update((current) => ({
      ...current,
      drawings: remaining,
    }));
    if (activeDrawing?.id === drawingId) {
      setSelectedDrawingId(remaining[0]?.id ?? null);
      setSelectedShapeId(null);
    }
  };

  const handleUndo = () => {
    if (!activeDrawing) return;
    const nextHistory = undoDrawingHistory(getHistory(activeDrawing));
    setHistoryById((current) => ({ ...current, [activeDrawing.id]: nextHistory }));
    update((current) => ({
      ...current,
      drawings: updateTacticalDrawing(current.drawings, activeDrawing.id, (entry) => ({
        ...entry,
        shapes: nextHistory.present,
      })),
    }));
  };

  const handleRedo = () => {
    if (!activeDrawing) return;
    const nextHistory = redoDrawingHistory(getHistory(activeDrawing));
    setHistoryById((current) => ({ ...current, [activeDrawing.id]: nextHistory }));
    update((current) => ({
      ...current,
      drawings: updateTacticalDrawing(current.drawings, activeDrawing.id, (entry) => ({
        ...entry,
        shapes: nextHistory.present,
      })),
    }));
  };

  const handleDeleteSelected = () => {
    if (!activeDrawing || !selectedShapeId) return;
    const nextDrawing = removeDrawingShape(activeDrawing, selectedShapeId);
    commitDrawingChange(activeDrawing, nextDrawing, true);
    setSelectedShapeId(null);
  };

  if (!activeDrawing) {
    return (
      <section className="opponent-report__sheet">
        <p className="opponent-report__hint">{t('opponentReportBoardEmpty')}</p>
        <div>
          <button type="button" className="btn-primary" onClick={handleAddSheet}>
            {t('opponentReportBoardAddSheet')}
          </button>
        </div>
      </section>
    );
  }

  const dims = getTacticalBoardDimensions(activeDrawing.court, activeDrawing.orientation);
  const history = getHistory(activeDrawing);
  const selectedShape: OpponentReportShape | undefined = activeDrawing.shapes.find(
    (shape) => shape.id === selectedShapeId,
  );
  const rosterForActiveTeam = team === 'opponent' ? opponentPlayers : ownPlayers;

  const ensureBaselineHistory = () => {
    setHistoryById((current) => (
      current[activeDrawing.id]
        ? current
        : { ...current, [activeDrawing.id]: createDrawingHistory(activeDrawing.shapes) }
    ));
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const pt = clientToCourtPercent(event.clientX, event.clientY, svgRef.current, dims);
    if (!pt) return;

    if (tool === 'player') {
      const id = newId('player');
      const next = addDrawingShape(activeDrawing, {
        id,
        kind: 'player',
        team,
        number: jerseyNumber.trim() || '1',
        x: pt.x,
        y: pt.y,
      });
      commitDrawingChange(activeDrawing, next, true);
      setSelectedShapeId(id);
      return;
    }

    if (tool === 'text') {
      const id = newId('text');
      const next = addDrawingShape(activeDrawing, {
        id,
        kind: 'text',
        text: textDraft.trim() || t('opponentReportBoardTextValue'),
        x: pt.x,
        y: pt.y,
      });
      commitDrawingChange(activeDrawing, next, true);
      setSelectedShapeId(id);
      return;
    }

    if (tool === 'arrow') {
      ensureBaselineHistory();
      const id = newId('arrow');
      const next = addDrawingShape(activeDrawing, {
        id,
        kind: 'arrow',
        team,
        x1: pt.x,
        y1: pt.y,
        x2: clampCourtCoord(pt.x + 8),
        y2: clampCourtCoord(pt.y - 8),
      });
      commitDrawingChange(activeDrawing, next, false);
      setSelectedShapeId(id);
      setDragState({ kind: 'draw-arrow', shapeId: id });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setSelectedShapeId(null);
  };

  const onShapePointerDown = (
    event: ReactPointerEvent<SVGElement>,
    shape: OpponentReportShape,
  ) => {
    event.stopPropagation();
    setSelectedShapeId(shape.id);
    const pt = clientToCourtPercent(event.clientX, event.clientY, svgRef.current, dims);
    if (!pt) return;
    ensureBaselineHistory();
    if (shape.kind === 'player' || shape.kind === 'text') {
      setDragState({ kind: 'move-point', shapeId: shape.id });
    } else {
      setDragState({ kind: 'move-arrow', shapeId: shape.id, lastX: pt.x, lastY: pt.y });
    }
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onArrowHandlePointerDown = (
    event: ReactPointerEvent<SVGCircleElement>,
    shapeId: string,
    handle: 'start' | 'end' | 'control',
  ) => {
    event.stopPropagation();
    setSelectedShapeId(shapeId);
    ensureBaselineHistory();
    setDragState({ kind: 'arrow-handle', shapeId, handle });
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const pt = clientToCourtPercent(event.clientX, event.clientY, svgRef.current, dims);
    if (!pt) return;

    if (dragState.kind === 'move-point') {
      const next = moveDrawingShape(activeDrawing, dragState.shapeId, pt);
      commitDrawingChange(activeDrawing, next, false);
      return;
    }

    if (dragState.kind === 'move-arrow') {
      const dx = pt.x - dragState.lastX;
      const dy = pt.y - dragState.lastY;
      const next = translateDrawingArrow(activeDrawing, dragState.shapeId, dx, dy);
      commitDrawingChange(activeDrawing, next, false);
      setDragState({ ...dragState, lastX: pt.x, lastY: pt.y });
      return;
    }

    if (dragState.kind === 'arrow-handle') {
      const next = updateArrowHandle(activeDrawing, dragState.shapeId, dragState.handle, pt.x, pt.y);
      commitDrawingChange(activeDrawing, next, false);
      return;
    }

    if (dragState.kind === 'draw-arrow') {
      const next = updateArrowHandle(activeDrawing, dragState.shapeId, 'end', pt.x, pt.y);
      commitDrawingChange(activeDrawing, next, false);
    }
  };

  const finishDrag = () => {
    if (!dragState) return;
    setDragState(null);
    setHistoryById((current) => ({
      ...current,
      [activeDrawing.id]: pushDrawingHistory(
        current[activeDrawing.id] ?? createDrawingHistory(activeDrawing.shapes),
        activeDrawing.shapes,
      ),
    }));
  };

  const renderCourtLines = () => {
    const { courtLeft, courtTop, courtWidth, courtHeight } = dims;
    if (activeDrawing.court === 'half' && activeDrawing.orientation === 'vertical') {
      const attackY = courtTop + courtHeight / 3;
      return (
        <>
          <line x1={courtLeft} y1={attackY} x2={courtLeft + courtWidth} y2={attackY} stroke="#002554" strokeWidth={1.2} strokeDasharray="6 4" />
          <line x1={courtLeft - 6} y1={courtTop} x2={courtLeft + courtWidth + 6} y2={courtTop} stroke="#002554" strokeWidth={4.5} />
          <text x={courtLeft + courtWidth / 2} y={courtTop - 6} fontSize={9.5} fontWeight={600} fill="#002554" textAnchor="middle">
            {t('opponentReportNet')}
          </text>
        </>
      );
    }
    if (activeDrawing.court === 'half' && activeDrawing.orientation === 'horizontal') {
      const netX = courtLeft + courtWidth;
      const attackX = courtLeft + (courtWidth * 2) / 3;
      return (
        <>
          <line x1={attackX} y1={courtTop} x2={attackX} y2={courtTop + courtHeight} stroke="#002554" strokeWidth={1.2} strokeDasharray="6 4" />
          <line x1={netX} y1={courtTop - 6} x2={netX} y2={courtTop + courtHeight + 6} stroke="#002554" strokeWidth={4.5} />
          <text x={netX - 6} y={courtTop - 6} fontSize={9.5} fontWeight={600} fill="#002554" textAnchor="end">
            {t('opponentReportNet')}
          </text>
        </>
      );
    }
    if (activeDrawing.court === 'full' && activeDrawing.orientation === 'vertical') {
      const netY = courtTop + courtHeight / 2;
      const topAttackY = netY - courtHeight / 6;
      const bottomAttackY = netY + courtHeight / 6;
      return (
        <>
          <line x1={courtLeft} y1={topAttackY} x2={courtLeft + courtWidth} y2={topAttackY} stroke="#002554" strokeWidth={1.2} strokeDasharray="6 4" />
          <line x1={courtLeft} y1={bottomAttackY} x2={courtLeft + courtWidth} y2={bottomAttackY} stroke="#002554" strokeWidth={1.2} strokeDasharray="6 4" />
          <line x1={courtLeft - 6} y1={netY} x2={courtLeft + courtWidth + 6} y2={netY} stroke="#002554" strokeWidth={4.5} />
        </>
      );
    }
    const netX = courtLeft + courtWidth / 2;
    const leftAttackX = netX - courtWidth / 6;
    const rightAttackX = netX + courtWidth / 6;
    return (
      <>
        <line x1={leftAttackX} y1={courtTop} x2={leftAttackX} y2={courtTop + courtHeight} stroke="#002554" strokeWidth={1.2} strokeDasharray="6 4" />
        <line x1={rightAttackX} y1={courtTop} x2={rightAttackX} y2={courtTop + courtHeight} stroke="#002554" strokeWidth={1.2} strokeDasharray="6 4" />
        <line x1={netX} y1={courtTop - 6} x2={netX} y2={courtTop + courtHeight + 6} stroke="#002554" strokeWidth={4.5} />
      </>
    );
  };

  return (
    <section className="opponent-report__sheet opponent-report__board">
      <div className="opponent-report__board-sheets">
        <div className="opponent-report__board-sheet-tabs">
          {drawings.map((entry, index) => (
            <div key={entry.id} className={`opponent-report__board-sheet-pill${entry.id === activeDrawing.id ? ' is-active' : ''}`}>
              <button
                type="button"
                className="opponent-report__board-sheet-select"
                onClick={() => {
                  setSelectedDrawingId(entry.id);
                  setSelectedShapeId(null);
                }}
              >
                {entry.title || t('opponentReportBoardDefaultTitle', { number: index + 1 })}
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => handleMoveSheet(index, -1)}
                disabled={index === 0}
                aria-label={t('opponentReportMoveUp')}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => handleMoveSheet(index, 1)}
                disabled={index === drawings.length - 1}
                aria-label={t('opponentReportMoveDown')}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => handleDuplicateSheet(entry)}
              >
                {t('opponentReportDuplicate')}
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => handleRemoveSheet(entry.id)}
              >
                {t('opponentReportDelete')}
              </button>
            </div>
          ))}
          <button type="button" className="btn-primary btn-small" onClick={handleAddSheet}>
            + {t('opponentReportBoardAddSheet')}
          </button>
        </div>
      </div>

      <div className="opponent-report__board-meta">
        <label>
          <span>{t('opponentReportBoardSheetTitle')}</span>
          <input
            type="text"
            className="form-input"
            value={activeDrawing.title}
            onChange={(event) => commitDrawingChange(
              activeDrawing,
              { ...activeDrawing, title: event.target.value },
              false,
            )}
          />
        </label>
        <label>
          <span>{t('opponentReportBoardCourt')}</span>
          <select
            className="form-select"
            value={activeDrawing.court}
            onChange={(event) => commitDrawingChange(
              activeDrawing,
              { ...activeDrawing, court: event.target.value === 'full' ? 'full' : 'half' },
              false,
            )}
          >
            <option value="half">{t('opponentReportBoardCourtHalf')}</option>
            <option value="full">{t('opponentReportBoardCourtFull')}</option>
          </select>
        </label>
        <label>
          <span>{t('opponentReportBoardOrientation')}</span>
          <select
            className="form-select"
            value={activeDrawing.orientation}
            onChange={(event) => commitDrawingChange(
              activeDrawing,
              { ...activeDrawing, orientation: event.target.value === 'horizontal' ? 'horizontal' : 'vertical' },
              false,
            )}
          >
            <option value="vertical">{t('opponentReportBoardOrientationVertical')}</option>
            <option value="horizontal">{t('opponentReportBoardOrientationHorizontal')}</option>
          </select>
        </label>
      </div>

      <div className="opponent-report__board-toolbar">
        <div className="opponent-report__board-tool-group">
          {(['select', 'player', 'arrow', 'text'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              className={`btn-secondary btn-small${tool === entry ? ' is-active' : ''}`}
              onClick={() => setTool(entry)}
              aria-pressed={tool === entry}
            >
              {entry === 'select' && t('opponentReportBoardToolSelect')}
              {entry === 'player' && t('opponentReportBoardToolPlayer')}
              {entry === 'arrow' && t('opponentReportBoardToolArrow')}
              {entry === 'text' && t('opponentReportBoardToolText')}
            </button>
          ))}
        </div>

        {(tool === 'player' || tool === 'arrow') ? (
          <div className="opponent-report__board-tool-group">
            <button
              type="button"
              className={`btn-secondary btn-small${team === 'opponent' ? ' is-active' : ''}`}
              onClick={() => setTeam('opponent')}
            >
              ● {t('opponentReportBoardTeamOpponent')}
            </button>
            <button
              type="button"
              className={`btn-secondary btn-small${team === 'own' ? ' is-active' : ''}`}
              onClick={() => setTeam('own')}
            >
              ● {t('opponentReportBoardTeamOwn')}
            </button>
          </div>
        ) : null}

        {tool === 'player' ? (
          <label className="opponent-report__board-inline-field">
            <span>{t('opponentReportBoardJerseyNumber')}</span>
            <input
              type="text"
              className="form-input"
              maxLength={6}
              value={jerseyNumber}
              onChange={(event) => setJerseyNumber(event.target.value)}
            />
          </label>
        ) : null}

        {tool === 'text' ? (
          <label className="opponent-report__board-inline-field">
            <span>{t('opponentReportBoardTextValue')}</span>
            <input
              type="text"
              className="form-input"
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              placeholder={t('opponentReportBoardTextValue')}
            />
          </label>
        ) : null}

        <div className="opponent-report__board-tool-group">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleUndo}
            disabled={history.past.length === 0}
          >
            ↶ {t('opponentReportBoardUndo')}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleRedo}
            disabled={history.future.length === 0}
          >
            ↷ {t('opponentReportBoardRedo')}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleDeleteSelected}
            disabled={!selectedShape}
          >
            ✕ {t('opponentReportBoardDeleteSelected')}
          </button>
        </div>
      </div>

      {tool === 'player' && rosterForActiveTeam.length > 0 ? (
        <div className="opponent-report__board-quick-players">
          <small>{t('opponentReportBoardQuickPlayers')}</small>
          <div className="opponent-report__board-quick-player-buttons">
            {rosterForActiveTeam.map((player) => {
              const num = player.jersey || '?';
              return (
                <button
                  key={player.key}
                  type="button"
                  className={`btn-secondary btn-small${jerseyNumber === num ? ' is-active' : ''}`}
                  onClick={() => setJerseyNumber(num)}
                >
                  #{num} {player.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <p className="opponent-report__hint">{t('opponentReportBoardHint')}</p>

      <div className="opponent-report__board-workspace">
        <div className="opponent-report__board-canvas-wrap">
          <svg
            ref={svgRef}
            className="opponent-report__board-svg"
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <defs>
              <marker id="editor-arrow-opponent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={TEAM_COLORS.opponent.stroke} />
              </marker>
              <marker id="editor-arrow-own" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={TEAM_COLORS.own.stroke} />
              </marker>
            </defs>
            <rect width={dims.width} height={dims.height} fill="#ffffff" />
            <rect
              x={dims.courtLeft}
              y={dims.courtTop}
              width={dims.courtWidth}
              height={dims.courtHeight}
              fill="#f8fafc"
              stroke="#002554"
              strokeWidth={1.6}
            />
            {renderCourtLines()}

            {activeDrawing.shapes
              .filter((shape): shape is OpponentReportArrowShape => shape.kind === 'arrow')
              .map((arrow) => {
                const start = courtPercentToSvgPoint(arrow.x1, arrow.y1, dims);
                const end = courtPercentToSvgPoint(arrow.x2, arrow.y2, dims);
                const mid = courtPercentToSvgPoint(
                  arrowMidpoint(arrow).x,
                  arrowMidpoint(arrow).y,
                  dims,
                );
                const isSelected = arrow.id === selectedShapeId;
                const color = TEAM_COLORS[arrow.team].stroke;
                const markerId = `editor-arrow-${arrow.team}`;
                const pathD = arrow.cx !== undefined && arrow.cy !== undefined
                  ? (() => {
                    const control = courtPercentToSvgPoint(arrow.cx, arrow.cy, dims);
                    return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
                  })()
                  : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

                return (
                  <g key={arrow.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(event) => onShapePointerDown(event, arrow)}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth={isSelected ? 3.4 : 2.6}
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
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(event) => onArrowHandlePointerDown(event, arrow.id, 'start')}
                        />
                        <circle
                          cx={mid.x}
                          cy={mid.y}
                          r={6}
                          fill="#fef08a"
                          stroke="#ca8a04"
                          strokeWidth={2}
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(event) => onArrowHandlePointerDown(event, arrow.id, 'control')}
                        />
                        <circle
                          cx={end.x}
                          cy={end.y}
                          r={6}
                          fill="#ffffff"
                          stroke={color}
                          strokeWidth={2}
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(event) => onArrowHandlePointerDown(event, arrow.id, 'end')}
                        />
                      </>
                    ) : null}
                  </g>
                );
              })}

            {activeDrawing.shapes
              .filter((shape): shape is OpponentReportPlayerShape => shape.kind === 'player')
              .map((player) => {
                const pt = courtPercentToSvgPoint(player.x, player.y, dims);
                const colors = TEAM_COLORS[player.team];
                const isSelected = player.id === selectedShapeId;
                const text = player.number || '•';
                return (
                  <g
                    key={player.id}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(event) => onShapePointerDown(event, player)}
                  >
                    {isSelected ? (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={19}
                        fill="none"
                        stroke="#0f172a"
                        strokeWidth={1.8}
                        strokeDasharray="3 2"
                      />
                    ) : null}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={15}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={1.6}
                    />
                    <text
                      x={pt.x}
                      y={pt.y + 4}
                      fontSize={text.length > 2 ? 9.5 : 11.5}
                      fontWeight="bold"
                      fill={colors.text}
                      textAnchor="middle"
                    >
                      {text}
                    </text>
                  </g>
                );
              })}

            {activeDrawing.shapes
              .filter((shape): shape is OpponentReportTextShape => shape.kind === 'text')
              .map((label) => {
                const pt = courtPercentToSvgPoint(label.x, label.y, dims);
                const isSelected = label.id === selectedShapeId;
                return (
                  <g
                    key={label.id}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(event) => onShapePointerDown(event, label)}
                  >
                    <text
                      x={pt.x}
                      y={pt.y}
                      fontSize={11.5}
                      fontWeight="bold"
                      fill={isSelected ? '#1d4ed8' : '#0f172a'}
                      stroke="#ffffff"
                      strokeWidth={3.5}
                      paintOrder="stroke"
                      textAnchor="middle"
                    >
                      {label.text}
                    </text>
                    <text
                      x={pt.x}
                      y={pt.y}
                      fontSize={11.5}
                      fontWeight="bold"
                      fill={isSelected ? '#1d4ed8' : '#0f172a'}
                      textAnchor="middle"
                    >
                      {label.text}
                    </text>
                  </g>
                );
              })}
          </svg>
        </div>

        {selectedShape ? (
          <aside className="opponent-report__board-inspector">
            <h3>{t('opponentReportBoardEditSelected')}</h3>
            {selectedShape.kind === 'player' ? (
              <div className="opponent-report__board-inspector-fields">
                <label>
                  <span>{t('opponentReportOpponent')} / {t('opponentReportBoardTeamOwn')}</span>
                  <select
                    className="form-select"
                    value={selectedShape.team}
                    onChange={(event) => {
                      const nextTeam: OpponentReportDrawingTeam = event.target.value === 'own' ? 'own' : 'opponent';
                      const next = updateDrawingShape(activeDrawing, selectedShape.id, (s) => (
                        s.kind === 'player' ? { ...s, team: nextTeam } : s
                      ));
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  >
                    <option value="opponent">{t('opponentReportBoardTeamOpponent')}</option>
                    <option value="own">{t('opponentReportBoardTeamOwn')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('opponentReportBoardJerseyNumber')}</span>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={6}
                    value={selectedShape.number}
                    onChange={(event) => {
                      const next = updateDrawingShape(activeDrawing, selectedShape.id, (s) => (
                        s.kind === 'player' ? { ...s, number: event.target.value } : s
                      ));
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  />
                </label>
                <label>
                  <span>{t('opponentReportBoardCoordX')}</span>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(selectedShape.x)}
                    onChange={(event) => {
                      const next = moveDrawingShape(activeDrawing, selectedShape.id, {
                        x: Number(event.target.value),
                        y: selectedShape.y,
                      });
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  />
                </label>
                <label>
                  <span>{t('opponentReportBoardCoordY')}</span>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(selectedShape.y)}
                    onChange={(event) => {
                      const next = moveDrawingShape(activeDrawing, selectedShape.id, {
                        x: selectedShape.x,
                        y: Number(event.target.value),
                      });
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  />
                </label>
              </div>
            ) : null}

            {selectedShape.kind === 'text' ? (
              <div className="opponent-report__board-inspector-fields">
                <label>
                  <span>{t('opponentReportBoardTextValue')}</span>
                  <input
                    type="text"
                    className="form-input"
                    value={selectedShape.text}
                    onChange={(event) => {
                      const next = updateDrawingShape(activeDrawing, selectedShape.id, (s) => (
                        s.kind === 'text' ? { ...s, text: event.target.value } : s
                      ));
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  />
                </label>
                <label>
                  <span>{t('opponentReportBoardCoordX')}</span>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(selectedShape.x)}
                    onChange={(event) => {
                      const next = moveDrawingShape(activeDrawing, selectedShape.id, {
                        x: Number(event.target.value),
                        y: selectedShape.y,
                      });
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  />
                </label>
                <label>
                  <span>{t('opponentReportBoardCoordY')}</span>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(selectedShape.y)}
                    onChange={(event) => {
                      const next = moveDrawingShape(activeDrawing, selectedShape.id, {
                        x: selectedShape.x,
                        y: Number(event.target.value),
                      });
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  />
                </label>
              </div>
            ) : null}

            {selectedShape.kind === 'arrow' ? (
              <div className="opponent-report__board-inspector-fields">
                <label>
                  <span>{t('opponentReportOpponent')} / {t('opponentReportBoardTeamOwn')}</span>
                  <select
                    className="form-select"
                    value={selectedShape.team}
                    onChange={(event) => {
                      const nextTeam: OpponentReportDrawingTeam = event.target.value === 'own' ? 'own' : 'opponent';
                      const next = updateDrawingShape(activeDrawing, selectedShape.id, (s) => (
                        s.kind === 'arrow' ? { ...s, team: nextTeam } : s
                      ));
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  >
                    <option value="opponent">{t('opponentReportBoardTeamOpponent')}</option>
                    <option value="own">{t('opponentReportBoardTeamOwn')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('opponentReportBoardArrowStart')}</span>
                  <div className="opponent-report__board-coord-pair">
                    <input
                      type="number"
                      className="form-input"
                      min={0}
                      max={100}
                      value={Math.round(selectedShape.x1)}
                      onChange={(event) => {
                        const next = updateArrowHandle(activeDrawing, selectedShape.id, 'start', Number(event.target.value), selectedShape.y1);
                        commitDrawingChange(activeDrawing, next, true);
                      }}
                    />
                    <input
                      type="number"
                      className="form-input"
                      min={0}
                      max={100}
                      value={Math.round(selectedShape.y1)}
                      onChange={(event) => {
                        const next = updateArrowHandle(activeDrawing, selectedShape.id, 'start', selectedShape.x1, Number(event.target.value));
                        commitDrawingChange(activeDrawing, next, true);
                      }}
                    />
                  </div>
                </label>
                <label>
                  <span>{t('opponentReportBoardArrowEnd')}</span>
                  <div className="opponent-report__board-coord-pair">
                    <input
                      type="number"
                      className="form-input"
                      min={0}
                      max={100}
                      value={Math.round(selectedShape.x2)}
                      onChange={(event) => {
                        const next = updateArrowHandle(activeDrawing, selectedShape.id, 'end', Number(event.target.value), selectedShape.y2);
                        commitDrawingChange(activeDrawing, next, true);
                      }}
                    />
                    <input
                      type="number"
                      className="form-input"
                      min={0}
                      max={100}
                      value={Math.round(selectedShape.y2)}
                      onChange={(event) => {
                        const next = updateArrowHandle(activeDrawing, selectedShape.id, 'end', selectedShape.x2, Number(event.target.value));
                        commitDrawingChange(activeDrawing, next, true);
                      }}
                    />
                  </div>
                </label>
                {selectedShape.cx !== undefined ? (
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => {
                      const next = resetArrowCurve(activeDrawing, selectedShape.id);
                      commitDrawingChange(activeDrawing, next, true);
                    }}
                  >
                    {t('opponentReportBoardResetCurve')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      <label className="opponent-report__notes">
        <span>{t('opponentReportBoardSheetNote')}</span>
        <textarea
          rows={3}
          value={activeDrawing.note}
          onChange={(event) => commitDrawingChange(
            activeDrawing,
            { ...activeDrawing, note: event.target.value },
            false,
          )}
        />
      </label>
    </section>
  );
}
