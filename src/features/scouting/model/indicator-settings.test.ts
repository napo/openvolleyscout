// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptySkillStats, type PlayerStats } from './match-stats';
import { computePlayerAttackSummary, computePlayerReceptionSummary, computePlayerServeSummary } from '../../analytics/dashboard/metrics/dashboard-metrics';
import {
  definitionFromRoles,
  describeEfficiency,
  getActiveIndicatorConfig,
  getActiveIndicators,
  getDefaultEfficiencyDefinition,
  getEfficiencyDefinition,
  isEfficiencyCustomized,
  reloadIndicatorSettings,
  resetEfficiencyDefinitions,
  sanitizeEfficiencyDefinition,
  setEfficiencyDefinition,
  symbolRole,
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

  it('default to the DataVolley rules', () => {
    expect(getDefaultEfficiencyDefinition('serve')).toEqual({ positive: ['#', '+', '/'], negative: ['-', '='] });
    expect(getDefaultEfficiencyDefinition('receive')).toEqual({ positive: ['#', '+'], negative: ['/', '-', '='] });
    expect(getDefaultEfficiencyDefinition('attack')).toEqual({ positive: ['#'], negative: ['/', '='] });
    expect(isEfficiencyCustomized()).toBe(false);
    // serve: (2 + 3 + 1 - 2 - 1) / 10
    expect(getActiveIndicators().serveEfficiency(serve)).toBeCloseTo(0.3);
  });

  it('follow the rule chosen for a skill, and only for that skill', () => {
    expect(setEfficiencyDefinition('serve', { positive: ['#'], negative: ['='] })).toBe(true);
    expect(getActiveIndicators().serveEfficiency(serve)).toBeCloseTo(0.1); // (2 - 1) / 10
    expect(getActiveIndicators().receptionEfficiency(stats({ hash: 1, minus: 1 }))).toBeCloseTo(0);
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

  it('reject a symbol that is both positive and negative, and unknown symbols', () => {
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

  it('turn symbol roles into a rule and back, and describe it', () => {
    const definition = definitionFromRoles({ '#': 'positive', '+': 'neutral', '!': 'neutral', '-': 'negative', '/': 'neutral', '=': 'negative' });
    expect(definition).toEqual({ positive: ['#'], negative: ['-', '='] });
    expect(symbolRole(definition, '#')).toBe('positive');
    expect(symbolRole(definition, '+')).toBe('neutral');
    expect(symbolRole(definition, '=')).toBe('negative');
    expect(describeEfficiency(definition)).toBe('(# - (- + =)) / total');
    expect(describeEfficiency({ positive: ['#'], negative: [] })).toBe('(#) / total');
  });
});

describe('screens that show an efficiency', () => {
  afterEach(() => { resetEfficiencyDefinitions(); reloadIndicatorSettings(); });
  const player = {
    serve, receive: stats({ hash: 3, plus: 3, minus: 2, equal: 2 }), attack: stats({ hash: 4, plus: 2, minus: 1, slash: 1, equal: 2 }),
    aces: 2, serveErrors: 1, receptionErrors: 2, attackPoints: 4, attackErrors: 2, attackBlocked: 1,
  } as unknown as PlayerStats;

  it('use the same serve rule: the DataVolley one by default, the chosen one afterwards', () => {
    expect(computePlayerServeSummary(player).efficiency).toBeCloseTo(0.3);
    setEfficiencyDefinition('serve', { positive: ['#'], negative: ['='] });
    expect(computePlayerServeSummary(player).efficiency).toBeCloseTo(0.1);
  });

  it('use the reception and attack rules chosen in settings', () => {
    expect(computePlayerReceptionSummary(player).efficiency).toBeCloseTo((3 + 3 - 2 - 2) / 10);
    expect(computePlayerAttackSummary(player).efficiency).toBeCloseTo((4 - 1 - 2) / 10);
    setEfficiencyDefinition('receive', { positive: ['#'], negative: [] });
    setEfficiencyDefinition('attack', { positive: ['#', '+'], negative: ['='] });
    expect(computePlayerReceptionSummary(player).efficiency).toBeCloseTo(3 / 10);
    expect(computePlayerAttackSummary(player).efficiency).toBeCloseTo((4 + 2 - 2) / 10);
  });
});
