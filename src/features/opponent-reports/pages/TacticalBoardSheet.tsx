import { Modal } from '@src/components/Modal';
import { nextChartRotation } from '@src/lib/utils/chart-rotation';
import { expandAttackerViews, expandSetterViews } from '../model/split-views';
import { BookletSettings } from './BookletSettings';
import { chartedSetterKeys, DEFAULT_BOOKLET, rankSetterGroups, TEAM_CHART_BAR, TEAM_CHART_HIGHLIGHT, teamStartsElements, type ReportBookletPlan, type ReportStaffNote } from '../model/report-booklet';
import { PIECE_TEAM_STARTS } from '../model/board-pieces';
import { playerLabel } from '../model/report-keys';
import { moveReportComponent, reportComponentOrder } from '../model/report-components';
import { ReportPriorities } from './ReportPriorities';
import { reportPriorities } from '../model/report-priorities';
import type { KeySuggestion } from '../model/report-keys';
import { useMemo, useRef, useState } from 'react';
import { ActionIcon } from '@src/components/ActionIcon';
import { useTranslation } from '@src/i18n';
import type {
  OpponentReport,
  OpponentReportComponentId,
  OpponentReportPieceEdit,
} from '@src/domain/opponent-report/types';
import {
  buildBoardPieceCatalog,
  duplicateBoardPiece,
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
import { InteractiveCourtSvgEditor } from './InteractiveCourtSvgEditor';
import { AttackerViewsEditor } from './AttackerViewsEditor';
import { SetterViewsEditor } from './SetterViewsEditor';
import type { ReportPlayer } from '../model/report-metrics';
import { formatViewCell, type ReportView, type ViewT, type ViewTable } from '../model/report-view';
import { ViewTableView } from './OpponentReportSheets';
import { addTacticalDrawing, collectCustomLegendEntries, createTacticalDrawing, drawingHasMoveArrows, duplicateTacticalDrawing, findMoveArrowColor, removeTacticalDrawing, updateTacticalDrawing } from '../model/tactical-board';
import { buildAttackDefenseLegendSvg, buildCustomLegendSvg, buildServeHowLegendSvg, buildServeTargetsLegendSvg } from '../model/reception-formation';
import { videoLinkWatchKey } from '../model/attacker-video-links';

type Update = (change: (current: OpponentReport) => OpponentReport) => void;
const newDrawingId = () => `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function EditableViewTable({
  table,
  editTable,
  onChange,
}: {
  table: ViewTable;
  editTable: OpponentReportPieceEdit['table'] | undefined;
  onChange: (nextTable: NonNullable<OpponentReportPieceEdit['table']>) => void;
}) {
  const { t } = useTranslation();
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
                  {cell.band && cell.band !== 'none' ? <small>{formatViewCell({ text: '', band: cell.band })}</small> : null}
                  <input
                    type="text"
                    className="opponent-report__cell-input"
                    value={cell.text}
                    onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                  />
                  {cell.few ? <small>{t('tacticalFewData')}</small> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


const SERVE_HEATMAP_GRID_ROWS: readonly (readonly string[])[] = [
  ['2', '9', '1'],
  ['3', '8', '6'],
  ['4', '7', '5'],
];

function parseServeHeatmapStrips(rawSvg: string): Array<{ index: number; heading: string; pcts: Record<string, number> }> {
  const headings = new Map<number, string>();
  for (const match of rawSvg.matchAll(/data-serve-strip-heading="(\d+)"[^>]*>([^<]*)</g)) {
    headings.set(Number(match[1]), match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  }
  const pctsByStrip = new Map<number, Record<string, number>>();
  for (const match of rawSvg.matchAll(/data-serve-target-zone="(\d+)"\s+data-heat="[^"]*"\s+data-serve-strip="(\d+)"\s+data-serve-pct="(\d+)"/g)) {
    const zone = match[1];
    const stripIndex = Number(match[2]);
    const pct = Number(match[3]);
    const entry = pctsByStrip.get(stripIndex) ?? {};
    entry[zone] = pct;
    pctsByStrip.set(stripIndex, entry);
  }
  return [...pctsByStrip.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, pcts]) => ({ index, heading: headings.get(index) ?? `#${index + 1}`, pcts }));
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
              <ActionIcon name="delete" />
            </button>
          </li>
        ))}
      </Tag>
      <button
        type="button"
        className="btn-secondary btn-small"
        onClick={() => onChange([...items, ''])}
      >
        <ActionIcon name="add" />{t('opponentReportBoardAddItem')}
      </button>
    </div>
  );
}

