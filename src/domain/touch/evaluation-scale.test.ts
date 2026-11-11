// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  EVALUATION_SCALE_COLORS,
  getEvaluationColor,
  getEvaluationInk,
  getEvaluationPlace,
  getEvaluationScale,
  getEvaluationTint,
} from './evaluation-scale';

describe('evaluation scale', () => {
  it('follows the VolleyReport order: serve # / + ! - =, the others # + ! - / =', () => {
    expect(getEvaluationScale('serve')).toEqual(['#', '/', '+', '!', '-', '=']);
    for (const skill of ['receive', 'attack', 'block', 'set', 'dig', 'freeball', 'cover'] as const) {
      expect(getEvaluationScale(skill)).toEqual(['#', '+', '!', '-', '/', '=']);
    }
  });

  it('colours a place on the scale, not a symbol', () => {
    expect(getEvaluationColor('serve', '/')).toBe(EVALUATION_SCALE_COLORS[1]);
    expect(getEvaluationColor('receive', '/')).toBe(EVALUATION_SCALE_COLORS[4]);
    expect(getEvaluationPlace('serve', '+')).toBeLessThan(getEvaluationPlace('serve', '!'));
  });

  it('keeps the ends fixed for every skill', () => {
    for (const skill of ['serve', 'receive', 'attack'] as const) {
      expect(getEvaluationColor(skill, '#')).toBe('#00ff00');
      expect(getEvaluationColor(skill, '=')).toBe('#ff0000');
    }
  });

  it('uses white ink only on red, and a neutral colour without an evaluation', () => {
    expect(getEvaluationInk('attack', '=')).toBe('#ffffff');
    expect(getEvaluationInk('attack', '#')).toBe('#383838');
    expect(getEvaluationColor('attack', undefined)).toBe('#6b7280');
  });

  it('tints towards white', () => {
    expect(getEvaluationTint('attack', '=', 0.5)).toBe('rgb(255, 128, 128)');
    expect(getEvaluationTint('attack', '=', 1)).toBe('rgb(255, 0, 0)');
  });
});
