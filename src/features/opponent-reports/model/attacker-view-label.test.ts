// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { en } from '@src/i18n/locales/en';
import type { TranslationKey } from '@src/i18n';
import { attackerViewFilterLabel } from './attacker-view-label';

const t = (key: TranslationKey) => String(en[key as keyof typeof en] ?? key);

describe('attacker view filter label', () => {
  it('names Base, Combination and Set type apart', () => {
    expect(attackerViewFilterLabel({ id: 'v', label: '', setterCalls: ['K1'], combinationCodes: ['X5'] }, t))
      .toBe('Base: K1 · Combination: X5');
    expect(attackerViewFilterLabel({ id: 'v', label: '', attackBallTypes: ['Q', 'H'] }, t)).toBe('Set type: Q/H');
  });

  it('reads K codes saved among the combinations by older versions as Base', () => {
    expect(attackerViewFilterLabel({ id: 'v', label: '', combinationCodes: ['K1'] }, t)).toBe('Base: K1');
    expect(attackerViewFilterLabel({ id: 'v', label: '', combinationCodes: ['kc', 'X5'] }, t)).toBe('Base: KC · Combination: X5');
  });
});
