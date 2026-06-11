/**
 * DataVolley parser tests.
 * Runs under ts-node/esm; all @src/ imports are type-only so they are
 * stripped before Node resolves modules.
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
// Value imports: relative only
import { parseDataVolleyFile } from './datavolley-parser';

// DataVolley writes the NEXT set number in the set-number column (field 8) of
// "**Nset" end-of-set rows, exactly as real DV4 files do. The parser must
// attribute those rows to the set they close, otherwise the mapper creates a
// phantom extra set (empty lineups, tied 0-0 score) for the trailing marker.
const DVW_FIXTURE = [
  '[3DATAVOLLEYSCOUT]',
  'FILEFORMAT: 2.0',
  '[3MATCH]',
  '01/01/2025;18.00.00;2024/2025;Test League;Regular season;;6;37;;1;Z;0;',
  '[3TEAMS]',
  'HOM;Home Team;1;Coach H;;',
  'AWY;Away Team;0;Coach A;;',
  '[3PLAYERS-H]',
  '0;1;1;1;;;;;HOM-1;Uno;Home;;;5;False;;;',
  '0;2;2;2;;;;;HOM-2;Due;Home;;;2;False;;;',
  '[3PLAYERS-V]',
  '1;1;3;1;;;;;AWY-1;Uno;Away;;;5;False;;;',
  '1;2;4;2;;;;;AWY-2;Due;Away;;;2;False;;;',
  '[3SET]',
  'True;;;;25-20;25;',
  'False;;;;;;',
  '[3SCOUT]',
  '*01SH#~~~15A;;;;;;;18.01.00;1;1;1;1;10;;1;2;3;4;5;6;1;2;3;4;5;6;',
  '*p01:00;;;;;;;18.01.05;1;1;1;1;15;;1;2;3;4;5;6;1;2;3;4;5;6;',
  // End-of-set marker for set 1: DataVolley puts "2" in the set-number column.
  '**1set;;;;;;;18.25.00;2;1;1;1;1500;;;;;;;;;;;;;;',
].join('\r\n');

describe('parseDataVolleyFile end-of-set rows', () => {
  const parsed = parseDataVolleyFile(DVW_FIXTURE);
  const endSetRows = parsed.scoutRows.filter((row) => row.type === 'end_set');

  it('parses the **Nset marker as an end_set row', () => {
    assert.strictEqual(endSetRows.length, 1);
    assert.strictEqual(endSetRows[0].type === 'end_set' && endSetRows[0].endSetNumber, 1);
  });

  it('attributes the **Nset row to the set it closes, not the next-set column value', () => {
    assert.strictEqual(endSetRows[0].setNumber, 1);
  });

  it('does not leak a phantom set number from the trailing end-of-set marker', () => {
    const setNumbers = new Set<number>();
    parsed.scoutRows.forEach((row) => {
      if (row.setNumber) setNumbers.add(row.setNumber);
    });
    assert.deepStrictEqual([...setNumbers].sort(), [1]);
  });

  it('keeps the set-number column for regular rows', () => {
    const touch = parsed.scoutRows.find((row) => row.type === 'touch');
    assert.ok(touch);
    assert.strictEqual(touch.setNumber, 1);
  });
});
