import type { TeamSide } from '@src/domain/common/enums';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { BallTouch } from '@src/domain/touch/types';
import { sortTouches, countExchangesThroughIndex } from '../dashboard/situation/rally-exchange-metrics';

export type RallyPhase =
  | 'side_out'
  | 'break_point'
  | 'counterattack'
  | 'transition_attack'
  | 'attack_after_receive'
  | 'attack_after_dig'
  | 'freeball'
  | 'unknown';

export const RALLY_PHASES: readonly RallyPhase[] = [
  'attack_after_receive',
  'attack_after_dig',
  'counterattack',
  'freeball',
  'transition_attack',
  'side_out',
  'break_point',
  'unknown',
];

function oppositeTeam(side: TeamSide): TeamSide {
  return side === 'home' ? 'away' : 'home';
}

/**
 * Classify a rally into its game-situation phase.
 *
 * The primary classification is K1 (attack_after_receive): if the receiving
 * team attacked after their reception in continuous possession, the rally is
 * `attack_after_receive` regardless of who won the point.  This matches the
 * standard volleyball analytics definition where K1 attempts include all
 * rallies with a first attack after reception, and K1 win% measures how
 * often the receiving team converts.
 *
 * Classification priority:
 *   freeball → attack_after_receive (K1) → attack_after_dig →
 *   counterattack → transition_attack → side_out | break_point → unknown
 *
 * Returns 'unknown' when servingTeam or pointWinner is missing, or when
 * there are no touches (e.g. incomplete imported data).
 */
export function classifyRallyPhase(rally: RallyStats): RallyPhase {
  const { servingTeam, pointWinner, touches } = rally;

  if (!servingTeam || !pointWinner) {
    return 'unknown';
  }

  if (!touches || touches.length === 0) {
    return 'unknown';
  }

  const receivingTeam = oppositeTeam(servingTeam);

  const sorted = sortTouches(touches);

  // Freeball takes precedence: any freeball touch in the rally
  if (sorted.some((t) => t.skill === 'freeball')) {
    return 'freeball';
  }

  // K1: receiving team's first attack after their reception (continuous possession).
  // This is flow-based — it doesn't matter who won the point.
  const receiveIdx = sorted.findIndex(
    (t) => t.teamSide === receivingTeam && t.skill === 'receive',
  );
  if (receiveIdx >= 0) {
    for (let i = receiveIdx + 1; i < sorted.length; i++) {
      const t = sorted[i];
      if (t.teamSide !== receivingTeam) break;
      if (t.skill === 'attack') return 'attack_after_receive';
    }
  }

  // No K1.  Classify based on the point winner's context.
  const winnerAttacks = sorted.filter(
    (t) => t.teamSide === pointWinner && t.skill === 'attack',
  );

  if (winnerAttacks.length === 0) {
    return pointWinner === receivingTeam ? 'side_out' : 'break_point';
  }

  const lastWinnerAttack = winnerAttacks[winnerAttacks.length - 1];
  const winnerContextTouch = sorted
    .filter(
      (t) =>
        t.teamSide === pointWinner
        && t.sequenceNumber < lastWinnerAttack.sequenceNumber
        && t.skill !== 'set'
        && t.skill !== 'cover',
    )
    .at(-1) ?? null;

  if (winnerContextTouch?.skill === 'receive') {
    return 'attack_after_receive';
  }

  if (winnerContextTouch?.skill === 'dig') {
    return 'attack_after_dig';
  }

  const opponentAttacks = sorted.filter(
    (t) => t.teamSide !== pointWinner && t.skill === 'attack',
  );
  if (pointWinner === servingTeam && opponentAttacks.length > 0) {
    return 'counterattack';
  }

  // No explicit receive/dig context, and the opponent never attacked either —
  // often means the defensive touch just wasn't scouted explicitly rather
  // than genuinely absent. Fall back to counting real cross-net exchanges up
  // to the winning attack instead of requiring a specific skill code: 1
  // behaves like a first-ball attack, 2+ like a transition attack after a dig.
  const exchangesThroughWinnerAttack = countExchangesThroughIndex(sorted, sorted.indexOf(lastWinnerAttack));
  if (exchangesThroughWinnerAttack === 1) {
    return 'attack_after_receive';
  }
  if (exchangesThroughWinnerAttack >= 2) {
    return 'attack_after_dig';
  }

  if (winnerAttacks.length > 0) {
    return 'transition_attack';
  }

  return pointWinner === receivingTeam ? 'side_out' : 'break_point';
}

/**
 * Strict First Ball Side-Out (FBSO) check: the receiving team's first attack
 * after reception, in continuous possession, must be the literal terminal
 * touch of the rally (nobody touches the ball again, by either team) AND be
 * scored as a kill (`evaluation === '#'`). This is narrower than the
 * `attack_after_receive` (K1) phase, which only requires that a first-ball
 * attack was attempted, regardless of whether the rally continued afterwards.
 */
