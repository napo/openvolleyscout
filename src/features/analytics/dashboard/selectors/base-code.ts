// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import { isSetterCallCode } from '@src/domain/match/code-tables';

const cleanCode = (code: string | undefined) => (code?.trim() ? code.trim().toUpperCase() : null);

/**
 * Base / combination of a set or an attack (touches in rally order), read as in the heatmap
 * and the tactical report: the touch's own code, otherwise (attack) the setter's call
 * (K1...Kn) on the set just before it.
 */
export function resolveBaseCode(touches: readonly BallTouch[], index: number, teamSide: TeamSide): string | null {
  const touch = touches[index];
  if (!touch) return null;
  if (touch.skill === 'set') return cleanCode(touch.setterCallCode) ?? cleanCode(touch.combinationCode);
  if (touch.skill !== 'attack') return null;
  const own = cleanCode(touch.combinationCode);
  if (own) return own;
  for (let i = index - 1; i >= 0; i -= 1) {
    const prev = touches[i];
    if (prev.teamSide !== teamSide) break;
    if (prev.skill === 'set') return cleanCode(prev.setterCallCode) ?? cleanCode(prev.combinationCode);
    if (prev.skill !== 'cover') break;
  }
  return cleanCode(touch.setterCallCode);
}

/** Base codes a team played in a rally (sets and attacks). */
export function rallyBaseCodes(touches: readonly BallTouch[], teamSide: TeamSide): Set<string> {
  const codes = new Set<string>();
  touches.forEach((touch, index) => {
    if (touch.teamSide !== teamSide) return;
    const code = resolveBaseCode(touches, index, teamSide);
    if (code) codes.add(code);
  });
  return codes;
}

/** Sorted list of codes: the bases (K1, K2 ... K10) first, then the combinations. */
export function sortBaseCodes(codes: Iterable<string>): string[] {
  return [...new Set(codes)].sort((left, right) => (
    Number(isSetterCallCode(right)) - Number(isSetterCallCode(left))
    || left.localeCompare(right, undefined, { numeric: true })
  ));
}
