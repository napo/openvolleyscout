import { describe, expect, it } from 'vitest';
import { tabellinoColumnWidths, tabellinoHeaderRows } from './match-report-pdf';

const t = ((key: string) => key) as never;
const header = (setNumber: number) => ({ setNumber }) as never;

describe('match report PDF columns', () => {
  it.each([0, 3])('keeps header rows as wide as the columns with %i sets', (sets) => {
    const tabellino = { setHeaders: Array.from({ length: sets }, (_, i) => header(i + 1)) } as never;
    const widths = tabellinoColumnWidths(sets);
    for (const row of tabellinoHeaderRows(tabellino, t)) expect(row).toHaveLength(widths.length);
  });
});
