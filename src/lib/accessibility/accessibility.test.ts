// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { getEvaluationColor, EVALUATION_SCALE_COLORS } from '../../domain/touch/evaluation-scale';
import { DEFAULT_ACCESSIBILITY, paletteFor, readAccessibility, sanitizeAccessibility, saveAccessibility } from './accessibility';

describe('accessibility settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveAccessibility({ ...DEFAULT_ACCESSIBILITY });
  });

  it('falls back to the defaults for anything unknown', () => {
    expect(sanitizeAccessibility({ textScale: 77, colorVision: 'x', spacing: 'yes' })).toEqual(DEFAULT_ACCESSIBILITY);
    expect(sanitizeAccessibility(null)).toEqual(DEFAULT_ACCESSIBILITY);
  });

  it('writes the choices on the page and keeps them', () => {
    saveAccessibility({ ...DEFAULT_ACCESSIBILITY, textScale: 130, legibleFont: true, colorVision: 'deuteranopia' });
    const root = document.documentElement;
    expect(root.hasAttribute('data-a11y-text')).toBe(true);
    expect(root.hasAttribute('data-a11y-font')).toBe(true);
    expect(root.getAttribute('data-a11y-color')).toBe('deuteranopia');
    expect(JSON.parse(window.localStorage.getItem('openvolleyscout.accessibility') ?? '{}').textScale).toBe(130);
    expect(readAccessibility().legibleFont).toBe(true);
  });

  it('forgets the stored value when everything is back to default', () => {
    saveAccessibility({ ...DEFAULT_ACCESSIBILITY, spacing: true });
    saveAccessibility({ ...DEFAULT_ACCESSIBILITY });
    expect(window.localStorage.getItem('openvolleyscout.accessibility')).toBeNull();
    expect(document.documentElement.hasAttribute('data-a11y-spacing')).toBe(false);
  });

  it('switches the evaluation colours for colour blindness', () => {
    expect(getEvaluationColor('attack', '#')).toBe(EVALUATION_SCALE_COLORS[0]);
    saveAccessibility({ ...DEFAULT_ACCESSIBILITY, colorVision: 'protanopia' });
    expect(getEvaluationColor('attack', '#')).not.toBe(EVALUATION_SCALE_COLORS[0]);
    expect(paletteFor('achromatopsia')).toBe('grayscale');
  });
});