export function isFirstBallSideOutKill(rally: RallyStats): boolean {
  const { servingTeam, touches } = rally;
  if (!servingTeam || !touches || touches.length === 0) return false;

  const receivingTeam = oppositeTeam(servingTeam);
  const sorted = touches
    .slice()
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber || a.createdAt - b.createdAt);

  const receiveIdx = sorted.findIndex(
    (t) => t.teamSide === receivingTeam && t.skill === 'receive',
  );
  if (receiveIdx < 0) return false;

  for (let i = receiveIdx + 1; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.teamSide !== receivingTeam) return false;
    if (t.skill === 'attack') {
      return i === sorted.length - 1 && t.evaluation === '#';
    }
  }

  return false;
}

export type AttackPrecedingContext = 'receive' | 'dig';

/**
 * For every `attack` touch in the rally, classifies whether its immediate
 * same-team build-up was a `receive` (first-ball attack) or a `dig`
 * (transition attack) — skipping over `set`/`cover` touches to find the
 * real preceding contact.
 *
 * When no explicit receive/dig is found (opponent touch hit immediately, the
 * nearest same-team touch was something else, or the rally start was
 * reached) — common when the defensive touch was only inferred, not
 * scouted — falls back to counting real cross-net exchanges up to this
 * attack: 1 behaves like a first-ball attack (receive), 2+ like a transition
 * attack (dig). The one case that still gets no entry is a same-team
 * `freeball` immediately before the attack: freeball is its own category
 * (see `classifyRallyPhase`), deliberately not folded into receive/dig.
 *
 * This is a per-attack generalization of the receive-vs-dig distinction
 * `classifyRallyPhase` already makes for the single *last winning* attack —
 * here every attack touch in the rally is classified independently.
 */
export function classifyAttackPrecedingContext(rally: RallyStats): Map<string, AttackPrecedingContext> {
  const result = new Map<string, AttackPrecedingContext>();
  const { touches } = rally;
  if (!touches || touches.length === 0) return result;

  const sorted = sortTouches(touches);

  for (let i = 0; i < sorted.length; i++) {
    const touch = sorted[i];
    if (touch.skill !== 'attack') continue;

    let found: AttackPrecedingContext | undefined;
    let blockedByFreeball = false;
    for (let j = i - 1; j >= 0; j--) {
      const prior = sorted[j];
      if (prior.teamSide !== touch.teamSide) break;
      if (prior.skill === 'set' || prior.skill === 'cover') continue;
      if (prior.skill === 'receive' || prior.skill === 'dig') {
        found = prior.skill;
      } else if (prior.skill === 'freeball') {
        blockedByFreeball = true;
      }
      break;
    }

    if (found) {
      result.set(touch.id, found);
      continue;
    }
    if (blockedByFreeball) {
      continue;
    }

    const exchanges = countExchangesThroughIndex(sorted, i);
    if (exchanges === 1) {
      result.set(touch.id, 'receive');
    } else if (exchanges >= 2) {
      result.set(touch.id, 'dig');
    }
  }

  return result;
}

/**
 * Strict AST (Attack after Service Turn) check: the literal terminal touch
 * of the rally must be an `attack` scored as a kill (`evaluation === '#'`)
 * whose immediate same-team build-up was a `dig` (per
 * `classifyAttackPrecedingContext`). This is narrower than the
 * `attack_after_dig` phase, which only requires that the eventual winner's
 * *last* attack was preceded by a dig — it does not require that attack to
 * be the rally's actual terminal touch. Mirrors `isFirstBallSideOutKill`,
 * but for the dig (transition) context instead of receive (first-ball).
 */
export function isAttackAfterDigKill(rally: RallyStats): boolean {
  const { touches } = rally;
  if (!touches || touches.length === 0) return false;

  const sorted = touches
    .slice()
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber || a.createdAt - b.createdAt);

  const terminal = sorted[sorted.length - 1];
  if (terminal.skill !== 'attack' || terminal.evaluation !== '#') return false;

  return classifyAttackPrecedingContext(rally).get(terminal.id) === 'dig';
}

/**
 * Check whether the serving team attacked in this rally (counterattack
 * opportunity). Useful in K1 rallies where the classifier returns
 * `attack_after_receive` but the serving team also counter-attacked.
 */
export function hasServingTeamAttack(rally: RallyStats): boolean {
  if (!rally.servingTeam) return false;
  return rally.touches.some(
    (t) => t.teamSide === rally.servingTeam && t.skill === 'attack',
  );
}

