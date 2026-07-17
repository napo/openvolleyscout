import { Table, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import type { ArrowColumnSpec } from '../model/arrow-column-spec';
import { BACKUP_EVENT_TABLE_COLUMNS, EVENT_TABLE_COLUMNS } from '../model/events-table-schema';
import { BACKUP_TOUCH_TABLE_COLUMNS, TOUCH_TABLE_COLUMNS } from '../model/touches-table-schema';
import type { BackupOvsEventRow, BackupOvsTouchRow, OvsEventRow, OvsTouchRow } from '../types';

/**
 * The only module that imports `apache-arrow` — isolates the heaviest
 * dependency so it can be lazy-loaded independently of the rest of the
 * codec (see `ovs-bundle/index.ts`).
 */
function encodeTable<Row>(rows: Row[], columns: Array<ArrowColumnSpec<Row>>): Uint8Array {
  const vectors: Record<string, ReturnType<typeof vectorFromArray>> = {};

  for (const column of columns) {
    const values = rows.map((row) => column.get(row) ?? null);
    vectors[column.name] = vectorFromArray(values, column.type() as never);
  }

  const table = new Table(vectors);
  return tableToIPC(table, 'file');
}

function decodeTable<Row>(bytes: Uint8Array, columns: Array<ArrowColumnSpec<Row>>): Row[] {
  const table = tableFromIPC(bytes);
  // Resolve each column's vector once — table.getChild does a name lookup,
  // and the column->vector mapping never changes across rows.
  const resolvedColumns = columns.map((column) => ({ column, vector: table.getChild(column.name) }));
  const rows: Row[] = [];

  for (let i = 0; i < table.numRows; i += 1) {
    const row = {} as Row;
    for (const { column, vector } of resolvedColumns) {
      const value = vector ? vector.get(i) : null;
      if (value !== null && value !== undefined) {
        row[column.name] = value as Row[typeof column.name];
      }
    }
    rows.push(row);
  }

  return rows;
}

export function encodeTouchesTable(rows: OvsTouchRow[]): Uint8Array {
  return encodeTable(rows, TOUCH_TABLE_COLUMNS);
}

export function decodeTouchesTable(bytes: Uint8Array): OvsTouchRow[] {
  return decodeTable(bytes, TOUCH_TABLE_COLUMNS);
}

export function encodeEventsTable(rows: OvsEventRow[]): Uint8Array {
  return encodeTable(rows, EVENT_TABLE_COLUMNS);
}

export function decodeEventsTable(bytes: Uint8Array): OvsEventRow[] {
  return decodeTable(bytes, EVENT_TABLE_COLUMNS);
}

export function encodeBackupTouchesTable(rows: BackupOvsTouchRow[]): Uint8Array {
  return encodeTable(rows, BACKUP_TOUCH_TABLE_COLUMNS);
}

export function decodeBackupTouchesTable(bytes: Uint8Array): BackupOvsTouchRow[] {
  return decodeTable(bytes, BACKUP_TOUCH_TABLE_COLUMNS);
}

export function encodeBackupEventsTable(rows: BackupOvsEventRow[]): Uint8Array {
  return encodeTable(rows, BACKUP_EVENT_TABLE_COLUMNS);
}

export function decodeBackupEventsTable(bytes: Uint8Array): BackupOvsEventRow[] {
  return decodeTable(bytes, BACKUP_EVENT_TABLE_COLUMNS);
}
