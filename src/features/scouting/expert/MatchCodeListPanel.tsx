import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchEvent } from '@src/domain/events/types';
import type { Player } from '@src/domain/roster/types';
import type { PointNote } from '@src/domain/video/types';
import { getPointNoteTagLabelKey } from '../components/PointNoteModal';
import { buildDataVolleyTouchCode } from '../model/datavolley-code';
import { parseDataVolleyInput, parseSingleCode } from './code-parser';
import {
  checkInsertedCodeRallyFit,
  deleteTouchFromEventLog,
  insertCodeInEventLog,
  resolveCodeListInsertionContext,
} from './code-list-mutations';
import { shouldAllowAutoFocusForInput } from './mobile-input-focus';
import './match-code-list-panel.css';

type DvwRow = {
  id: string;
  code: string;
  kind: 'touch' | 'auto' | 'note';
  touchId?: string;
  note?: PointNote;
  eventIndex?: number;
  videoTimeSeconds?: number;
  isRallyEnd: boolean;
  setNumber: number;
  rallyNumber: number;
};

interface MatchCodeListPanelProps {
  eventLog: readonly MatchEvent[];
  homePlayers: Player[];
  awayPlayers: Player[];
  notes?: readonly PointNote[];
  onEditNote?: (note: PointNote) => void;
  onDeleteNote?: (noteId: string) => void;
  onJumpToVideo?: (seconds: number) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  onReplaceEvents?: (events: MatchEvent[]) => boolean;
}

function padTwo(n: number | undefined): string {
  if (n === undefined) return '00';
  return String(n).padStart(2, '0');
}

function getJerseyFor(players: Player[], playerId: string | undefined): number | undefined {
  if (!playerId) return undefined;
  return players.find((p) => p.id === playerId)?.jerseyNumber;
}

