import { describe, it, expect } from 'vitest';
import type { SimilarityPair } from './similarity';
import { buildTopSimilarityNarratives } from './similarity-narrative';

function pair(aId: string, bId: string, score: number): SimilarityPair {
  return { aId, bId, score, method: 'cosine', sharedAxisCount: 5 };
}

describe('buildTopSimilarityNarratives', () => {
  it('produces one entry per direction of a pair above the score threshold', () => {
    const pairs = [pair('a', 'b', 90)];
    const labels = new Map([['a', 'Alice'], ['b', 'Bob']]);
    const entries = buildTopSimilarityNarratives(pairs, labels, 'player');

    expect(entries).toHaveLength(2);
    const aEntry = entries.find((e) => e.subjectId === 'a')!;
    expect(aEntry.matchId).toBe('b');
    expect(aEntry.subjectLabel).toBe('Alice');
    expect(aEntry.matchLabel).toBe('Bob');
    expect(aEntry.kind).toBe('player');
  });

  it('excludes pairs below minScore', () => {
    const pairs = [pair('a', 'b', 50)];
    const entries = buildTopSimilarityNarratives(pairs, new Map(), 'player', { minScore: 75 });
    expect(entries).toHaveLength(0);
  });

  it('keeps only the top N matches per subject', () => {
    const pairs = [pair('a', 'b', 80), pair('a', 'c', 95), pair('a', 'd', 90)];
    const entries = buildTopSimilarityNarratives(pairs, new Map(), 'player', { topNPerEntity: 2, minScore: 0 });
    const aEntries = entries.filter((e) => e.subjectId === 'a');
    expect(aEntries).toHaveLength(2);
    expect(aEntries.map((e) => e.matchId)).toEqual(['c', 'd']);
  });

  it('falls back to the raw id when no label is supplied', () => {
    const pairs = [pair('a', 'b', 90)];
    const entries = buildTopSimilarityNarratives(pairs, new Map(), 'team');
    const aEntry = entries.find((e) => e.subjectId === 'a')!;
    expect(aEntry.subjectLabel).toBe('a');
    expect(aEntry.matchLabel).toBe('b');
  });

  it('returns entries sorted by score descending, with no free-text strings', () => {
    const pairs = [pair('a', 'b', 80), pair('c', 'd', 95)];
    const entries = buildTopSimilarityNarratives(pairs, new Map(), 'team', { minScore: 0 });
    expect(entries[0].score).toBe(95);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(
        ['kind', 'matchId', 'matchLabel', 'score', 'subjectId', 'subjectLabel'].sort(),
      );
    }
  });
});
