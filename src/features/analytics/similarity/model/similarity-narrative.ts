import type { SimilarityPair } from './similarity';

export interface SimilarityNarrativeEntry {
  subjectId: string;
  subjectLabel: string;
  matchId: string;
  matchLabel: string;
  score: number;
  kind: 'player' | 'team';
}

export interface BuildNarrativesOptions {
  /** Max number of "looks like" entries generated per subject entity. */
  topNPerEntity?: number;
  /** Minimum score (0..100) for a match to be worth surfacing. */
  minScore?: number;
}

const DEFAULTS: Required<BuildNarrativesOptions> = { topNPerEntity: 1, minScore: 75 };

/**
 * Turns a pairwise similarity matrix into one-directional "subject looks like
 * match" entries, at most `topNPerEntity` per subject, scored at or above
 * `minScore`. Purely structural — no display strings — the caller applies
 * its own translated headline template to each entry.
 */
export function buildTopSimilarityNarratives(
  pairs: readonly SimilarityPair[],
  labelsById: ReadonlyMap<string, string>,
  kind: 'player' | 'team',
  options: BuildNarrativesOptions = {},
): SimilarityNarrativeEntry[] {
  const { topNPerEntity, minScore } = { ...DEFAULTS, ...options };

  const candidatesByEntity = new Map<string, { matchId: string; score: number }[]>();
  const addCandidate = (subjectId: string, matchId: string, score: number) => {
    const list = candidatesByEntity.get(subjectId) ?? [];
    list.push({ matchId, score });
    candidatesByEntity.set(subjectId, list);
  };

  for (const pair of pairs) {
    addCandidate(pair.aId, pair.bId, pair.score);
    addCandidate(pair.bId, pair.aId, pair.score);
  }

  const entries: SimilarityNarrativeEntry[] = [];
  for (const [subjectId, candidates] of candidatesByEntity) {
    const top = [...candidates]
      .sort((a, b) => b.score - a.score)
      .filter((c) => c.score >= minScore)
      .slice(0, topNPerEntity);

    for (const candidate of top) {
      entries.push({
        subjectId,
        subjectLabel: labelsById.get(subjectId) ?? subjectId,
        matchId: candidate.matchId,
        matchLabel: labelsById.get(candidate.matchId) ?? candidate.matchId,
        score: Math.round(candidate.score),
        kind,
      });
    }
  }

  return entries.sort((a, b) => b.score - a.score);
}