function buildLiveDvwRows(
  eventLog: readonly MatchEvent[],
  homePlayers: Player[],
  awayPlayers: Player[],
  notes: readonly PointNote[],
  formatTag: (note: PointNote) => string,
): DvwRow[] {
  const rows: DvwRow[] = [];
  let homeScore = 0;
  let awayScore = 0;
  let lastPointRowIndex = -1;
  let rowCounter = 0;

  const nextId = (eventIndex: number) => `r${rowCounter++}-e${eventIndex}`;
  const notesByTouchId = new Map<string, PointNote[]>();
  const rallyNotesByKey = new Map<string, PointNote[]>();
  const placedNoteIds = new Set<string>();

  for (const note of notes) {
    if (note.touchId) {
      const list = notesByTouchId.get(note.touchId) ?? [];
      list.push(note);
      notesByTouchId.set(note.touchId, list);
    } else {
      const key = `${note.setNumber}:${note.rallyNumber}`;
      const list = rallyNotesByKey.get(key) ?? [];
      list.push(note);
      rallyNotesByKey.set(key, list);
    }
  }

  const pushNoteRow = (note: PointNote) => {
    placedNoteIds.add(note.id);
    rows.push({
      id: `note-${note.id}`,
      code: formatTag(note),
      kind: 'note',
      note,
      videoTimeSeconds: note.videoTimeSeconds,
      isRallyEnd: false,
      setNumber: note.setNumber,
      rallyNumber: note.rallyNumber,
    });
  };

  eventLog.forEach((event, eventIndex) => {
    if (event.type === 'set_started') {
      homeScore = 0;
      awayScore = 0;
      const { setNumber } = event;

      const homeSetterPos = event.homeLineup.slots.find(
        (s) => s.playerId === event.homeLineup.setterPlayerId,
      )?.courtPosition ?? 5;
      const awaySetterPos = event.awayLineup.slots.find(
        (s) => s.playerId === event.awayLineup.setterPlayerId,
      )?.courtPosition ?? 5;

      const homeCaptainJersey = homePlayers.find((p) => p.isCaptain)?.jerseyNumber
        ?? getJerseyFor(homePlayers, event.homeLineup.slots[0]?.playerId) ?? 0;
      const awayCaptainJersey = awayPlayers.find((p) => p.isCaptain)?.jerseyNumber
        ?? getJerseyFor(awayPlayers, event.awayLineup.slots[0]?.playerId) ?? 0;

      rows.push({ id: nextId(eventIndex), code: `*P${padTwo(homeCaptainJersey)}>LUp`, kind: 'auto', eventIndex, isRallyEnd: false, setNumber, rallyNumber: 0 });
      rows.push({ id: nextId(eventIndex), code: `*z${homeSetterPos}>LUp`, kind: 'auto', eventIndex, isRallyEnd: false, setNumber, rallyNumber: 0 });
      rows.push({ id: nextId(eventIndex), code: `aP${padTwo(awayCaptainJersey)}>LUp`, kind: 'auto', eventIndex, isRallyEnd: false, setNumber, rallyNumber: 0 });
      rows.push({ id: nextId(eventIndex), code: `az${awaySetterPos}>LUp`, kind: 'auto', eventIndex, isRallyEnd: false, setNumber, rallyNumber: 0 });
      return;
    }

    if (event.type === 'touch_recorded') {
      const { touch } = event;
      const players = touch.teamSide === 'home' ? homePlayers : awayPlayers;
      const jerseyNumber = getJerseyFor(players, touch.playerId);
      const code = buildDataVolleyTouchCode({ touch, jerseyNumber });
      rows.push({
        id: nextId(eventIndex),
        code,
        kind: 'touch',
        touchId: touch.id,
        eventIndex,
        videoTimeSeconds: typeof touch.videoTimeSeconds === 'number' && Number.isFinite(touch.videoTimeSeconds)
          ? touch.videoTimeSeconds
          : undefined,
        isRallyEnd: false,
        setNumber: touch.setNumber,
        rallyNumber: touch.rallyNumber ?? 0,
      });
      const touchNotes = notesByTouchId.get(touch.id);
      if (touchNotes) touchNotes.forEach(pushNoteRow);
      return;
    }

    if (event.type === 'point_awarded') {
      if (event.teamSide === 'home') homeScore += 1;
      else awayScore += 1;
      const marker = event.teamSide === 'home' ? '*' : 'a';
      const code = `${marker}p${padTwo(homeScore)}:${padTwo(awayScore)}`;
      lastPointRowIndex = rows.length;
      rows.push({ id: nextId(eventIndex), code, kind: 'auto', eventIndex, isRallyEnd: false, setNumber: event.setNumber, rallyNumber: event.rallyNumber });
      return;
    }

    if (event.type === 'manual_correction'
      && (event.correction === 'point_added' || event.correction === 'point_removed')) {
      const delta = event.correction === 'point_added' ? 1 : -1;
      if (event.teamSide === 'home') homeScore = Math.max(0, homeScore + delta);
      else awayScore = Math.max(0, awayScore + delta);
      const marker = event.teamSide === 'home' ? '*' : 'a';
      rows.push({ id: nextId(eventIndex), code: `${marker}p${padTwo(homeScore)}:${padTwo(awayScore)}`, kind: 'auto', isRallyEnd: false, setNumber: event.setNumber, rallyNumber: event.rallyNumber });
      return;
    }

    if (event.type === 'rally_ended') {
      const rallyNotes = rallyNotesByKey.get(`${event.setNumber}:${event.rallyNumber}`);
      if (rallyNotes) rallyNotes.forEach(pushNoteRow);
      if (lastPointRowIndex >= 0 && lastPointRowIndex < rows.length) {
        rows[lastPointRowIndex] = { ...rows[lastPointRowIndex], isRallyEnd: true };
      }
      lastPointRowIndex = -1;
      return;
    }

    if (event.type === 'substitution_made') {
      const players = event.teamSide === 'home' ? homePlayers : awayPlayers;
      const outJersey = getJerseyFor(players, event.playerOutId);
      const inJersey = getJerseyFor(players, event.playerInId);
      if (outJersey && inJersey) {
        const marker = event.teamSide === 'home' ? '*' : 'a';
        rows.push({
          id: nextId(eventIndex),
          code: `${marker}c${padTwo(outJersey)}:${padTwo(inJersey)}`,
          kind: 'auto',
          isRallyEnd: false,
          setNumber: event.setNumber,
          rallyNumber: event.rallyNumber ?? 0,
        });
      }
      return;
    }

    if (event.type === 'timeout_called') {
      const marker = event.teamSide === 'home' ? '*' : 'a';
      rows.push({ id: nextId(eventIndex), code: `${marker}T`, kind: 'auto', isRallyEnd: false, setNumber: event.setNumber, rallyNumber: event.rallyNumber ?? 0 });
      return;
    }

    if (event.type === 'set_ended') {
      rows.push({ id: nextId(eventIndex), code: `**${event.setNumber}set`, kind: 'auto', isRallyEnd: true, setNumber: event.setNumber, rallyNumber: 0 });
    }
  });

  // Notes for an in-progress rally (or whose touch is not yet in eventLog) sit at the end.
  for (const note of notes) {
    if (!placedNoteIds.has(note.id)) {
      pushNoteRow(note);
    }
  }

  return rows;
}

