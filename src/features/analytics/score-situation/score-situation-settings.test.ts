// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { matchesScoreSituation } from '../dashboard/selectors/rally-context-filters';
import {
  DEFAULT_SCORE_SITUATION_SETTINGS,
  getScoreSituationSettings,
  isLateInSet,
  resetScoreSituationSettings,
  setScoreSituationSettings,
} from './score-situation-settings';

describe('score situation settings', () => {
  afterEach(() => resetScoreSituationSettings());

  it('starts from the defaults: close finish from 20 (12 in a deciding set), gap 2, leading by 1', () => {
    expect(getScoreSituationSettings()).toEqual(DEFAULT_SCORE_SITUATION_SETTINGS);
    expect(matchesScoreSituation(21, 20, 25, 'leading')).toBe(true);
    expect(matchesScoreSituation(22, 20, 25, 'clutch')).toBe(true);
    expect(isLateInSet(12, 9, 15)).toBe(true);
    expect(isLateInSet(19, 18, 25)).toBe(false);
  });

  it('applies what the user sets', () => {
    setScoreSituationSettings({ closeFrom: 22, closeMaxGap: 1, leadMinGap: 3 });
    expect(matchesScoreSituation(21, 20, 25, 'clutch')).toBe(false);
    expect(matchesScoreSituation(23, 22, 25, 'clutch')).toBe(true);
    expect(matchesScoreSituation(24, 22, 25, 'clutch')).toBe(false);
    expect(matchesScoreSituation(12, 10, 25, 'leading')).toBe(false);
    expect(matchesScoreSituation(13, 10, 25, 'leading')).toBe(true);
    expect(matchesScoreSituation(10, 13, 25, 'trailing')).toBe(true);
  });

  it('ignores values out of range', () => {
    setScoreSituationSettings({ closeFrom: 40, leadMinGap: 0 });
    expect(getScoreSituationSettings().closeFrom).toBe(20);
    expect(getScoreSituationSettings().leadMinGap).toBe(1);
  });
});