export function TacticalBoardSheet({
  report,
  plan,
  staffNotes,
  view,
  viewT,
  rosterPlayers,
  attackCombinationCodes = [],
  setterCallCodes = [],
  suggestions,
  update,
}: {
  report: OpponentReport;
  plan: ReportBookletPlan;
  staffNotes: readonly ReportStaffNote[];
  view: ReportView;
  viewT: ViewT;
  rosterPlayers: readonly ReportPlayer[];
  attackCombinationCodes?: readonly string[];
  setterCallCodes?: readonly string[];
  suggestions: readonly KeySuggestion[];
  update: Update;
}) {
  const { t } = useTranslation();
  const [editingCourtTarget, setEditingCourtTarget] = useState<
    | { kind: 'piece-court'; pieceId: string; courtKey: string; title: string }
    | { kind: 'extra-drawing'; pieceId: string; drawingId: string; title: string }
    | null
  >(null);
  const [editingHeatmapPieceId, setEditingHeatmapPieceId] = useState<string | null>(null);

  const catalog = useMemo(() => buildBoardPieceCatalog(report, view, viewT), [report, view, viewT]);
  const catalogGroups = useMemo(() => {
    const groups = new Map<ResolvedBoardPiece['sheetId'], { sheetId: ResolvedBoardPiece['sheetId']; pieces: ResolvedBoardPiece[]; onBoard: number }>();
    for (const piece of catalog.values()) {
      const group = groups.get(piece.sheetId) ?? { sheetId: piece.sheetId, pieces: [], onBoard: 0 };
      group.pieces.push(piece);
      if (isPieceOnBoard(report, view, piece.id)) group.onBoard += 1;
      groups.set(piece.sheetId, group);
    }
    return [...groups.values()];
  }, [catalog, report, view]);
  const activePieces = useMemo(() => resolveBoardPieces(report, view, viewT), [report, view, viewT]);
  const [selectedComponent, setSelectedComponent] = useState<OpponentReportComponentId | 'format'>('keys');
  const [draggedComponent, setDraggedComponent] = useState<OpponentReportComponentId | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const navigatorRef = useRef<HTMLDetailsElement>(null);
  const components = reportComponentOrder(report).filter(id => id === 'notes' || activePieces.some(piece => piece.sheetId === id));
  const selected = selectedComponent === 'format' || components.includes(selectedComponent) ? selectedComponent : components[0] ?? 'format';
  const selectComponent = (id: OpponentReportComponentId | 'format') => {
    setSelectedComponent(id); setEditingCourtTarget(null);
    if (window.matchMedia('(max-width: 800px)').matches && navigatorRef.current) navigatorRef.current.open = false;
    editorRef.current?.focus();
  };
  const componentLabel = (id: OpponentReportComponentId) => id === 'notes' ? t('bookletNotes') : t(`opponentReportSheet_${id}`);
  const componentStatus = (id: OpponentReportComponentId) => {
    if (id === 'attackers') {
      const descriptions = view.attackers.filter(a => report.booklet?.textOnlyAttackerKeys?.includes(a.player.key)).length;
      return t('reportComponentAttackCount', {charts: view.attackers.length - descriptions, descriptions});
    }
    if (id === 'setter') {
      const charts = chartedSetterKeys(report.booklet, view.setter.groups).length;
      return t('reportComponentSetterCount', {charts, text: view.setter.groups.length - charts});
    }
    if (id === 'notes') return '';
    // Count what the coach sees: priorities and rotations, not internal pieces.
    if (id === 'keys') return t('reportComponentCount', {count: reportPriorities(report, suggestions).length});
    if (id === 'serveTargets') return t('reportComponentCount', {count: view.serveTargets.formations.length});
    return t('reportComponentCount', {count: activePieces.filter(piece => piece.sheetId === id).length});
  };


  const handleAddExtraSheet = () => {
    setSelectedComponent('board');
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
    const edit = report.pieceEdits?.[piece.id];
    const hasCustomDrawing = Boolean(edit?.courtDrawings?.[court.key]);

    return (
      <div className="opponent-report__board-court-card" key={court.key}>
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
              setEditingCourtTarget({ kind: 'piece-court', pieceId: piece.id, courtKey: court.key, title: `${piece.title} · ${court.label}` });
            }}
          >
            <ActionIcon name="edit" />{t('opponentReportBoardEditSvg')}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            title={t('chartRotateHint')}
            onClick={() => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => {
              const next = nextChartRotation(prev.courtRotations?.[court.key]);
              const rotations = { ...(prev.courtRotations ?? {}) };
              if (next) rotations[court.key] = next;
              else delete rotations[court.key];
              return { ...prev, courtRotations: rotations };
            }))}
          >
            ⟳ {t('chartRotate')}{edit?.courtRotations?.[court.key] ? ` (${edit.courtRotations[court.key]}°)` : ''}
          </button>
          {edit?.courtRotations?.[court.key] ? (
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => {
                const rotations = { ...(prev.courtRotations ?? {}) };
                delete rotations[court.key];
                return { ...prev, courtRotations: rotations };
              }))}
            >
              <ActionIcon name="undo" />{t('chartRotateReset')}
            </button>
          ) : null}
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
              <ActionIcon name="undo" />{t('opponentReportBoardResetSvg')}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="opponent-report__sheet opponent-report__board">
      <div className="report-composer">
      <details ref={navigatorRef} open className="report-composer__navigator">
        <summary>{t('reportComponents')}</summary>
        <nav aria-label={t('reportComponents')}>
          <button type="button" className="report-composer__select" aria-current={selected === 'format' ? 'true' : undefined} onClick={() => selectComponent('format')}>{t('bookletFormat')}</button>
          <ol className="report-composer__list">
            {components.map((id, index) => <li key={id} className={selected === id ? 'is-selected' : ''}
              onDragOver={event => {if (draggedComponent) event.preventDefault();}}
              onDrop={event => {event.preventDefault(); if (draggedComponent) update(current => moveReportComponent(current, draggedComponent, id)); setDraggedComponent(null);}}>
              <button type="button" draggable className="report-composer__drag" aria-label={t('reportDragComponent', {name: componentLabel(id)})}
                onDragStart={event => {setDraggedComponent(id); event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain', id);}}
                onDragEnd={() => setDraggedComponent(null)}>⠿</button>
              <button type="button" className="report-composer__select" aria-current={selected === id ? 'true' : undefined} onClick={() => selectComponent(id)}>
                <span>{componentLabel(id)}</span><small>{componentStatus(id)}</small>
              </button>
              <div className="report-composer__move">
                <button type="button" disabled={index === 0} aria-label={`${t('opponentReportMoveUp')}: ${componentLabel(id)}`} onClick={() => update(current => moveReportComponent(current, id, components[index-1]))}><ActionIcon name="up" /></button>
                <button type="button" disabled={index === components.length-1} aria-label={`${t('opponentReportMoveDown')}: ${componentLabel(id)}`} onClick={() => update(current => moveReportComponent(current, id, components[index+1]))}><ActionIcon name="down" /></button>
              </div>
            </li>)}
          </ol>
        </nav>
      <details className="opponent-report__sheets-config">
        <summary><ActionIcon name="manage" />{t('tacticalManageSheets')}</summary>
        <p className="opponent-report__hint">{t('tacticalManageSheetsHelp')}</p>
        <button type="button" className="btn-secondary" onClick={handleAddExtraSheet}><ActionIcon name="add" />{t('opponentReportBoardAddExtraSheet')}</button>
        <div className="opponent-report__board-catalog-groups">
          {catalogGroups.map((group) => (
            <details key={group.sheetId} className="opponent-report__board-catalog-group">
              <summary>
                <span>{t(`opponentReportSheet_${group.sheetId}`)}</span>
                <small>{t('opponentReportCatalogGroupCount', { on: group.onBoard, total: group.pieces.length })}</small>
              </summary>
              <div className="opponent-report__board-catalog-list">
                {group.pieces.map((piece) => (
                  <label key={piece.id} className="opponent-report__board-catalog-item">
                    <input
                      type="checkbox"
                      checked={isPieceOnBoard(report, view, piece.id)}
                      onChange={() => update((current) => toggleBoardPiece(current, view, piece.id))}
                    />
                    <span>{piece.title}</span>
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
      </details>

      </details>
      <div ref={editorRef} className="report-composer__editor" tabIndex={-1} aria-label={selected === 'format' ? t('bookletFormat') : componentLabel(selected)}>
      {selected === 'format' ? <BookletSettings report={report} plan={plan} attackers={view.attackers} update={update} /> : selected === 'notes' ? <section className="report-composer__staff-notes" aria-label={t('bookletNotes')}>
        {staffNotes.map(note => <div key={note.id}>
          <label className="report-composer__notes">{note.title}<textarea rows={Math.min(12, Math.max(3, note.body.split('\n').length + 1))} value={note.body} onChange={event => update(current => ({...current, staffNoteEdits:{...current.staffNoteEdits,[note.id]:event.target.value}}))} /></label>
          {report.staffNoteEdits?.[note.id] !== undefined ? <button type="button" className="btn-secondary" onClick={() => update(current => {const edits={...current.staffNoteEdits};delete edits[note.id];return {...current,staffNoteEdits:edits};})}>{t('opponentReportBoardResetPiece')}</button> : null}
        </div>)}
        <label className="report-composer__notes">{t('opponentReportNotes')}<textarea rows={6} value={report.notes} placeholder={t('opponentReportNotesPlaceholder')} onChange={event => update(current => ({...current, notes:event.target.value}))} /></label>
      </section> : (
        <>
          {selected === 'setter' && view.setter.groups.length > 1 ? (
            <fieldset className="opponent-report__setter-charts">
              <legend>{t('setterChartsTitle')}</legend>
              <p className="opponent-report__hint">{t('setterChartsHelp')}</p>
              {rankSetterGroups(view.setter.groups).map((group) => (
                <label key={group.player.key}>
                  <input
                    type="checkbox"
                    checked={chartedSetterKeys(report.booklet, view.setter.groups).includes(group.player.key)}
                    onChange={(event) => update((current) => {
                      const chosen = new Set(chartedSetterKeys(current.booklet, view.setter.groups));
                      if (event.target.checked) chosen.add(group.player.key); else chosen.delete(group.player.key);
                      const setterChartKeys = rankSetterGroups(view.setter.groups).map((entry) => entry.player.key).filter((key) => chosen.has(key));
                      return { ...current, booklet: { ...DEFAULT_BOOKLET, ...current.booklet, setterChartKeys } };
                    })}
                  />
                  {playerLabel(group.player)} <small>{t('setterChartsTouches', { n: group.touches ?? group.attempts ?? 0 })}</small>
                </label>
              ))}
            </fieldset>
          ) : null}
          {selected === 'setter' ? (
            <SetterViewsEditor
              views={report.setterViews}
              receivers={view.reception.individual?.map((entry) => entry.player) ?? []}
              setterCallCodes={setterCallCodes}
              onChange={(nextViews) => update((current) => {
                const targetKeys = nextViews && nextViews.length > 0
                  ? expandSetterViews(nextViews, () => '', setterCallCodes).map((v) => v.id)
                  : ['positive', 'negative'];
                const setterPlayerKeys = view.setter.groups.map((g) => g.player.key);
                const nextSetterPieceIds = setterPlayerKeys.flatMap((playerKey) =>
                  targetKeys.map((bandKey) => `setter:${playerKey}:${bandKey}`),
                );
                let nextBoardPieceIds = current.boardPieceIds;
                if (nextBoardPieceIds) {
                  const nonSetter = nextBoardPieceIds.filter((id) => !id.startsWith('setter:'));
                  nextBoardPieceIds = [...nonSetter, ...nextSetterPieceIds];
                }
                return {
                  ...current,
                  setterViews: nextViews,
                  ...(nextBoardPieceIds ? { boardPieceIds: nextBoardPieceIds } : {}),
                };
              })}
            />
          ) : null}
          {selected === 'attackers' ? (
            <label className="opponent-report__direction-filter">
              {t('opponentReportDirectionsMinLabel')}
              <select
                value={report.attackDirectionMinPercent ?? 0}
                onChange={(event) => update((current) => ({ ...current, attackDirectionMinPercent: Number(event.target.value) || undefined }))}
              >
                {[0, 5, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>{value === 0 ? t('opponentReportDirectionsAll') : `${value}%`}</option>
                ))}
              </select>
            </label>
          ) : null}
          {selected === 'attackers' ? (
            <AttackerViewsEditor
              views={report.attackerViews}
              combinationCodes={attackCombinationCodes}
              onChange={(nextViews) => update((current) => {
                const attackerPlayerKeys = view.attackers.map((a) => a.player.key);
                const nextAttackerPieceIds = nextViews && nextViews.length > 0
                  ? expandAttackerViews(nextViews, () => '').flatMap((v) => attackerPlayerKeys.map((playerKey) => `attacker:${playerKey}:${v.id}`))
                  : attackerPlayerKeys.map((playerKey) => `attacker:${playerKey}`);
                let nextBoardPieceIds = current.boardPieceIds;
                if (nextBoardPieceIds) {
                  const nonAttacker = nextBoardPieceIds.filter((id) => !id.startsWith('attacker:'));
                  nextBoardPieceIds = [...nonAttacker, ...nextAttackerPieceIds];
                }
                return {
                  ...current,
                  attackerViews: nextViews,
                  ...(nextBoardPieceIds ? { boardPieceIds: nextBoardPieceIds } : {}),
                };
              })}
            />
          ) : null}
          {activePieces.length === 0 ? (
            <div className="opponent-report__board-empty">
              <p className="opponent-report__hint">{t('opponentReportBoardEmpty')}</p>
            </div>
          ) : (
            <div className="opponent-report__board-pieces">
          {(() => {
            // One turn for every court of every piece on this sheet, taken from the first court.
            const sheetCourts = activePieces
              .filter((piece) => piece.sheetId === selected)
              .flatMap((piece) => (piece.courts ?? (piece.court ? [piece.court] : [])).map((court) => ({ pieceId: piece.id, key: court.key })));
            if (sheetCourts.length < 2) return null;
            const first = sheetCourts[0];
            return (
              <div className="opponent-report__board-court-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  title={t('chartRotateAllHint')}
                  onClick={() => update((current) => {
                    const next = nextChartRotation(current.pieceEdits?.[first.pieceId]?.courtRotations?.[first.key]);
                    return [...new Set(sheetCourts.map((court) => court.pieceId))].reduce((report, pieceId) => updateBoardPieceEdit(report, pieceId, (prev) => {
                      const rotations: Record<string, 90 | 180 | 270> = {};
                      if (next) sheetCourts.filter((court) => court.pieceId === pieceId).forEach((court) => { rotations[court.key] = next; });
                      return { ...prev, courtRotations: rotations };
                    }), current);
                  })}
                >
                  ⟳ {t('chartRotateAll')}
                </button>
                {sheetCourts.some((court) => report.pieceEdits?.[court.pieceId]?.courtRotations?.[court.key]) ? (
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => update((current) => [...new Set(sheetCourts.map((court) => court.pieceId))].reduce(
                      (next, pieceId) => updateBoardPieceEdit(next, pieceId, (prev) => ({ ...prev, courtRotations: {} })),
                      current,
                    ))}
                  >
                    <ActionIcon name="undo" />{t('chartRotateResetAll')}
                  </button>
                ) : null}
              </div>
            );
          })()}
          {activePieces.filter(piece => piece.sheetId === selected).map((piece) => {
            const index = activePieces.findIndex(entry => entry.id === piece.id);
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
                  <details className="opponent-report__piece-menu">
                    <summary><ActionIcon name="manage" />{t('tacticalSheetActions')}</summary>
                    <div className="opponent-report__key-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={() => {
                      const id = newDrawingId();
                      update((current) => {
                        if (!piece.drawingId) return duplicateBoardPiece(current, view, piece.id, id, viewT);
                        const drawings = duplicateTacticalDrawing(current.drawings, piece.drawingId, id, piece.title);
                        const next = { ...current, drawings };
                        const ids = resolveBoardPieces(current, view, viewT).map((entry) => entry.id);
                        ids.splice(index + 1, 0, extraPieceId(id));
                        return { ...next, boardPieceIds: ids };
                      });
                    }}><ActionIcon name="copy" />{t('opponentReportDuplicate')}</button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={index === 0}
                      onClick={() => update((current) => moveBoardPiece(current, view, piece.id, -1))}
                      aria-label={t('opponentReportMoveUp')}
                    >
                      <ActionIcon name="up" />
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={index === activePieces.length - 1}
                      onClick={() => update((current) => moveBoardPiece(current, view, piece.id, 1))}
                      aria-label={t('opponentReportMoveDown')}
                    >
                      <ActionIcon name="down" />
                    </button>
                    {piece.isModified ? (
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => update((current) => resetBoardPieceEdit(current, piece.id))}
                      >
                        <ActionIcon name="undo" />{t('opponentReportBoardResetPiece')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      aria-label={t('opponentReportDelete')}
                      title={t('opponentReportDelete')}
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
                      <ActionIcon name="delete" />
                    </button>
                    </div>
                  </details>
                </header>

                {piece.id === PIECE_TEAM_STARTS ? (
                  <div className="opponent-report__team-chart-editor">
                    <svg
                      viewBox="0 0 380 180"
                      role="img"
                      aria-label={piece.title}
                      // Built from escaped text only, the same drawing as the printed page.
                      dangerouslySetInnerHTML={{ __html: teamStartsElements(0, 0, 380, 180, piece, view.team, edit?.chartColors, viewT) }}
                    />
                    <div className="opponent-report__team-chart-colors">
                      {(['bar', 'highlight'] as const).map((key) => (
                        <label key={key}>
                          <span>{t(key === 'bar' ? 'teamChartColorBar' : 'teamChartColorHighlight')}</span>
                          <input
                            type="color"
                            value={edit?.chartColors?.[key] ?? (key === 'bar' ? TEAM_CHART_BAR : TEAM_CHART_HIGHLIGHT)}
                            onChange={(event) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                              ...prev,
                              chartColors: { ...prev.chartColors, [key]: event.target.value },
                            })))}
                          />
                        </label>
                      ))}
                      {edit?.chartColors ? (
                        <button type="button" className="btn-secondary btn-small" onClick={() => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => {
                          const next = { ...prev };
                          delete next.chartColors;
                          return next;
                        }))}>
                          <ActionIcon name="undo" />{t('opponentReportBoardResetPiece')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {piece.subtitle !== undefined && piece.id === PIECE_TEAM_STARTS ? (
                  <textarea
                    className="opponent-report__board-piece-subtitle"
                    rows={2}
                    value={piece.subtitle}
                    onChange={(event) => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                      ...prev,
                      subtitle: event.target.value,
                    })))}
                  />
                ) : piece.subtitle !== undefined ? (
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

                {piece.id === 'reception:serve-targets' ? (
                  <label className="opponent-report__board-toggle">
                    <input
                      type="checkbox"
                      checked={report.showServeTargetNames !== false}
                      onChange={(event) => update((current) => ({ ...current, showServeTargetNames: event.target.checked }))}
                    />
                    <span>{t('serveTargetShowNames')}</span>
                  </label>
                ) : null}

                {piece.kind === 'ordered-list' && piece.id === 'keys:main' ? <ReportPriorities report={report} suggestions={suggestions} viewT={viewT} update={update} /> : null}
                {piece.id === 'keys:main' && view.overview.teamIndicators.rows.length > 0 ? (
                  <section className="opponent-report__team-indicators">
                    <h4>{viewT('opponentReportTeamIndicators')}</h4>
                    <ViewTableView table={view.overview.teamIndicators} />
                  </section>
                ) : null}
                {piece.kind === 'ordered-list' && piece.id !== 'keys:main' ? (
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
                  <>
                    <div className="opponent-report__setter-courts">
                      {piece.courts.map((court) => renderCourtBlock(piece, court))}
                    </div>
                    {piece.id === 'reception:serve-targets' ? (() => {
                      const drawings = piece.courts.map((court) => court.drawing);
                      return (
                        <div
                          className="opponent-report__serve-targets-legend"
                          // Safe SVG built from escaped translation strings.
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{
                            __html: buildServeTargetsLegendSvg(
                              {
                                good: t('serveTargetLegendGood'),
                                mid: t('serveTargetLegendMid'),
                                weak: t('serveTargetLegendWeak'),
                                none: t('serveTargetLegendNone'),
                                setter: t('serveTargetLegendSetter'),
                                target: t('serveTargetLegendTarget'),
                                zone: t('serveTargetLegendZone'),
                                move: t('serveTargetLegendMove'),
                                courtNote: t('serveTargetLegendCourt'),
                              },
                              piece.courts.some((court) => drawingHasMoveArrows(court.drawing)),
                              {
                                moveColor: findMoveArrowColor(drawings),
                                customEntries: collectCustomLegendEntries(drawings),
                              },
                            ),
                          }}
                        />
                      );
                    })() : null}
                  </>
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

                {piece.kind === 'player-card' && !piece.videoLink ? <p className="opponent-report__hint">{t('tacticalNoVideo')}</p> : null}
                {piece.videoLink ? (
                  <p className="opponent-report__video-link">
                    <a href={piece.videoLink.url} target="_blank" rel="noopener noreferrer">
                      {t(videoLinkWatchKey(piece.videoLink) as Parameters<typeof t>[0])}
                    </a>
                    <span> · {t('tacticalVideoCoverage', { available: piece.videoLink.actions ?? piece.videoLink.clips, total: piece.videoLink.totalActions ?? piece.videoLink.clips })}</span>
                    <small>{t('opponentReportVideoLink', { date: new Date(piece.videoLink.expiresAt).toLocaleDateString() })}</small>
                  </p>
                ) : null}
                {piece.kind === 'extra-sheet' && piece.drawing && piece.drawingId ? (
                  <div>
                    <div className="opponent-report__court" dangerouslySetInnerHTML={{ __html: piece.court?.svg ?? '' }} />
                    <div className="opponent-report__board-court-actions">
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => setEditingCourtTarget({
                          kind: 'extra-drawing',
                          pieceId: piece.id,
                          drawingId: piece.drawingId!,
                          title: piece.title,
                        })}
                      >
                        <ActionIcon name="edit" />{t('opponentReportBoardEditSvg')}
                      </button>
                    </div>
                  </div>
                ) : null}

                {piece.id !== 'reception:serve-targets'
                  && !(piece.kind === 'player-card' && (piece.sheetId === 'attackers' || piece.sheetId === 'serve'))
                  ? (() => {
                    const pieceCustomLegend = collectCustomLegendEntries([
                      piece.drawing,
                      piece.court?.drawing,
                      ...(piece.courts ?? []).map((c) => c.drawing),
                    ]);
                    return pieceCustomLegend.length > 0 ? (
                      <div
                        className="opponent-report__serve-targets-legend"
                        // Safe SVG built from escaped legend strings.
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: buildCustomLegendSvg(pieceCustomLegend) }}
                      />
                    ) : null;
                  })()
                  : null}

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
          {selected === 'attackers' ? (() => {
            const attackerPieces = activePieces.filter((piece) => piece.sheetId === 'attackers' && piece.court);
            if (!attackerPieces.length) return null;
            const attackerDrawings = attackerPieces.map((piece) => piece.court?.drawing);
            return (
              <div
                className="opponent-report__serve-targets-legend"
                // Safe SVG built from escaped translation strings.
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: buildAttackDefenseLegendSvg(
                    {
                      primary: t('attackDefenseLegendPrimary'),
                      other: t('attackDefenseLegendOther'),
                      scoring: t('attackDefenseLegendScoring'),
                      move: t('serveTargetLegendMove'),
                      courtNote: t('attackDefenseLegendCourt'),
                    },
                    {
                      drawings: attackerDrawings,
                      customEntries: collectCustomLegendEntries(attackerDrawings),
                    },
                  ),
                }}
              />
            );
          })() : null}
          {selected === 'serve' ? (() => {
            const servePieces = activePieces.filter((piece) => piece.sheetId === 'serve' && piece.court);
            if (!servePieces.length) return null;
            const serveDrawings = servePieces.map((piece) => piece.court?.drawing);
            return (
              <div
                className="opponent-report__serve-targets-legend"
                // Safe SVG built from escaped translation strings.
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: buildServeHowLegendSvg(
                    {
                      heat: t('serveHowLegendHeat'),
                      routes: t('serveHowLegendRoutes'),
                      ace: t('serveHowLegendAce'),
                      move: t('serveTargetLegendMove'),
                    },
                    {
                      drawings: serveDrawings,
                      customEntries: collectCustomLegendEntries(serveDrawings),
                    },
                  ),
                }}
              />
            );
          })() : null}
        </div>
          )}
        </>
      )}
      </div>
      </div>
      {editingCourtTarget ? (() => {
        const piece = activePieces.find((item) => item.id === editingCourtTarget.pieceId) ?? catalog.get(editingCourtTarget.pieceId);
        if (!piece) return null;
        const drawing = editingCourtTarget.kind === 'piece-court'
          ? openPieceCourtForEditing(piece, editingCourtTarget.courtKey)
          : piece.drawing ?? null;
        if (!drawing) return null;
        const hasCustomDrawing = editingCourtTarget.kind === 'piece-court' && Boolean(report.pieceEdits?.[piece.id]?.courtDrawings?.[editingCourtTarget.courtKey]);
        return (
          <Modal className="opponent-report__editor-modal-backdrop" ariaLabel={editingCourtTarget.title} onClose={() => setEditingCourtTarget(null)}>
            <div className="opponent-report__editor-modal">
              <div className="opponent-report__editor-modal-header">
                <h3>{editingCourtTarget.title}</h3>
                <button type="button" className="btn-secondary btn-small" onClick={() => setEditingCourtTarget(null)}>
                  {t('opponentReportBoardCloseSvg')}
                </button>
              </div>
              <div className="opponent-report__editor-modal-body">
                <InteractiveCourtSvgEditor
                  drawing={drawing}
                  rosterPlayers={rosterPlayers}
                  opponentTeamName={report.opponent.name}
                  ownTeamName={report.ownTeam?.name}
                  allowLayoutChange={editingCourtTarget.kind === 'extra-drawing'}
                  rotation={editingCourtTarget.kind === 'piece-court'
                    ? report.pieceEdits?.[piece.id]?.courtRotations?.[editingCourtTarget.courtKey]
                    : undefined}
                  onOpenHeatmapGrid={editingCourtTarget.kind === 'piece-court' && editingCourtTarget.pieceId.startsWith('serve:')
                    ? () => setEditingHeatmapPieceId(editingCourtTarget.pieceId)
                    : undefined}
                  onChange={(nextDrawing) => {
                    if (editingCourtTarget.kind === 'piece-court') {
                      update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
                        ...prev,
                        courtDrawings: {
                          ...(prev.courtDrawings ?? {}),
                          [editingCourtTarget.courtKey]: nextDrawing,
                        },
                      })));
                    } else {
                      update((current) => ({
                        ...current,
                        drawings: updateTacticalDrawing(current.drawings ?? [], editingCourtTarget.drawingId, () => nextDrawing),
                      }));
                    }
                  }}
                  onReset={hasCustomDrawing ? () => {
                    update((current) => updateBoardPieceEdit(current, piece.id, (prev) => {
                      const nextDrawings = { ...(prev.courtDrawings ?? {}) };
                      delete nextDrawings[editingCourtTarget.courtKey];
                      return { ...prev, courtDrawings: nextDrawings };
                    }));
                    setEditingCourtTarget(null);
                  } : undefined}
                  onClose={() => setEditingCourtTarget(null)}
                />
              </div>
            </div>
          </Modal>
        );
      })() : null}
      {editingHeatmapPieceId ? (() => {
        const piece = activePieces.find((item) => item.id === editingHeatmapPieceId) ?? catalog.get(editingHeatmapPieceId);
        const rawSvg = piece?.court?.rawSvg;
        if (!piece || !rawSvg) return null;
        const strips = parseServeHeatmapStrips(rawSvg);
        const heatmapEdits = report.pieceEdits?.[piece.id]?.serveHeatmapEdits ?? {};
        const hasEdits = Object.keys(heatmapEdits).length > 0;
        const updateCell = (key: string, next: { visible: boolean; percent?: number | null }) => {
          update((current) => updateBoardPieceEdit(current, piece.id, (prev) => ({
            ...prev,
            serveHeatmapEdits: { ...(prev.serveHeatmapEdits ?? {}), [key]: next },
          })));
        };
        return (
          <Modal className="opponent-report__editor-modal-backdrop" ariaLabel={`${piece.title} · ${t('serveHeatmapEdit')}`} onClose={() => setEditingHeatmapPieceId(null)}>
            <div className="opponent-report__heatmap-modal">
              <div className="opponent-report__editor-modal-header">
                <h3>{piece.title} · {t('serveHeatmapEdit')}</h3>
                <div className="opponent-report__heatmap-modal-actions">
                  {hasEdits ? (
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => update((current) => updateBoardPieceEdit(current, piece.id, (prev) => {
                        const next = { ...prev };
                        delete next.serveHeatmapEdits;
                        return next;
                      }))}
                    >
                      {t('opponentReportBoardResetSvg')}
                    </button>
                  ) : null}
                  <button type="button" className="btn-secondary btn-small" onClick={() => setEditingHeatmapPieceId(null)}>
                    {t('opponentReportBoardCloseSvg')}
                  </button>
                </div>
              </div>
              <div className="opponent-report__heatmap-modal-body">
                {strips.map((strip) => (
                  <div key={strip.index} className="opponent-report__heatmap-strip">
                    <h4>{strip.heading}</h4>
                    <table className="opponent-report__heatmap-grid">
                      <tbody>
                        {SERVE_HEATMAP_GRID_ROWS.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((zone) => {
                              const key = `${strip.index}:${zone}`;
                              const cellEdit = heatmapEdits[key];
                              const visible = cellEdit?.visible ?? true;
                              const pct = cellEdit?.percent ?? strip.pcts[zone] ?? 0;
                              return (
                                <td key={zone} className={visible ? '' : 'is-hidden'}>
                                  <label className="opponent-report__heatmap-cell-toggle">
                                    <input
                                      type="checkbox"
                                      checked={visible}
                                      onChange={(event) => updateCell(key, { visible: event.target.checked, percent: cellEdit?.percent ?? strip.pcts[zone] ?? 0 })}
                                    />
                                    <span>Z{zone}</span>
                                  </label>
                                  <div className="opponent-report__heatmap-cell-value">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={1}
                                      disabled={!visible}
                                      aria-label={`Z${zone} %`}
                                      value={pct}
                                      onChange={(event) => updateCell(key, { visible, percent: Number(event.target.value) })}
                                    />
                                    <span>%</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          </Modal>
        );
      })() : null}
    </section>
  );
}
