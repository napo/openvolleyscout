// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptySkillStats, type PlayerStats } from './match-stats';
import { computePlayerAttackSummary, computePlayerReceptionSummary, computePlayerServeSummary } from '../../analytics/dashboard/metrics/dashboard-metrics';
import {
  EDITABLE_EFFICIENCY_SKILLS,
  describeEfficiency,
  getActiveIndicatorConfig,
  getActiveIndicators,
  getDefaultEfficiencyDefinition,
  getEfficiencyDefinition,
  isEfficiencyCustomized,
  parseEffectSymbols,
  reloadIndicatorSettings,
  resetEfficiencyDefinitions,
  sanitizeEfficiencyDefinition,
  setEfficiencyDefinition,
  withTypedEffects,
} from './indicator-settings';

const stats = (counts: Partial<Record<'hash' | 'plus' | 'exclamation' | 'minus' | 'slash' | 'equal', number>>) => {
  const skill = createEmptySkillStats();
  Object.assign(skill, counts);
  skill.total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
  return skill;
};

// 10 serves: 2 aces, 3 positive, 1 '!', 2 '-', 1 '/', 1 error.
const serve = stats({ hash: 2, plus: 3, exclamation: 1, minus: 2, slash: 1, equal: 1 });

describe('efficiency rules', () => {
  afterEach(() => { resetEfficiencyDefinitions(); reloadIndicatorSettings(); });

  it('default to the DataVolley "Efficienza" table, for the seven skills', () => {
    expect(EDITABLE_EFFICIENCY_SKILLS).toEqual(['serve', 'receive', 'attack', 'block', 'dig', 'set', 'freeball']);
    const formulas = Object.fromEntries(EDITABLE_EFFICIENCY_SKILLS.map((skill) => [skill, describeEfficiency(getDefaultEfficiencyDefinition(skill))]));
    expect(formulas).toEqual({
      serve: '(#+!/) / Tot',
      receive: '(#+) / Tot',
      attack: '((#) - (/=)) / Tot',
      block: '((#+) - (/=)) / Tot',
      dig: '(#+/) / Tot',
      set: '((#+) - (/=)) / Tot',
      freeball: '((#+) - (/=)) / Tot',
    });
    expect(isEfficiencyCustomized()).toBe(false);
    expect(getActiveIndicators().serveEfficiency(serve)).toBeCloseTo(0.7); // (2 + 3 + 1 + 1) / 10
  });

  it('follow the rule typed for a skill, and only for that skill', () => {
    expect(setEfficiencyDefinition('serve', { positive: ['#'], negative: ['='] })).toBe(true);
    expect(getActiveIndicators().serveEfficiency(serve)).toBeCloseTo(0.1); // (2 - 1) / 10
    expect(getActiveIndicators().receptionEfficiency(stats({ hash: 1, minus: 1 }))).toBeCloseTo(0.5);
    expect(isEfficiencyCustomized('serve')).toBe(true);
    expect(isEfficiencyCustomized('attack')).toBe(false);
  });

  it('return to the defaults on reset, and forget a rule equal to the default', () => {
    setEfficiencyDefinition('attack', { positive: ['#', '+'], negative: ['='] });
    expect(getEfficiencyDefinition('attack').positive).toEqual(['#', '+']);
    resetEfficiencyDefinitions();
    expect(getEfficiencyDefinition('attack')).toEqual(getDefaultEfficiencyDefinition('attack'));
    setEfficiencyDefinition('attack', { positive: ['#'], negative: ['=', '/'] });
    expect(isEfficiencyCustomized('attack')).toBe(false);
  });

  it('reject a symbol that is both winning and losing, and unknown symbols', () => {
    expect(setEfficiencyDefinition('serve', { positive: ['#'], negative: ['#'] })).toBe(false);
    expect(sanitizeEfficiencyDefinition({ positive: ['#', 'x'], negative: ['='] })).toEqual({ positive: ['#'], negative: ['='] });
    expect(sanitizeEfficiencyDefinition({ positive: '#', negative: [] })).toBeNull();
    expect(getEfficiencyDefinition('serve')).toEqual(getDefaultEfficiencyDefinition('serve'));
  });

  it('are the same object until a rule changes (a stable snapshot for the settings page)', () => {
    const before = getActiveIndicatorConfig();
    expect(getActiveIndicatorConfig()).toBe(before);
    setEfficiencyDefinition('serve', { positive: ['#'], negative: [] });
    expect(getActiveIndicatorConfig()).not.toBe(before);
  });
});

describe('typing the effects', () => {
  it('reads the symbols in the order typed and ignores anything else', () => {
    expect(parseEffectSymbols('#+!/')).toEqual(['#', '+', '!', '/']);
    expect(parseEffectSymbols(' # x+ #')).toEqual(['#', '+']);
    expect(parseEffectSymbols('abc')).toEqual([]);
  });

  it('moves a symbol from the other side when it is typed on one side', () => {
    const attack = { positive: ['#'] as ('#' | '+' | '!' | '-' | '/' | '=')[], negative: ['/', '='] as ('#' | '+' | '!' | '-' | '/' | '=')[] };
    expect(withTypedEffects(attack, 'positive', '#/')).toEqual({ positive: ['#', '/'], negative: ['='] });
    expect(withTypedEffects(attack, 'negative', '=-')).toEqual({ positive: ['#'], negative: ['=', '-'] });
    expect(withTypedEffects(attack, 'positive', '')).toEqual({ positive: [], negative: ['/', '='] });
  });

  it('writes the formula the way DataVolley does', () => {
    expect(describeEfficiency({ positive: ['#', '+', '!', '/'], negative: [] })).toBe('(#+!/) / Tot');
    expect(describeEfficiency({ positive: ['#'], negative: ['/', '='] })).toBe('((#) - (/=)) / Tot');
  });
});

describe('screens that show an efficiency', () => {
  afterEach(() => { resetEfficiencyDefinitions(); reloadIndicatorSettings(); });
  const player = {
    serve, receive: stats({ hash: 3, plus: 3, minus: 2, equal: 2 }), attack: stats({ hash: 4, plus: 2, minus: 1, slash: 1, equal: 2 }),
    aces: 2, serveErrors: 1, receptionErrors: 2, attackPoints: 4, attackErrors: 2, attackBlocked: 1,
  } as unknown as PlayerStats;

  it('use the same serve rule: the DataVolley one by default, the typed one afterwards', () => {
    expect(computePlayerServeSummary(player).efficiency).toBeCloseTo(0.7);
    setEfficiencyDefinition('serve', { positive: ['#'], negative: ['='] });
    expect(computePlayerServeSummary(player).efficiency).toBeCloseTo(0.1);
  });

  it('use the reception and attack rules typed in settings', () => {
    expect(computePlayerReceptionSummary(player).efficiency).toBeCloseTo(6 / 10);
    expect(computePlayerAttackSummary(player).efficiency).toBeCloseTo((4 - 1 - 2) / 10);
    setEfficiencyDefinition('receive', { positive: ['#'], negative: ['='] });
    setEfficiencyDefinition('attack', { positive: ['#', '+'], negative: ['='] });
    expect(computePlayerReceptionSummary(player).efficiency).toBeCloseTo((3 - 2) / 10);
    expect(computePlayerAttackSummary(player).efficiency).toBeCloseTo((4 + 2 - 2) / 10);
  });
});
