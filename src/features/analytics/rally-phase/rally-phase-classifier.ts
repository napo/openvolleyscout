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
 * Classification priority (most specific wins):
 *   freeball → attack_after_receive → attack_after_dig → counterattack →
 *   transition_attack → side_out | break_point → unknown
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
  const hasFreeballTouch = sorted.some((t) => t.skill === 'freeball');
  if (hasFreeballTouch) {
    return 'freeball';
  }

  // Find the winning team's attacks in sequence
  const winnerAttacks = sorted.filter(
    (t) => t.teamSide === pointWinner && t.skill === 'attack',
  );

  if (winnerAttacks.length === 0) {
    // Point won without winner's attack: serve ace, opponent error, block point
    return pointWinner === receivingTeam ? 'side_out' : 'break_point';
  }

  const lastWinnerAttack = winnerAttacks[winnerAttacks.length - 1];

  // Find the most recent winner touch before the last attack that is NOT a set pass
  // (sets are bridging touches — they don't define the phase context)
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

  // Counterattack: serving team wins AND the opponent already attacked before
  const opponentAttacks = sorted.filter(
    (t) => t.teamSide !== pointWinner && t.skill === 'attack',
  );
  if (pointWinner === servingTeam && opponentAttacks.length > 0) {
    return 'counterattack';
  }

  // Transition attack: winner attacked but path is ambiguous
  if (winnerAttacks.length > 0) {
    return 'transition_attack';
  }

  return pointWinner === receivingTeam ? 'side_out' : 'break_point';
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