// Next step (out of scope here): DataVolley guided mask ("Maschera Guidata")
// and button-based Click&Scout editing.
export function MatchCodeListPanel({
  eventLog,
  homePlayers,
  awayPlayers,
  notes = [],
  onEditNote,
  onDeleteNote,
  onJumpToVideo,
  isCollapsed = false,
  onToggleCollapsed,
  onReplaceEvents,
}: MatchCodeListPanelProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [insertState, setInsertState] = useState<{
    targetEventIndex: number | null;
    targetCode: string | null;
    draft: string;
    error: string | null;
  } | null>(null);

  const rows = useMemo(
    () => buildLiveDvwRows(eventLog, homePlayers, awayPlayers, notes, (note) => {
      const tagLabels = note.tags.map((tag) => t(getPointNoteTagLabelKey(tag))).join(', ');
      const body = [tagLabels, note.text].filter(Boolean).join(' - ');
      return `# ${body || t('pointNoteButton')}`;
    }),
    [eventLog, homePlayers, awayPlayers, notes, t],
  );

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedRowId) ?? null,
    [rows, selectedRowId],
  );

  // Auto-scroll to bottom when new rows arrive (only if not editing/inserting/selecting)
  useEffect(() => {
    if (!editingRowId && !insertState && !selectedRowId && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [rows.length, editingRowId, insertState, selectedRowId]);

  const startEdit = (row: DvwRow) => {
    if (row.kind !== 'touch' || !onReplaceEvents) return;
    setSelectedRowId(row.id);
    setEditingRowId(row.id);
    setEditValue(row.code);
  };

  const openInsertDialog = (row: DvwRow | null) => {
    if (!onReplaceEvents) return;
    setInsertState({
      targetEventIndex: row?.eventIndex ?? null,
      targetCode: row ? row.code : null,
      draft: '',
      error: null,
    });
  };

  const handleDeleteRow = (row: DvwRow) => {
    if (row.kind !== 'touch' || row.eventIndex === undefined || !onReplaceEvents) return;
    if (!window.confirm(t('codeListDeleteConfirm', { code: row.code }))) return;
    const nextLog = deleteTouchFromEventLog(eventLog, row.eventIndex);
    if (onReplaceEvents(nextLog)) {
      setSelectedRowId(null);
      cancelEdit();
    }
  };

  const parsedInsert = useMemo(
    () => (insertState && insertState.draft.trim() ? parseSingleCode(insertState.draft.trim()) : null),
    [insertState],
  );

  const insertFitWarning = useMemo(() => {
    if (!insertState || !parsedInsert?.valid) return null;
    const context = resolveCodeListInsertionContext(eventLog, insertState.targetEventIndex);
    return checkInsertedCodeRallyFit(eventLog, context, parsedInsert);
  }, [eventLog, insertState, parsedInsert]);

  const commitInsert = () => {
    if (!insertState || !onReplaceEvents) return;
    const trimmed = insertState.draft.trim();
    if (!trimmed) {
      setInsertState({ ...insertState, error: t('expertModeCodePlaceholder', { defaultValue: 'Enter a DataVolley code' }) });
      return;
    }
    const parsed = parseSingleCode(trimmed);
    if (!parsed.valid || parsed.isAutomatic || !parsed.skill) {
      setInsertState({
        ...insertState,
        error: parsed.error ?? 'Invalid DataVolley code',
      });
      return;
    }
    const nextLog = insertCodeInEventLog({
      eventLog,
      targetEventIndex: insertState.targetEventIndex,
      parsed,
      homePlayers,
      awayPlayers,
    });
    if (onReplaceEvents(nextLog)) {
      setInsertState(null);
    }
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditValue('');
  };

  const commitEdit = (row: DvwRow) => {
    if (!onReplaceEvents || row.eventIndex === undefined) {
      cancelEdit();
      return;
    }

    const targetEvent = eventLog[row.eventIndex];
    if (!targetEvent || targetEvent.type !== 'touch_recorded') {
      cancelEdit();
      return;
    }

    const trimmed = editValue.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }

    const parsed = parseDataVolleyInput(trimmed, {});
    const validCode = parsed.find((p) => p.valid && !p.isAutomatic && p.skill);
    if (!validCode) {
      cancelEdit();
      return;
    }

    const originalTouch = targetEvent.touch;
    const players = (validCode.teamSide === 'home' ? homePlayers : awayPlayers);
    const player = validCode.jerseyNumber
      ? players.find((p) => p.jerseyNumber === validCode.jerseyNumber)
      : undefined;

    const newTouch = {
      ...originalTouch,
      ...(validCode.teamSide ? { teamSide: validCode.teamSide } : {}),
      ...(player ? { playerId: player.id } : {}),
      ...(validCode.skill ? { skill: validCode.skill } : {}),
      ...(validCode.evaluation !== undefined ? { evaluation: validCode.evaluation } : {}),
      ...(validCode.skillType !== undefined ? { skillTypeCode: validCode.skillType } : {}),
      ...(validCode.startZone !== undefined ? { startZoneCode: validCode.startZone } : {}),
      ...(validCode.endZone !== undefined ? { endZoneCode: validCode.endZone } : {}),
    };

    const newEventLog = eventLog.map((ev, idx) =>
      idx === row.eventIndex ? { ...(ev as Extract<MatchEvent, { type: 'touch_recorded' }>), touch: newTouch } : ev,
    );

    onReplaceEvents(newEventLog as MatchEvent[]);
    cancelEdit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, row: DvwRow) => {
    if (event.key === 'Enter') commitEdit(row);
    if (event.key === 'Escape') cancelEdit();
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (editingRowId || insertState || !onReplaceEvents) return;
    const selectableRows = rows.filter((row) => row.kind !== 'note' && row.eventIndex !== undefined);
    if (event.key === 'Insert') {
      event.preventDefault();
      openInsertDialog(selectedRow && selectedRow.eventIndex !== undefined ? selectedRow : null);
      return;
    }
    if (!selectedRow) return;
    if (event.key === 'Enter' && selectedRow.kind === 'touch') {
      event.preventDefault();
      startEdit(selectedRow);
    } else if (event.key === 'Delete' && selectedRow.kind === 'touch') {
      event.preventDefault();
      handleDeleteRow(selectedRow);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (selectableRows.length === 0) return;
      event.preventDefault();
      const currentIdx = selectableRows.findIndex((r) => r.id === selectedRow.id);
      const nextIdx = event.key === 'ArrowDown'
        ? Math.min(selectableRows.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx - 1);
      setSelectedRowId(selectableRows[nextIdx].id);
    }
  };

  return (
    <aside
      className={['match-code-list-panel', isCollapsed ? 'match-code-list-panel--collapsed' : ''].filter(Boolean).join(' ')}
      aria-label={t('codeList', { defaultValue: 'Code list' })}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="match-code-list-panel__header">
        {!isCollapsed && (
          <span className="match-code-list-panel__title">
            {t('codeList', { defaultValue: 'DVW' })}
          </span>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            className="match-code-list-panel__toggle-btn"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed
              ? t('expertModeExpandPanel', { defaultValue: 'Expand code panel' })
              : t('expertModeCollapsePanel', { defaultValue: 'Collapse code panel' })}
          >
            {isCollapsed ? '▶' : '◀'}
          </button>
        )}
      </div>

      {!isCollapsed && onReplaceEvents && (
        <div className="match-code-list-panel__toolbar">
          {selectedRow && selectedRow.kind !== 'note' ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-small match-code-list-panel__action-btn"
                onClick={() => openInsertDialog(selectedRow)}
                disabled={selectedRow.eventIndex === undefined}
                title="Ins"
              >
                {t('codeListInsert')}
              </button>
              {selectedRow.kind === 'touch' ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary btn-small match-code-list-panel__action-btn"
                    onClick={() => startEdit(selectedRow)}
                    title="Enter"
                  >
                    {t('codeListEdit')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small match-code-list-panel__action-btn match-code-list-panel__action-btn--danger"
                    onClick={() => handleDeleteRow(selectedRow)}
                    title="Del"
                  >
                    {t('codeListDelete')}
                  </button>
                </>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-small match-code-list-panel__action-btn match-code-list-panel__action-btn--end"
            onClick={() => openInsertDialog(null)}
          >
            {t('codeListAddEnd')}
          </button>
        </div>
      )}

      {!isCollapsed && (
        <div className="match-code-list-panel__body">
          {rows.length === 0 ? (
            <div className="match-code-list-panel__empty">
              {t('expertModeNoRallyCodes', { defaultValue: 'No codes yet' })}
            </div>
          ) : (
            rows.map((row) => {
              const isEditing = editingRowId === row.id;
              const isSelected = selectedRowId === row.id;
              const rowClass = [
                'match-code-list-panel__row',
                row.kind === 'touch'
                  ? 'match-code-list-panel__row--touch'
                  : row.kind === 'note'
                    ? 'match-code-list-panel__row--note'
                    : 'match-code-list-panel__row--auto',
                row.isRallyEnd ? 'match-code-list-panel__row--rally-end' : '',
                isSelected ? 'match-code-list-panel__row--selected' : '',
                isEditing ? 'match-code-list-panel__row--editing' : '',
              ].filter(Boolean).join(' ');

              if (row.kind === 'note' && row.note) {
                const note = row.note;
                return (
                  <div key={row.id} className={rowClass}>
                    <button
                      type="button"
                      className="match-code-list-panel__code-btn match-code-list-panel__note-btn"
                      onClick={() => onEditNote?.(note)}
                      disabled={!onEditNote}
                      title={t('pointNoteEditTitle')}
                    >
                      {row.code}
                    </button>
                    {onJumpToVideo && row.videoTimeSeconds !== undefined ? (
                      <button
                        type="button"
                        className="match-code-list-panel__video-btn"
                        onClick={() => onJumpToVideo(row.videoTimeSeconds!)}
                        aria-label={t('pointNoteOpenVideo')}
                        title={t('pointNoteOpenVideo')}
                      >
                        ▶
                      </button>
                    ) : null}
                    {onDeleteNote ? (
                      <button
                        type="button"
                        className="match-code-list-panel__note-delete"
                        onClick={() => onDeleteNote(note.id)}
                        aria-label={t('pointNoteDelete')}
                        title={t('pointNoteDelete')}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              }

              return (
                <div key={row.id} className={rowClass}>
                  {isEditing ? (
                    <input
                      className="match-code-list-panel__edit-input"
                      value={editValue}
                      autoFocus={shouldAllowAutoFocusForInput()}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, row)}
                      onBlur={() => commitEdit(row)}
                      aria-label={t('expertModeCodeInput', { defaultValue: 'Edit code' })}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="match-code-list-panel__code-btn"
                        onClick={() => {
                          if (row.eventIndex === undefined) return;
                          if (isSelected && row.kind === 'touch') {
                            startEdit(row);
                          } else {
                            setSelectedRowId(row.id);
                          }
                        }}
                        disabled={row.eventIndex === undefined || !onReplaceEvents}
                      >
                        {row.code}
                      </button>
                      {onJumpToVideo && row.videoTimeSeconds !== undefined ? (
                        <button
                          type="button"
                          className="match-code-list-panel__video-btn"
                          onClick={() => onJumpToVideo(row.videoTimeSeconds!)}
                          aria-label={t('pointNoteOpenVideo')}
                          title={t('pointNoteOpenVideo')}
                        >
                          ▶
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {insertState ? (
        <div className="match-code-list-panel__insert-backdrop" role="presentation" onClick={() => setInsertState(null)}>
          <div
            className="match-code-list-panel__insert-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('codeListInsertTitle')}
            onClick={(e) => e.stopPropagation()}
          >
            <h4>{t('codeListInsertTitle')}</h4>
            <p className="match-code-list-panel__insert-hint">
              {insertState.targetCode
                ? t('codeListInsertBeforeHint', { code: insertState.targetCode })
                : t('codeListAddEndHint')}
            </p>
            <input
              type="text"
              className="match-code-list-panel__insert-input"
              value={insertState.draft}
              autoFocus={shouldAllowAutoFocusForInput()}
              placeholder={t('expertModeCodePlaceholder', { defaultValue: '*7SQ+' })}
              onChange={(e) => setInsertState({ ...insertState, draft: e.target.value, error: null })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitInsert();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setInsertState(null);
                }
              }}
            />
            {insertState.error ? (
              <p className="match-code-list-panel__insert-error" role="alert">{insertState.error}</p>
            ) : null}
            {insertFitWarning === 'second_serve' ? (
              <p className="match-code-list-panel__insert-warning" role="status">{t('codeListSecondServeWarning')}</p>
            ) : null}
            <div className="match-code-list-panel__insert-actions">
              <button type="button" className="btn-secondary" onClick={() => setInsertState(null)}>
                {t('cancel')}
              </button>
              <button type="button" className="btn-primary" onClick={commitInsert}>
                {insertState.targetCode ? t('codeListInsert') : t('codeListAddEnd')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
