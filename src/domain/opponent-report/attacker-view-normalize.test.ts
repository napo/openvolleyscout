// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  createOpponentReport,
  normalizeAttackerDirectionView,
  normalizeOpponentReportViews,
  type AttackerDirectionViewConfig,
} from './types';

describe('attacker views saved with setter calls among the combinations', () => {
  it('moves the K codes to Base and keeps the combinations', () => {
    const view: AttackerDirectionViewConfig = { id: 'v', label: 'V', combinationCodes: ['K1', 'X5', ' kc ', 'V5'] };
    expect(normalizeAttackerDirectionView(view)).toEqual({ id: 'v', label: 'V', setterCalls: ['K1', 'KC'], combinationCodes: ['X5', 'V5'] });
    // The saved object is not changed.
    expect(view.combinationCodes).toEqual(['K1', 'X5', ' kc ', 'V5']);
  });

  it('merges with the Base already chosen, without repeating a code', () => {
    expect(normalizeAttackerDirectionView({ id: 'v', label: 'V', setterCalls: ['K7', 'K1'], combinationCodes: ['k1', 'K2'] }))
      .toMatchObject({ setterCalls: ['K7', 'K1', 'K2'], combinationCodes: undefined });
  });

  it('leaves no empty combination list behind, so the view keeps every combination', () => {
    const next = normalizeAttackerDirectionView({ id: 'v', label: 'V', combinationCodes: ['K1'] });
    expect(next.setterCalls).toEqual(['K1']);
    expect(next.combinationCodes).toBeUndefined();
  });

  it('returns the same view when there is nothing to move, and is idempotent', () => {
    const plain: AttackerDirectionViewConfig = { id: 'v', label: 'V', combinationCodes: ['X5'], setterCalls: ['K1'] };
    expect(normalizeAttackerDirectionView(plain)).toBe(plain);
    const once = normalizeAttackerDirectionView({ id: 'v', label: 'V', setterCalls: ['K2'], combinationCodes: ['K1', 'X5'] });
    const twice = normalizeAttackerDirectionView(once);
    expect(twice).toBe(once);
    expect(twice).toEqual({ id: 'v', label: 'V', setterCalls: ['K2', 'K1'], combinationCodes: ['X5'] });
  });

  it('converts a whole report only when one of its views needs it', () => {
    const report = createOpponentReport({ id: 'r', title: 'R', opponent: { name: 'Rivals' } });
    expect(normalizeOpponentReportViews(report)).toBe(report);
    const current = { ...report, attackerViews: [{ id: 'a', label: 'A', combinationCodes: ['X5'] }] };
    expect(normalizeOpponentReportViews(current)).toBe(current);
    const legacy = { ...report, attackerViews: [{ id: 'a', label: 'A', combinationCodes: ['X5'] }, { id: 'b', label: 'B', combinationCodes: ['K1'] }] };
    const converted = normalizeOpponentReportViews(legacy);
    expect(converted).not.toBe(legacy);
    expect(converted.attackerViews?.[0]).toBe(legacy.attackerViews[0]);
    expect(converted.attackerViews?.[1]).toEqual({ id: 'b', label: 'B', setterCalls: ['K1'], combinationCodes: undefined });
    expect(normalizeOpponentReportViews(converted)).toBe(converted);
  });
});
