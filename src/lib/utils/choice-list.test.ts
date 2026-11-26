// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { choiceList, matchesChoice } from './choice-list';

describe('choice lists', () => {
  it('reads lists and the single values of older versions', () => {
    expect(choiceList('all')).toEqual([]);
    expect(choiceList(undefined)).toEqual([]);
    expect(choiceList('K1')).toEqual(['K1']);
    expect(choiceList(['K1', 'all', 'X5'])).toEqual(['K1', 'X5']);
  });

  it('lets everything through when nothing is chosen, else any of the chosen', () => {
    expect(matchesChoice([], 'a')).toBe(true);
    expect(matchesChoice(['a', 'b'], 'b')).toBe(true);
    expect(matchesChoice(['a', 'b'], 'c')).toBe(false);
    expect(matchesChoice(['a'], null)).toBe(false);
  });
});
