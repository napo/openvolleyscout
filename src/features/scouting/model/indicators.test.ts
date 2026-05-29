// src/features/scouting/model/indicators.test.ts
import { describe, expect, it } from 'vitest';
import type { SkillStats } from './match-stats';
import {
  DATAVOLLEY_OV1_INDICATORS,
  makeIndicators,
  skillEfficiency,
  symbolCount,
} from './indicators';

/** Build a SkillStats from per-symbol counts (others default to 0). */
function stats(counts: Partial<Record<'hash' | 'plus' | 'exclamation' | 'minus' | 'slash' | 'equal', number>>): SkillStats {
  const hash = counts.hash ?? 0;
  const plus = counts.plus ?? 0;
  const exclamation = counts.exclamation ?? 0;
  const minus = counts.minus ?? 0;
  const slash = counts.slash ?? 0;
  const equal = counts.equal ?? 0;
  return {
    total: hash + plus + exclamation + minus + slash + equal,
    perfect: hash,
    positive: plus,
    errors: equal,
    neutral: exclamation + slash,
    points: 0,
    hash,
    plus,
    exclamation,
    minus,
    slash,
    equal,
  };
}

const ovi = makeIndicators(DATAVOLLEY_OV1_INDICATORS);
const pct = (value: number | null) => (value === null ? null : Math.round(value * 100));

describe('attack indicators against the ov1 reference report', () => {
  // Braslovče attack Total: Tot 102, Err 5, Blo 3, Kill 38 → Eff 29%, K% 37%
  it('matches Braslovče attack totals', () => {
    const s = stats({ hash: 38, slash: 3, equal: 5, plus: 56 }); // plus padding to reach Tot=102
    expect(s.total).toBe(102);
    expect(pct(ovi.attackEfficiency(s))).toBe(29); // (38 − 3 − 5)/102
    expect(pct(ovi.attackKillRate(s))).toBe(37); // 38/102
  });

  // Braslovče Set 2 attack: Tot 31, Err 1, Blo 3, Kill 12 → Eff 26%, K% 39%
  it('matches Braslovče set 2 attack', () => {
    const s = stats({ hash: 12, slash: 3, equal: 1, plus: 15 });
    expect(s.total).toBe(31);
    expect(pct(ovi.attackEfficiency(s))).toBe(26); // (12 − 3 − 1)/31
    expect(pct(ovi.attackKillRate(s))).toBe(39); // 12/31
  });

  // Nova KBM attack Total: Tot 108, Err 10, Blo 6, Kill 23 → Eff 6%, K% 21%
  it('matches Nova KBM attack totals', () => {
    const s = stats({ hash: 23, slash: 6, equal: 10, plus: 69 });
    expect(s.total).toBe(108);
    expect(pct(ovi.attackEfficiency(s))).toBe(6); // (23 − 6 − 10)/108
    expect(pct(ovi.attackKillRate(s))).toBe(21); // 23/108
  });
});

describe('serve and reception formula shape (ov1)', () => {
  it('serve eff counts positives and subtracts negatives, not just ace−error', () => {
    // 10 serves: 2 ace(#), 3 positive(+), 1 "/"(positive), 2 negative(-), 1 error(=), 1 ok(!)
    const s = stats({ hash: 2, plus: 3, slash: 1, minus: 2, equal: 1, exclamation: 1 });
    // (2 + 3 + 1 − 2 − 1)/10 = 3/10
    expect(ovi.serveEfficiency(s)).toBeCloseTo(0.3, 6);
  });

  it('reception eff subtracts poor in addition to error', () => {
    // 35 receptions, 13 positive-or-perfect, 7 error, 1 poor(-) → (13 − 7 − 1)/35 ≈ 14%
    const s = stats({ hash: 6, plus: 7, minus: 1, equal: 7, exclamation: 14 });
    expect(s.total).toBe(35);
    expect(pct(ovi.receptionPositiveRate(s))).toBe(37); // 13/35
    expect(pct(ovi.receptionEfficiency(s))).toBe(14); // (13 − 7 − 1)/35
  });
});

describe('configurability', () => {
  it('per-symbol weights change the formula (DataVolley Efficienza style)', () => {
    const s = stats({ hash: 4, plus: 2, equal: 4 }); // total 10
    const weighted = makeIndicators({
      ...DATAVOLLEY_OV1_INDICATORS,
      efficiency: {
        ...DATAVOLLEY_OV1_INDICATORS.efficiency,
        attack: { positive: ['#', '+'], negative: ['='], weights: { '+': 0.5 } },
      },
    });
    // (4·1 + 2·0.5 − 4·1)/10 = 1/10
    expect(weighted.attackEfficiency(s)).toBeCloseTo(0.1, 6);
  });

  it('symbolCount reads the right field', () => {
    const s = stats({ hash: 5 });
    expect(symbolCount(s, '#')).toBe(5);
    expect(symbolCount(s, '+')).toBe(0);
  });

  it('returns null on empty totals', () => {
    expect(skillEfficiency(stats({}), DATAVOLLEY_OV1_INDICATORS.efficiency.attack)).toBeNull();
  });
});
