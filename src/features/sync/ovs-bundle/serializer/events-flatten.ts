import type { MatchEvent } from '@src/domain/events/types';
import type { NonTouchEvent, OvsEventRow } from '../types';
import { pruneUndefined } from './json-utils';

const COMMON_KEYS = ['id', 'type', 'createdAt', 'setNumber', 'rallyNumber', 'teamSide'] as const;

export function flattenNonTouchEvents(events: MatchEvent[]): OvsEventRow[] {
  const rows: OvsEventRow[] = [];

  events.forEach((event, sequenceIndex) => {
    if (event.type === 'touch_recorded') {
      return;
    }

    const record = event as unknown as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (!(COMMON_KEYS as readonly string[]).includes(key)) {
        payload[key] = record[key];
      }
    }

    rows.push(
      pruneUndefined({
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
        sequenceIndex,
        setNumber: (event as { setNumber?: number }).setNumber,
        rallyNumber: (event as { rallyNumber?: number }).rallyNumber,
        teamSide: (event as { teamSide?: OvsEventRow['teamSide'] }).teamSide,
        payloadJson: JSON.stringify(payload),
      } satisfies OvsEventRow),
    );
  });

  return rows;
}

export function unflattenEventRows(rows: OvsEventRow[]): Array<NonTouchEvent & { sequenceIndex: number }> {
  return rows.map((row) => {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;

    return pruneUndefined({
      id: row.id,
      type: row.type,
      createdAt: row.createdAt,
      sequenceIndex: row.sequenceIndex,
      setNumber: row.setNumber,
      rallyNumber: row.rallyNumber,
      teamSide: row.teamSide,
      ...payload,
    }) as unknown as NonTouchEvent & { sequenceIndex: number };
  });
}