/** True when the rally is a side-out situation (receiving team wins). */
export function isRallySideOut(rally: RallyStats): boolean {
  if (!rally.servingTeam || !rally.pointWinner) return false;
  return rally.pointWinner === oppositeTeam(rally.servingTeam);
}

/** True when the rally is a break-point situation (serving team wins). */
export function isRallyBreakPoint(rally: RallyStats): boolean {
  if (!rally.servingTeam || !rally.pointWinner) return false;
  return rally.pointWinner === rally.servingTeam;
}

/**
 * Whether a rally matches a given phase filter.
 * 'side_out' and 'break_point' match ALL rallies where the respective team wins,
 * regardless of the more specific sub-phase.
 */
export function rallyMatchesPhaseFilter(rally: RallyStats, filter: RallyPhase | 'all'): boolean {
  if (filter === 'all') return true;

  if (filter === 'side_out') return isRallySideOut(rally);
  if (filter === 'break_point') return isRallyBreakPoint(rally);

  return classifyRallyPhase(rally) === filter;
}

/**
 * Per-touch tactical phase — a simplified 3-bucket classification of
 * individual touches within a rally (not the whole-rally classification
 * above). Rules:
 *
 *  - `serve` is always `break_point`; `receive` is always `point`.
 *  - For the SERVING team, the FIRST occurrence of each of block / dig
 *    (freeball counts as the same occurrence as dig) / set / attack / cover
 *    is `break_point` — their defensive response to the opponent's first
 *    attack, the resulting set, their own counter-attack, and its cover.
 *  - For the RECEIVING team, the FIRST occurrence of each of set / attack /
 *    cover is `point` — their side-out build-up after the reception.
 *  - Everything else (any 2nd+ occurrence, the receiving team's
 *    block/dig/freeball) is `transition`, split by which team the touch
 *    belongs to: `transition_break_point` for the serving team's transition
 *    touches, `transition_point` for the receiving team's.
 */
export type TouchPhase = 'break_point' | 'point' | 'transition_break_point' | 'transition_point';

export const TOUCH_PHASES: readonly TouchPhase[] = [
  'break_point',
  'point',
  'transition_break_point',
  'transition_point',
];

const SERVING_FIRST_TOUCH_SKILLS: ReadonlySet<string> = new Set(['block', 'dig', 'freeball', 'set', 'attack', 'cover']);
const RECEIVING_FIRST_TOUCH_SKILLS: ReadonlySet<string> = new Set(['set', 'attack', 'cover']);

/** Classifies every touch in a rally into a TouchPhase, keyed by touch id. */
export function classifyRallyTouchPhases(rally: RallyStats): Map<string, TouchPhase> {
  const result = new Map<string, TouchPhase>();
  const { servingTeam, touches } = rally;
  if (!servingTeam || !touches || touches.length === 0) return result;

  const receivingTeam = oppositeTeam(servingTeam);
  const sorted = touches
    .slice()
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber || a.createdAt - b.createdAt);

  const servingSeen = new Set<string>();
  const receivingSeen = new Set<string>();

  for (const touch of sorted) {
    if (touch.skill === 'serve') {
      result.set(touch.id, 'break_point');
      continue;
    }
    if (touch.skill === 'receive') {
      result.set(touch.id, 'point');
      continue;
    }

    if (touch.teamSide === servingTeam) {
      const occurrenceKey = touch.skill === 'freeball' ? 'dig' : touch.skill;
      if (SERVING_FIRST_TOUCH_SKILLS.has(touch.skill) && !servingSeen.has(occurrenceKey)) {
        servingSeen.add(occurrenceKey);
        result.set(touch.id, 'break_point');
      } else {
        result.set(touch.id, 'transition_break_point');
      }
      continue;
    }

    if (touch.teamSide === receivingTeam) {
      if (RECEIVING_FIRST_TOUCH_SKILLS.has(touch.skill) && !receivingSeen.has(touch.skill)) {
        receivingSeen.add(touch.skill);
        result.set(touch.id, 'point');
      } else {
        result.set(touch.id, 'transition_point');
      }
      continue;
    }

    result.set(touch.id, 'transition_point');
  }

  return result;
}

/** Filters touches across rallies by the shared active phase filter (touch-level). */
export function filterTouchesByPhase(
  rallies: readonly RallyStats[],
  phase: TouchPhase | 'all',
): BallTouch[] {
  if (phase === 'all') {
    return rallies.flatMap((r) => r.touches);
  }

  const result: BallTouch[] = [];
  for (const rally of rallies) {
    const phaseMap = classifyRallyTouchPhases(rally);
    for (const touch of rally.touches) {
      if (phaseMap.get(touch.id) === phase) result.push(touch);
    }
  }
  return result;
}
