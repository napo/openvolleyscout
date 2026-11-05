import { describe, expect, it } from 'vitest';
import type { RadarValues } from '../../analytics/radar/model/radar-metrics';
import {
  averageRadarValues,
  computeOpponentMatchSimilarities,
  radarProfileSimilarity,
} from './match-similarity';

const profile = (shift = 0): RadarValues => ({
  serveEfficiency: 0.1 + shift,
  receptionEfficiency: 0.3 + shift,
  attackEfficiency: 0.25 + shift,
  sideOutPct: 0.6 + shift,
  breakPointPct: 0.4 + shift,
  servePositiveRate: 0.3 + shift,
  receptionPositiveRate: 0.5 + shift,
  attackKillRate: 0.45 + shift,
});

describe('opponent match similarity', () => {
  it('scores identical profiles 100, and lower as they drift apart', () => {
    expect(radarProfileSimilarity(profile(), profile())).toBe(100);
    const near = radarProfileSimilarity(profile(), profile(0.05))!;
    const far = radarProfileSimilarity(profile(), profile(0.15))!;
    expect(near).toBeGreaterThan(far);
    expect(radarProfileSimilarity(profile(), profile(0.5))).toBe(0);
  });

  it('needs at least five shared axes', () => {
    expect(radarProfileSimilarity({ serveEfficiency: 0.1, sideOutPct: 0.5 }, profile())).toBeNull();
    expect(radarProfileSimilarity({ ...profile(), attackKillRate: null, sideOutPct: null, breakPointPct: null }, profile())).toBe(100);
  });

  it('averages each axis over the profiles that have it', () => {
    expect(averageRadarValues([{ sideOutPct: 0.4 }, { sideOutPct: 0.6, breakPointPct: 0.3 }])).toEqual({
      sideOutPct: 0.5,
      breakPointPct: 0.3,
    });
  });

  it('typical compares with the other matches; similar-to-own needs our team', () => {
    const matches = [
      { matchId: 'a', opponent: profile(), faced: profile(0.02) },
      { matchId: 'b', opponent: profile(0.01), faced: profile(0.2) },
      { matchId: 'odd', opponent: profile(0.2), faced: profile() },
    ];
    const withOwn = computeOpponentMatchSimilarities(matches, profile());
    expect(withOwn.get('odd')!.typical!).toBeLessThan(withOwn.get('a')!.typical!);
    expect(withOwn.get('a')!.similarToOwn!).toBeGreaterThan(withOwn.get('b')!.similarToOwn!);
    expect(withOwn.get('odd')!.similarToOwn).toBe(100);

    const withoutOwn = computeOpponentMatchSimilarities(matches, null);
    expect(withoutOwn.get('a')!.similarToOwn).toBeNull();

    const single = computeOpponentMatchSimilarities([matches[0]], profile());
    expect(single.get('a')!.typical).toBeNull();
  });
});
