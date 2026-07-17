import type { DataType } from 'apache-arrow';

/**
 * Declarative column definition shared by encode/decode. `name` doubles as
 * the property key on `Row` — decoding assigns generically by name, so a new
 * column only needs an entry here, never a hand-written decode branch.
 */
export interface ArrowColumnSpec<Row> {
  name: string & keyof Row;
  type: () => DataType;
  get: (row: Row) => unknown;
}
