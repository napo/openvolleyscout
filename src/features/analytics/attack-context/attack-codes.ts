// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
// Value imports must be relative: node:test files reach this module through ts-node/esm.
import { isSetterCallCode, normalizeTouchCode } from '../../../domain/match/code-tables';
import { previousSet } from './attack-context';

/**
 * The codes that describe a set or an attack, read the same way by every filter (tactical
 * report, heatmap, Analysis panel, Video analysis, side-out study):
 * - Base: the setter call (K1, K7, ...). An attack takes the call of the set just before it.
 * - Combination: the attack's own combination code (X5, V6, C1, ...), never a K code.
 * - Set type (ball type): the attack's DataVolley letter (H, M, Q, T, U, N, O).
 */

/** The attack's ball type letter, trimmed and upper-cased (the tactical report's reading). */
export function resolveAttackBallType(attack: BallTouch): string | null {
  return normalizeTouchCode(attack.attackType ?? attack.skillTypeCode);
}

const setterCallField = (code: string | null | undefined): string | null => (
  isSetterCallCode(code) ? normalizeTouchCode(code) : null
);

/**
 * The setter call (Base) of a set, or of the attack that followed it. The first K code found in:
 * the set's setter call, the set's combination (older data), the attack's setter call, the
 * attack's combination (older data). Codes that are not K codes are never a Base.
 */
export function setterCallOf(set: BallTouch | null | undefined, attack?: BallTouch | null): string | null {
  return setterCallField(set?.setterCallCode)
    ?? setterCallField(set?.combinationCode)
    ?? setterCallField(attack?.setterCallCode)
    ?? setterCallField(attack?.combinationCode);
}

/** The attack's own combination code; null when it has none or carries a K code (that is a Base). */
export function resolveAttackCombination(attack: BallTouch): string | null {
  const code = normalizeTouchCode(attack.combinationCode);
  return code && !isSetterCallCode(code) ? code : null;
}

export interface TouchAttackCodes {
  setterCall: string | null;
  combinationCode: string | null;
  ballType: string | null;
}

const NO_CODES: TouchAttackCodes = { setterCall: null, combinationCode: null, ballType: null };

/**
 * The codes of the touch at `index` (touches in rally order). A set has only its Base; an attack
 * has the Base of the set before it, its own combination and its ball type; any other touch none.
 */
export function resolveTouchAttackCodes(sorted: readonly BallTouch[], index: number): TouchAttackCodes {
  const touch = sorted[index];
  if (!touch) return NO_CODES;
  if (touch.skill === 'set') return { setterCall: setterCallOf(touch), combinationCode: null, ballType: null };
  if (touch.skill !== 'attack') return NO_CODES;
  return {
    setterCall: setterCallOf(previousSet(sorted, index, touch.teamSide), touch),
    combinationCode: resolveAttackCombination(touch),
    ballType: resolveAttackBallType(touch),
  };
}

/** The three code filters. An empty or missing list means all; the lists combine with AND. */
export interface AttackCodeFilter {
  setterCalls?: readonly string[];
  combinationCodes?: readonly string[];
  attackBallTypes?: readonly string[];
}

const chosen = (list: readonly string[] | undefined): string[] => (
  (list ?? []).map(normalizeTouchCode).filter((code): code is string => code !== null)
);

export function hasAttackCodeFilter(filter: AttackCodeFilter): boolean {
  return chosen(filter.setterCalls).length > 0
    || chosen(filter.combinationCodes).length > 0
    || chosen(filter.attackBallTypes).length > 0;
}

function matchesList(value: string | null, list: readonly string[] | undefined): boolean {
  const values = chosen(list);
  return values.length === 0 || (value !== null && values.includes(value));
}

/** Whether a touch's codes pass every chosen list (filter values compared case-insensitively). */
export function matchesAttackCodes(codes: TouchAttackCodes, filter: AttackCodeFilter): boolean {
  return matchesList(codes.setterCall, filter.setterCalls)
    && matchesList(codes.combinationCode, filter.combinationCodes)
    && matchesList(codes.ballType, filter.attackBallTypes);
}

function sortTouches(touches: readonly BallTouch[]): BallTouch[] {
  return [...touches].sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.createdAt - right.createdAt);
}

/**
 * Rally-level reading (Analysis panel): whether the team played what the filter asks in the rally.
 * With only the Base chosen, any set or attack of the team on that Base is enough. When a
 * combination or a set type is chosen, one attack of the team must pass every chosen list.
 */
export function rallyMatchesAttackCodes(touches: readonly BallTouch[], teamSide: TeamSide, filter: AttackCodeFilter): boolean {
  if (!hasAttackCodeFilter(filter)) return true;
  const attackOnly = chosen(filter.combinationCodes).length > 0 || chosen(filter.attackBallTypes).length > 0;
  const sorted = sortTouches(touches);
  return sorted.some((touch, index) => {
    if (touch.teamSide !== teamSide) return false;
    if (touch.skill !== 'attack' && (attackOnly || touch.skill !== 'set')) return false;
    return matchesAttackCodes(resolveTouchAttackCodes(sorted, index), filter);
  });
}

/** Codes sorted for display, each once (K2 before K10, X5 before X9). */
export function sortAttackCodes(codes: Iterable<string>): string[] {
  return [...new Set(codes)].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export interface AttackCodeOptions {
  setterCalls: string[];
  combinationCodes: string[];
}

/**
 * The Base and Combination codes found in the rallies, for the filter chips. Only the sets and
 * attacks accepted by `include` count (for example one team, or one attacker).
 */
export function collectAttackCodeOptions(
  rallies: Iterable<{ touches: readonly BallTouch[] }>,
  include: (touch: BallTouch) => boolean,
): AttackCodeOptions {
  const setterCalls = new Set<string>();
  const combinationCodes = new Set<string>();
  for (const rally of rallies) {
    const sorted = sortTouches(rally.touches);
    sorted.forEach((touch, index) => {
      if ((touch.skill !== 'set' && touch.skill !== 'attack') || !include(touch)) return;
      const codes = resolveTouchAttackCodes(sorted, index);
      if (codes.setterCall) setterCalls.add(codes.setterCall);
      if (codes.combinationCode) combinationCodes.add(codes.combinationCode);
    });
  }
  return { setterCalls: sortAttackCodes(setterCalls), combinationCodes: sortAttackCodes(combinationCodes) };
}
