// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';

/**
 * How an attack is described by the tactical report and the video filters:
 * the touch before it, the set, the blockers facing it, the zone, and whether
 * the set was late. Shared so both read an attack the same way.
 */

export function getPreviousTouch(
  sorted: readonly BallTouch[],
  attackIndex: number,
  teamSide: TeamSide,
  skill: BallTouch['skill'],
): BallTouch | null {
  for (let index = attackIndex - 1; index >= 0; index -= 1) {
    const touch = sorted[index];
    if (touch.teamSide !== teamSide) return null;
    if (touch.skill === 'set' || touch.skill === 'cover') continue;
    return touch.skill === skill ? touch : null;
  }
  return null;
}

export function previousSet(sorted: readonly BallTouch[], attackIndex: number, teamSide: TeamSide): BallTouch | null {
  for (let index = attackIndex - 1; index >= 0; index -= 1) {
    const touch = sorted[index];
    if (touch.teamSide !== teamSide) return null;
    if (touch.skill === 'set') return touch;
    if (touch.skill !== 'cover') return null;
  }
  return null;
}

export function blockersAfterAttack(sorted: readonly BallTouch[], attackIndex: number, teamSide: TeamSide): number | undefined {
  for (let index = attackIndex + 1; index < sorted.length; index += 1) {
    const touch = sorted[index];
    if (touch.teamSide === teamSide) continue;
    return touch.skill === 'block' ? touch.numBlockers : undefined;
  }
  return undefined;
}

export function isHighBall(set: BallTouch | null, attack: BallTouch): boolean {
  return set?.advancedDetails?.set?.tempo === 'high_ball'
    || set?.advancedDetails?.set?.type === 'high_ball'
    || set?.setType === 'high_ball'
    || attack.advancedDetails?.attack?.tempo === 'high_ball';
}

export function scoreBeforeRallies(rallies: readonly RallyStats[]): Map<string, boolean> {
  const scores = new Map<number, { home: number; away: number }>();
  const late = new Map<string, boolean>();
  for (const rally of [...rallies].sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber)) {
    const score = scores.get(rally.setNumber) ?? { home: 0, away: 0 };
    late.set(`${rally.setNumber}:${rally.rallyNumber}`, score.home >= 20 || score.away >= 20);
    if (rally.pointWinner) score[rally.pointWinner] += 1;
    scores.set(rally.setNumber, score);
  }
  return late;
}

export const BACK_ROW_ZONE_MAP: Record<number, number> = { 7: 5, 8: 6, 9: 1 };
