// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findRelatedMatchIds } from './team-matches';

const summaries = [
  { id: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'Alpha', awayTeamName: 'Beta' },
  { id: 'm2', homeTeamId: 't3', awayTeamId: 't1', homeTeamName: 'Gamma', awayTeamName: 'Alpha' },
  { id: 'm3', homeTeamId: 't3', awayTeamId: 't4', homeTeamName: 'Gamma', awayTeamName: 'Delta' },
  { id: 'm4', homeTeamName: ' ALPHA ', awayTeamName: 'Delta' },
  { id: 'm5', homeTeamId: 't9', homeTeamName: 'Alpha', awayTeamName: 'Delta' },
];

describe('findRelatedMatchIds', () => {
  it('matches by team id on either side', () => {
    expect(findRelatedMatchIds(summaries, [{ id: 't1', name: 'Alpha' }])).toEqual(['m1', 'm2', 'm4']);
  });

  it('falls back to name only when the match has no team id', () => {
    expect(findRelatedMatchIds(summaries, [{ id: 'x', name: 'alpha' }])).toEqual(['m4']);
  });

  it('collects matches for several teams without duplicates', () => {
    expect(findRelatedMatchIds(summaries, [{ id: 't1', name: 'Alpha' }, { id: 't2', name: 'Beta' }])).toEqual(['m1', 'm2', 'm4']);
  });

  it('returns nothing for unrelated or unnamed teams', () => {
    expect(findRelatedMatchIds(summaries, [{ id: 'zz', name: 'Nobody' }, { id: 'yy', name: '  ' }])).toEqual([]);
  });
});
