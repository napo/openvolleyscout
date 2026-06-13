import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchEvent } from '@src/domain/events/types';
import type { Player } from '@src/domain/roster/types';
import { buildDataVolleyTouchCode } from '../model/datavolley-code';
import { parseDataVolleyInput } from './code-parser';
import './match-code-list-panel.css';

type DvwRow = {
  id: string;
  code: string;
  kind: 'touch' | 'auto';
  touchId?: string;
  eventIndex?: number;
  isRallyEnd: boolean;
  setNumber: number;
  rallyNumber: number;
};

interface MatchCodeListPanelProps {
  eventLog: readonly MatchEvent[];
  homePlayers: Player[];
  awayPlayers: Player[];
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
): DvwRow[] {
  const rows: DvwRow[] = [];
  let homeScore = 0;
  let awayScore = 0;
  let lastPointRowIndex = -1;
  let rowCounter = 0;

  const nextId = (eventIndex: number) => `r${rowCounter++}-e${eventIndex}`;

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

      rows.push({ id: nextId(eventIndex), code: `*P${padTwo(homeCaptainJersey)}>LUp`, kind: 'auto', isRallyEnd: false, setNumber, rallyNumber: 0 });
      rows.push({ id: nextId(eventIndex), code: `*z${homeSetterPos}>LUp`, kind: 'auto', isRallyEnd: false, setNumber, rallyNumber: 0 });
      rows.push({ id: nextId(eventIndex), code: `aP${padTwo(awayCaptainJersey)}>LUp`, kind: 'auto', isRallyEnd: false, setNumber, rallyNumber: 0 });
      rows.push({ id: nextId(eventIndex), code: `az${awaySetterPos}>LUp`, kind: 'auto', isRallyEnd: false, setNumber, rallyNumber: 0 });
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
        isRallyEnd: false,
        setNumber: touch.setNumber,
        rallyNumber: touch.rallyNumber ?? 0,
      });
      return;
    }

    if (event.type === 'point_awarded') {
      if (event.teamSide === 'home') homeScore += 1;
      else awayScore += 1;
      const marker = event.teamSide === 'home' ? '*' : 'a';
      const code = `${marker}p${padTwo(homeScore)}:${padTwo(awayScore)}`;
      lastPointRowIndex = rows.length;
      rows.push({ id: nextId(eventIndex), code, kind: 'auto', isRallyEnd: false, setNumber: event.setNumber, rallyNumber: event.rallyNumber });
      return;
    }

    if (event.type === 'rally_ended') {
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

  return rows;
}

export function MatchCodeListPanel({
  eventLog,
  homePlayers,
  awayPlayers,
  isCollapsed = false,
  onToggleCollapsed,
  onReplaceEvents,
}: MatchCodeListPanelProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const rows = useMemo(
    () => buildLiveDvwRows(eventLog, homePlayers, awayPlayers),
    [eventLog, homePlayers, awayPlayers],
  );

  // Auto-scroll to bottom when new rows arrive (only if not editing)
  useEffect(() => {
    if (!editingRowId && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [rows.length, editingRowId]);

  const startEdit = (row: DvwRow) => {
    if (row.kind !== 'touch' || !onReplaceEvents) return;
    setEditingRowId(row.id);
    setEditValue(row.code);
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

  return (
    <aside
      className={['match-code-list-panel', isCollapsed ? 'match-code-list-panel--collapsed' : ''].filter(Boolean).join(' ')}
      aria-label={t('codeList', { defaultValue: 'Code list' })}
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

      {!isCollapsed && (
        <div className="match-code-list-panel__body">
          {rows.length === 0 ? (
            <div className="match-code-list-panel__empty">
              {t('expertModeNoRallyCodes', { defaultValue: 'No codes yet' })}
            </div>
          ) : (
            rows.map((row) => {
              const isEditing = editingRowId === row.id;
              const rowClass = [
                'match-code-list-panel__row',
                row.kind === 'touch' ? 'match-code-list-panel__row--touch' : 'match-code-list-panel__row--auto',
                row.isRallyEnd ? 'match-code-list-panel__row--rally-end' : '',
                isEditing ? 'match-code-list-panel__row--editing' : '',
              ].filter(Boolean).join(' ');

              return (
                <div key={row.id} className={rowClass}>
                  {isEditing ? (
                    <input
                      className="match-code-list-panel__edit-input"
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, row)}
                      onBlur={() => commitEdit(row)}
                      aria-label={t('expertModeCodeInput', { defaultValue: 'Edit code' })}
                    />
                  ) : (
                    <button
                      type="button"
                      className="match-code-list-panel__code-btn"
                      onClick={() => row.kind === 'touch' ? startEdit(row) : undefined}
                      disabled={row.kind !== 'touch' || !onReplaceEvents}
                    >
                      {row.code}
                    </button>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </aside>
  );
}
