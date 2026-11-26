// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { DEMO_MATCH_FILE } from '@src/features/demo/demo-match';
import { exportMatchToDataVolley } from './index';

/**
 * A DataVolley file opened in the app and exported again must say the same things: every row in
 * the same place with the same code (ball type, zones, cones, subtype, players, special code),
 * phases, ball coordinates, time of day, video position and lineups, and the same set scores.
 *
 * Known, harmless differences left out of the comparison: the setter-position columns on the rows
 * that declare a setter or a lineup (DataVolley writes there the positions before the row), and
 * the set-end row, which DataVolley writes with the next set number and no lineup.
 */
const parse = (bytes: Uint8Array) => parseDataVolleyFile(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  { sourceName: 'match.dvw' },
);

const CODE = 0;
const SETTER_POSITIONS = [9, 10];
const LINEUPS = Array.from({ length: 12 }, (_, index) => 14 + index);
const ROW_DATA = [1, 2, 4, 5, 6, 7, 11, 12];

describe.each([
  ['the demo match', `public/${DEMO_MATCH_FILE}`],
  ['a five-set match without video file and zones', 'stuttgart-schwrein.dvw'],
])('DataVolley file round trip: %s', (_label, file) => {
  const original = parse(readFileSync(file));
  const exported = exportMatchToDataVolley(mapDataVolleyMatchToOvsProject(original, { sourceName: 'match.dvw' }).project);
  const again = parse(new TextEncoder().encode(exported.text));

  it('keeps every scout row, in order, with its code and columns', () => {
    expect(again.scoutRows.length).toBe(original.scoutRows.length);
    const differences: string[] = [];
    original.scoutRows.forEach((row, index) => {
      const before = row.rawLine.split(';');
      const after = again.scoutRows[index].rawLine.split(';');
      const setEnd = /^\*\*\dset/.test(before[CODE]);
      const declaresSetter = /^[*a]P\d|>LUp/.test(before[CODE]);
      const columns = [
        ...ROW_DATA,
        ...(setEnd ? [] : LINEUPS),
        ...(setEnd || declaresSetter ? [] : SETTER_POSITIONS),
      ];
      // Trailing "~" of a code are padding: DataVolley itself writes codes of different lengths.
      if (before[CODE].replace(/~+$/, '') !== after[CODE].replace(/~+$/, '')) differences.push(`row ${index} code: ${before[CODE]} => ${after[CODE]}`);
      for (const column of columns) {
        if ((before[column] ?? '') !== (after[column] ?? '')) differences.push(`row ${index} (${before[CODE]}) column ${column}: "${before[column]}" => "${after[column]}"`);
      }
    });
    expect(differences.slice(0, 10)).toEqual([]);
  });

  it('keeps the set scores, with the partial scores and the duration', () => {
    expect(again.sets.map((set) => set.rawFields)).toEqual(original.sets.map((set) => set.rawFields));
  });

  it('adds no warning about made-up times', () => {
    expect(exported.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')).toEqual([]);
  });
});
