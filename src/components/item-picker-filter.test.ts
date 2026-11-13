import { describe, expect, it } from 'vitest';
import { filterPickerItems, type ItemPickerColumn } from './ItemPickerDialog';

type Row = { id: string; match: string; competition: string; date: string };
const rows: Row[] = [
  { id: 'a', match: 'Melodic Spikers - Hollywood Blockers', competition: 'Serie A1', date: '03/11/2024' },
  { id: 'b', match: 'Allianz MTV Stuttgart - SSC Schwerin', competition: 'Bundesliga', date: '21/04/2018' },
  { id: 'c', match: 'Città di Trento - Pallavolo Mosè', competition: 'Serie B2', date: '09/05/2026' },
];
const columns: ItemPickerColumn<Row>[] = [
  { key: 'match', label: 'Match', text: (row) => row.match },
  { key: 'competition', label: 'Competition', text: (row) => row.competition },
  { key: 'date', label: 'Date', text: (row) => row.date },
];
const ids = (list: Row[]) => list.map((row) => row.id);

describe('item picker filter', () => {
  it('puts the suggested item first', () => {
    expect(ids(filterPickerItems(rows, columns, (r) => r.id, 'c', ''))).toEqual(['c', 'a', 'b']);
  });

  it('matches every word across columns, ignoring case and accents', () => {
    expect(ids(filterPickerItems(rows, columns, (r) => r.id, null, 'serie 2024'))).toEqual(['a']);
    expect(ids(filterPickerItems(rows, columns, (r) => r.id, null, 'citta mose'))).toEqual(['c']);
    expect(ids(filterPickerItems(rows, columns, (r) => r.id, null, 'STUTTGART'))).toEqual(['b']);
    expect(filterPickerItems(rows, columns, (r) => r.id, null, 'nothing')).toEqual([]);
  });
});
