// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { AttackSubtype, BallTouch } from '@src/domain/touch/types';
import type { TeamSide } from '@src/domain/common/enums';
import type {
  AttackerDirectionPhase,
  SetterDistributionReceptionEval,
} from '@src/domain/opponent-report/types';
// Value imports are relative, so the module stays safe if a node:test file ever reaches it.
import { getAttackSubtypeOrDefault } from '../../../../domain/touch/types';
import { attackZoneNumber } from '../../sideout/sideout-distribution';
import { BACK_ROW_ZONE_MAP, isHighBall, scoreBeforeRallies } from '../../attack-context/attack-context';
import {
  collectAttackCodeOptions,
  matchesAttackCodes,
  resolveTouchAttackCodes,
  type AttackCodeOptions,
} from '../../attack-context/attack-codes';
import { classifyAttackPrecedingContext } from '../../rally-phase/rally-phase-classifier';

/**
 * The attack filters of the heatmap (Analysis > Heatmap). They mirror the groups of the tactical
 * report's attacker views and live only in the heatmap's own state: nothing is saved.
 * Base (setter call of the set before the attack), Combination (the attack's own code) and Set type
 * (the attack's letter) are independent lists, crossed with AND like every other group.
 */
export interface HeatmapAttackFilters {
  phases: AttackerDirectionPhase[];
  receptionEvaluations: SetterDistributionReceptionEval[];
  rotations: number[];
  attackZones: string[];
  attackSubtypes: AttackSubtype[];
  blockers: number[];
  setterCalls: string[];
  combinationCodes: string[];
  attackBallTypes: string[];
}

export const EMPTY_HEATMAP_ATTACK_FILTERS: HeatmapAttackFilters = {
  phases: [],
  receptionEvaluations: [],
  rotations: [],
  attackZones: [],
  attackSubtypes: [],
  blockers: [],
  setterCalls: [],
  combinationCodes: [],
  attackBallTypes: [],
};

const FILTER_FIELDS = Object.keys(EMPTY_HEATMAP_ATTACK_FILTERS) as Array<keyof HeatmapAttackFilters>;

/** How many groups hold a choice (one per non-empty list), for the toggle badge. */
export function countActiveAttackFilters(filters: HeatmapAttackFilters): number {
  return FILTER_FIELDS.reduce((count, field) => count + (filters[field].length > 0 ? 1 : 0), 0);
}

export function hasAnyAttackFilter(filters: HeatmapAttackFilters): boolean {
  return countActiveAttackFilters(filters) > 0;
}

function sortTouches(touches: readonly BallTouch[]): BallTouch[] {
  return [...touches].sort((a, b) => a.sequenceNumber - b.sequenceNumber || a.createdAt - b.createdAt);
}

/**
 * Drops the attacks of `teamSide` that fail a chosen group. Every other touch (other skills, the
 * other team) is kept; a rally with nothing dropped is returned as the same object.
 */
export function filterRalliesByAttackFilters(
  rallies: readonly RallyStats[],
  teamSide: TeamSide,
  attackFilters: HeatmapAttackFilters,
): RallyStats[] {
  if (!hasAnyAttackFilter(attackFilters)) return [...rallies];

  // "Late set" follows the final-phase score of Settings > Analysis, like the tactical report and Video analysis.
  const lateRallies = scoreBeforeRallies(rallies);

  return rallies.map((rally) => {
    const sorted = sortTouches(rally.touches);
    const contexts = classifyAttackPrecedingContext(rally);
    const isLate = Boolean(lateRallies.get(`${rally.setNumber}:${rally.rallyNumber}`));
    const keepIds = new Set<string>();

    for (let i = 0; i < sorted.length; i += 1) {
      const touch = sorted[i];
      if (touch.teamSide !== teamSide || touch.skill !== 'attack') {
        keepIds.add(touch.id);
        continue;
      }

      const preceding = contexts.get(touch.id);
      let prevReceive: BallTouch | undefined;
      let prevSet: BallTouch | undefined;
      for (let j = i - 1; j >= 0; j -= 1) {
        const prev = sorted[j];
        if (prev.teamSide !== teamSide) break;
        if (prev.skill === 'set' && !prevSet) prevSet = prev;
        if (prev.skill === 'receive') {
          prevReceive = prev;
          break;
        }
        if (prev.skill !== 'set' && prev.skill !== 'cover') break;
      }

      const isHigh = isHighBall(prevSet ?? null, touch);

      if (attackFilters.phases.length > 0) {
        const phaseOk = attackFilters.phases.some((phase) => {
          if (phase === 'after_receive') return preceding === 'receive';
          if (phase === 'after_dig') return preceding === 'dig';
          if (phase === 'high_ball') return isHigh;
          if (phase === 'late_set') return isLate;
          return false;
        });
        if (!phaseOk) continue;
      }

      if (attackFilters.receptionEvaluations.length > 0) {
        const recEval = preceding === 'receive' ? prevReceive?.evaluation : undefined;
        if (!recEval || !attackFilters.receptionEvaluations.includes(recEval as SetterDistributionReceptionEval)) continue;
      }

      if (attackFilters.rotations.length > 0) {
        // Only the recorded setter position: the heatmap does not rebuild rotations from the court.
        const rot = teamSide === 'home' ? touch.homeSetterPosition : touch.awaySetterPosition;
        if (!rot || !attackFilters.rotations.includes(rot)) continue;
      }

      if (attackFilters.attackZones.length > 0) {
        const rawZone = attackZoneNumber(touch);
        const normZone = rawZone === null ? null : String(BACK_ROW_ZONE_MAP[rawZone] ?? rawZone);
        if (!normZone || !attackFilters.attackZones.includes(normZone)) continue;
      }

      if (attackFilters.attackSubtypes.length > 0) {
        const subtype = getAttackSubtypeOrDefault(touch);
        if (!subtype || !attackFilters.attackSubtypes.includes(subtype)) continue;
      }

      if (attackFilters.blockers.length > 0) {
        let blockerCount = touch.numBlockers;
        if (blockerCount === undefined) {
          for (let j = i + 1; j < sorted.length; j += 1) {
            if (sorted[j].teamSide === teamSide) continue;
            if (sorted[j].skill === 'block') blockerCount = sorted[j].numBlockers;
            break;
          }
        }
        if (blockerCount === undefined || !attackFilters.blockers.includes(blockerCount)) continue;
      }

      if (!matchesAttackCodes(resolveTouchAttackCodes(sorted, i), attackFilters)) continue;

      keepIds.add(touch.id);
    }

    if (keepIds.size === rally.touches.length) return rally;
    return { ...rally, touches: rally.touches.filter((touch) => keepIds.has(touch.id)) };
  });
}

/**
 * The Base and Combination codes of the attacks of `teamSide` (of one attacker when `playerId` is
 * set and not 'all'), for the two code groups.
 */
export function collectHeatmapAttackCodes(
  rallies: readonly RallyStats[],
  teamSide: TeamSide,
  playerId?: string,
): AttackCodeOptions {
  const byPlayer = Boolean(playerId && playerId !== 'all');
  return collectAttackCodeOptions(
    rallies,
    (touch) => touch.skill === 'attack' && touch.teamSide === teamSide && (!byPlayer || touch.playerId === playerId),
  );
}
