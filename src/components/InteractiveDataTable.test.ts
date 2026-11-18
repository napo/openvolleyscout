// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  filterAndSortTableRows,
  paginateTableRows,
  type InteractiveTableColumn,
} from './InteractiveDataTable';

interface Row {
  id: string;
  name: string;
  count: number;
}

const COLUMNS: InteractiveTableColumn<Row>[] = [
  { key: 'name', label: 'Name', text: (r) => r.name },
  { key: 'count', label: 'Count', text: (r) => String(r.count), sortValue: (r) => r.count },
];

const SAMPLE: Row[] = [
  { id: '1', name: 'Charlie', count: 30 },
  { id: '2', name: 'Alpha', count: 5 },
  { id: '3', name: 'Bravo', count: 12 },
];

describe('InteractiveDataTable helpers', () => {
  it('filters across all columns and sorts strings and numbers', () => {
    const byName = filterAndSortTableRows(SAMPLE, COLUMNS, '', 'name', 'asc');
    expect(byName.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const byCountDesc = filterAndSortTableRows(SAMPLE, COLUMNS, '', 'count', 'desc');
    expect(byCountDesc.map((r) => r.id)).toEqual(['1', '3', '2']);

    const filtered = filterAndSortTableRows(SAMPLE, COLUMNS, 'bravo', 'name', 'asc');
    expect(filtered.map((r) => r.id)).toEqual(['3']);
  });

  it('paginates rows into fixed blocks and clamps page bounds', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), name: `Row ${i + 1}`, count: i }));
    const page1 = paginateTableRows(items, 1, 10);
    expect(page1.totalPages).toBe(3);
    expect(page1.pageRows).toHaveLength(10);
    expect(page1.startIndex).toBe(0);

    const page3 = paginateTableRows(items, 99, 10);
    expect(page3.safePage).toBe(3);
    expect(page3.pageRows).toHaveLength(5);
    expect(page3.startIndex).toBe(20);
  });
});
