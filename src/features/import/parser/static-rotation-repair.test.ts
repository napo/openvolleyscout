import { describe, expect, it } from 'vitest';
import { repairStaticRotations, rotateLineup, rotateSetterZone } from './static-rotation-repair';
import type { ParsedDataVolleyScoutRow } from './types';

const lineup = (homeZone: number, awayZone: number) => ({ home: [1, 2, 3, 4, 5, 6], away: [11, 12, 13, 14, 15, 16], homeSetterPosition: homeZone, awaySetterPosition: awayZone });
const serve = (side: 'home' | 'away', homeZone = 3, awayZone = 6) => ({ type: 'touch', skill: 'serve', teamSide: side, setNumber: 1, lineup: lineup(homeZone, awayZone) }) as unknown as ParsedDataVolleyScoutRow;
const point = (winner: 'home' | 'away', homeZone = 3, awayZone = 6) => ({ type: 'point', pointWinnerSide: winner, setNumber: 1, lineup: lineup(homeZone, awayZone) }) as unknown as ParsedDataVolleyScoutRow;
const zones = (rows: ParsedDataVolleyScoutRow[]) => rows.map((row) => `${row.lineup.homeSetterPosition}/${row.lineup.awaySetterPosition}`);

describe('static rotation repair', () => {
  it('rotates setter zones and lineups the DataVolley way', () => {
    expect([3, 2, 1, 6].map((_, k) => rotateSetterZone(3, k))).toEqual([3, 2, 1, 6]);
    expect(rotateSetterZone(1, 1)).toBe(6);
    expect(rotateLineup([1, 2, 3, 4, 5, 6], 1)).toEqual([2, 3, 4, 5, 6, 1]);
  });

  it('rebuilds a set whose rotation never changes from its side-outs', () => {
    // Home serves and loses (away sides out), away serves and loses (home sides out), home serves and wins.
    const rows = [serve('home'), point('away'), serve('away'), point('home'), serve('home'), point('home')];
    const warnings: never[] = [];
    const repaired = repairStaticRotations(rows, warnings);
    expect(repaired).toEqual([{ setNumber: 1, side: 'home' }, { setNumber: 1, side: 'away' }]);
    expect(zones(rows)).toEqual(['3/6', '3/6', '3/5', '3/5', '2/5', '2/5']);
    expect(rows[4].lineup.home).toEqual([2, 3, 4, 5, 6, 1]);
    expect(warnings).toHaveLength(2);
  });

  it('leaves files whose rotation already advances untouched', () => {
    const rows = [serve('home', 3, 6), point('away', 3, 6), serve('away', 3, 5), point('home', 3, 5), serve('home', 2, 5)];
    expect(repairStaticRotations(rows, [])).toEqual([]);
    expect(zones(rows)).toEqual(['3/6', '3/6', '3/5', '3/5', '2/5']);
  });

  it('does not touch a team that never sided out', () => {
    const rows = [serve('home'), point('home'), serve('home'), point('home')];
    expect(repairStaticRotations(rows, [])).toEqual([]);
  });
});

describe('declared setters', () => {
  it('reads "*P"/"aP" declarations, including set-start lineup rows, and resets them per set', async () => {
    const { annotateDeclaredSetters } = await import('./static-rotation-repair');
    const lineupRow = (code: string, setNumber: number) => ({ type: 'lineup', rawCode: code, setNumber, lineup: { home: [], away: [] } }) as unknown as ParsedDataVolleyScoutRow;
    const touch = (setNumber: number) => ({ type: 'touch', skill: 'set', teamSide: 'away', setNumber, lineup: { home: [], away: [] } }) as unknown as ParsedDataVolleyScoutRow;
    const change = { type: 'setter_change', teamSide: 'away', setterNumber: 9, setNumber: 1, lineup: { home: [], away: [] } } as unknown as ParsedDataVolleyScoutRow;
    const rows = [lineupRow('*P14>LUp', 1), lineupRow('aP06>LUp', 1), touch(1), change, touch(1), touch(2)];
    annotateDeclaredSetters(rows);
    expect(rows[2].lineup.homeSetterNumber).toBe(14);
    expect(rows[2].lineup.awaySetterNumber).toBe(6);
    expect(rows[4].lineup.awaySetterNumber).toBe(9);
    expect(rows[5].lineup.awaySetterNumber).toBeUndefined();
  });
});
