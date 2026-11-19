// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { countMatchesByTeamId, findRelatedMatchIds, groupMatchesByTeamId } from './team-matches';

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

describe('countMatchesByTeamId / groupMatchesByTeamId', () => {
  const list = [
    { id: 'a', homeTeamId: 't1', awayTeamId: 't2', playedAt: '2026-01-01' },
    { id: 'b', homeTeamId: 't2', awayTeamId: 't1', playedAt: '2026-03-01' },
    { id: 'c', homeTeamId: 't1', awayTeamId: 't1', playedAt: '2026-02-01' },
    { id: 'd', homeTeamId: 't3' },
  ];

  it('counts one per side carrying the id', () => {
    const counts = countMatchesByTeamId(list);
    expect(counts.get('t1')).toBe(4);
    expect(counts.get('t2')).toBe(2);
    expect(counts.get('t3')).toBe(1);
  });

  it('groups newest first and lists a same-team match once', () => {
    const grouped = groupMatchesByTeamId(list);
    expect(grouped.get('t1')?.map((m) => m.id)).toEqual(['b', 'c', 'a']);
    expect(grouped.get('t2')?.map((m) => m.id)).toEqual(['b', 'a']);
    expect(grouped.get('t3')?.map((m) => m.id)).toEqual(['d']);
  });
});
