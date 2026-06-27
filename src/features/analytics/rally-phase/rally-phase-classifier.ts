import type { TeamSide } from '@src/domain/common/enums';
import type { RallyStats } from '@src/features/scouting/model/match-stats';

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

  const sorted = touches
    .slice()
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber || a.createdAt - b.createdAt);

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

  if (winnerAttacks.length > 0) {
    return 'transition_attack';
  }

  return pointWinner === receivingTeam ? 'side_out' : 'break_point';
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
