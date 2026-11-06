import { useMemo, useState } from 'react';
import { ActionIcon } from '@src/components/ActionIcon';
import { useTranslation } from '@src/i18n';
import type {
  OpponentReport,
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
import type { ReportPlayer } from '../model/report-metrics';
import { playerLabel } from '../model/report-keys';
import { formatViewCell, type ReportView, type ViewT, type ViewTable } from '../model/report-view';
import { addTacticalDrawing, createTacticalDrawing, duplicateTacticalDrawing, removeTacticalDrawing, updateTacticalDrawing } from '../model/tactical-board';

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
                <ActionIcon name="edit" />{t('opponentReportBoardEditSvg')}
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
                  <ActionIcon name="undo" />{t('opponentReportBoardResetSvg')}
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
      <details className="opponent-report__sheets-config">
        <summary><ActionIcon name="manage" />{t('tacticalManageSheets')}</summary>
        <p className="opponent-report__hint">{t('tacticalManageSheetsHelp')}</p>
        <button type="button" className="btn-secondary" onClick={handleAddExtraSheet}><ActionIcon name="add" />{t('opponentReportBoardAddExtraSheet')}</button>
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

                {piece.kind === 'player-card' && piece.sheetId !== 'serve' && !piece.videoLink ? <p className="opponent-report__hint">{t('tacticalNoVideo')}</p> : null}
                {piece.videoLink ? (
                  <p className="opponent-report__video-link">
                    <a href={piece.videoLink.url} target="_blank" rel="noopener noreferrer">
                      {t(piece.videoLink.skill === 'receive' ? 'tacticalWatchReception' : 'tacticalWatchAttack')}
                    </a>
                    <span> · {t('tacticalVideoCoverage', { available: piece.videoLink.actions ?? piece.videoLink.clips, total: piece.videoLink.totalActions ?? piece.videoLink.clips })}</span>
                    <small>{t('opponentReportVideoLink', { date: new Date(piece.videoLink.expiresAt).toLocaleDateString() })}</small>
                  </p>
                ) : null}
                {piece.kind === 'extra-sheet' && piece.drawing && piece.drawingId ? (
                  <div>
                    <div className="opponent-report__court" dangerouslySetInnerHTML={{ __html: piece.court?.svg ?? '' }} />
                  <details>
                    <summary><ActionIcon name="edit" />{t('opponentReportBoardEditSvg')}</summary>
                  <InteractiveCourtSvgEditor
                    drawing={piece.drawing}
                    rosterPlayers={rosterPlayers}
                    allowLayoutChange
                    onChange={(nextDrawing) => update((current) => ({
                      ...current,
                      drawings: updateTacticalDrawing(current.drawings ?? [], piece.drawingId!, () => nextDrawing),
                    }))}
                  />
                  </details>
                  </div>
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
