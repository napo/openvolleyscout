import { describe, expect, it } from 'vitest';
import { parseQuickJerseyList } from './quick-entry';

describe('parseQuickJerseyList', () => {
  it('parses space, comma and Japanese comma separated numbers', () => {
    expect(parseQuickJerseyList('1 2,3、10').players.map((p) => p.jerseyNumber)).toEqual([1, 2, 3, 10]);
  });

  it('expands ranges', () => {
    expect(parseQuickJerseyList('1-4 7~8').players.map((p) => p.jerseyNumber)).toEqual([1, 2, 3, 4, 7, 8]);
  });

  it('marks liberos with L prefix in several spellings', () => {
    const { players } = parseQuickJerseyList('L4 l:7 L 12 5');
    expect(players).toEqual([
      { jerseyNumber: 4, isLibero: true },
      { jerseyNumber: 7, isLibero: true },
      { jerseyNumber: 12, isLibero: true },
      { jerseyNumber: 5, isLibero: false },
    ]);
  });

  it('accepts full-width digits', () => {
    expect(parseQuickJerseyList('１２　Ｌ３').players).toEqual([
      { jerseyNumber: 12, isLibero: false },
      { jerseyNumber: 3, isLibero: true },
    ]);
  });

  it('drops duplicates and reports invalid tokens', () => {
    const result = parseQuickJerseyList('3 3 abc 0 100 9-2');
    expect(result.players.map((p) => p.jerseyNumber)).toEqual([3]);
    expect(result.invalidTokens).toEqual(['abc', '0', '100', '9-2']);
  });
});
