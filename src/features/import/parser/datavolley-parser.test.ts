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

describe('localized DataVolley metadata', () => {
  function withDate(date: string) {
    return DVW_FIXTURE.replace('01/01/2025;18.00.00', `${date};18.05.30`);
  }

  it('normalizes DataVolley dot-separated times to an ISO timestamp', () => {
    const parsed = parseDataVolleyFile(withDate('23/09/2026'));
    assert.strictEqual(parsed.metadata.playedAt, '2026-09-23T18:05:30');
  });

  it('recognizes unambiguous month-first dates automatically', () => {
    assert.strictEqual(parseDataVolleyFile(withDate('09/23/2026')).metadata.date, '2026-09-23');
  });

  it('lets the caller disambiguate dates without changing the day in the file', () => {
    assert.strictEqual(parseDataVolleyFile(withDate('11/04/2026'), { dateOrder: 'month-first' }).metadata.date, '2026-11-04');
    assert.strictEqual(parseDataVolleyFile(withDate('11/04/2026'), { dateOrder: 'day-first' }).metadata.date, '2026-04-11');
    assert.strictEqual(parseDataVolleyFile(withDate('11/04/2026')).metadata.date, '2026-04-11');
  });

  const extended = (value: string, width = 4) => '\u000f' + width + Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(width, '0')).join('');

  it('uses the extended Unicode team and staff names instead of ANSI transliterations', () => {
    const input = DVW_FIXTURE.replace('HOM;Home Team;1;Coach H;;',
      `HOM;Legacy Name;1;Coach H;;0;${extended('BEŞİKTAŞ')};${extended('Çağrı')};${extended('André', 2)};`);
    const parsed = parseDataVolleyFile(input);
    assert.strictEqual(parsed.teams[0].name, 'BEŞİKTAŞ');
    assert.strictEqual(parsed.teams[0].coach, 'Çağrı');
    assert.strictEqual(parsed.teams[0].assistantCoach, 'André');
  });

  it('reads extended player names from their own fields', () => {
    const fields = '0;1;1;1;;;;;HOM-1;Uno;Home;;;5;False;;;'.split(';');
    fields[17] = extended('Özçelik');
    fields[18] = extended('İlkin');
    fields[19] = extended('Çağrı');
    const parsed = parseDataVolleyFile(DVW_FIXTURE.replace('0;1;1;1;;;;;HOM-1;Uno;Home;;;5;False;;;', fields.join(';')));
    assert.strictEqual(parsed.players[0].displayName, 'İlkin Özçelik');
    assert.strictEqual(parsed.players[0].nickname, 'Çağrı');
  });

  it('falls back to the original name for missing, empty, or malformed extensions', () => {
    for (const encoded of ['', '\u000f4', '\u000f4004', '\u000f4ZZZZ']) {
      const input = DVW_FIXTURE.replace('HOM;Home Team;1;Coach H;;', `HOM;Home Team;1;Coach H;;0;${encoded};`);
      assert.strictEqual(parseDataVolleyFile(input).teams[0].name, 'Home Team');
    }
  });

  it('does not count empty True set slots as played', () => {
    const parsed = parseDataVolleyFile(DVW_FIXTURE.replace('False;;;;;;', 'True;;;;;;'));
    assert.strictEqual(parsed.sets[0].played, true);
    assert.strictEqual(parsed.sets[1].played, false);
  });

  it('recognizes an in-progress set from scout rows even without a summary score', () => {
    const parsed = parseDataVolleyFile(DVW_FIXTURE.replace('True;;;;25-20;25;', 'True;;;;;;'));
    assert.strictEqual(parsed.sets[0].played, true);
  });
});
