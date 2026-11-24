// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { AttackerDirectionPhase, SetterDistributionServeType } from '@src/domain/opponent-report/types';
import type { BallTouch } from '@src/domain/touch/types';
import {
  BACK_ROW_ZONE_MAP,
  blockersAfterAttack,
  isHighBall,
  previousSet,
} from '@src/features/analytics/attack-context/attack-context';
import {
  matchesScoreSituation,
  type ScoreSituation,
} from '@src/features/analytics/dashboard/selectors/rally-context-filters';
import {
  classifyAttackPrecedingContext,
  classifyRallyTouchPhases,
  type TouchPhase,
} from '@src/features/analytics/rally-phase/rally-phase-classifier';
import { attackZoneNumber } from '@src/features/analytics/sideout/sideout-distribution';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { VideoEventEntry } from './video-event-index';
import { isLateInSet } from '@src/features/analytics/score-situation/score-situation-settings';

/**
 * Contextual video filters: a team in focus, a phase, a chain of skills, each
 * with its own attributes, and the rally context (set, rotation, score, outcome).
 *
 * Chain: the chosen skills are put in rally order (serve, receive, set, attack,
 * block, dig, ...). The list shows the actions of the LAST skill of the chain,
 * kept only when, earlier in the same rally and in that order, there are actions
 * matching the previous skills with their attributes. E.g. serve (jump float) +
 * attack (zone 4) shows the zone-4 attacks of rallies served with a jump float.
 * Team, phase and rally context apply to the actions shown.
 *
 * Works the same on one match and on several aggregated ones: rallies are told
 * apart by `matchKey`, and each entry may carry the side of the team in focus.
 */

export const VIDEO_CHAIN_SKILL_ORDER: readonly SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];

/** Who performs the actions shown. `focus`/`opponent` need entries with `focusSide` (several matches). */
export type VideoTeamScope = 'all' | TeamSide | 'focus' | 'opponent';

export interface VideoSkillAttributes {
  playerIds?: string[];
  evaluations?: SkillEvaluation[];
  /** Serve: serve type groups. */
  serveTypes?: SetterDistributionServeType[];
  /** Serve: DataVolley start zones (1, 9, 6, 7, 5). */
  serveStartZones?: string[];
  /** Serve and receive: zone (1-9) the serve went to / was received in. */
  targetZones?: string[];
  /** Attack: situation, as in the tactical report (after reception, after dig, high ball, late in the set). */
  attackSituations?: AttackerDirectionPhase[];
  /** Attack: start zone (1-6, back-row zones mapped to 1/6/5 as in the tactical report). */
  attackZones?: string[];
  /** Attack: number of blockers faced (0-3). */
  blockers?: number[];
}

export interface VideoChainFilters {
  team: VideoTeamScope;
  setNumbers: number[];
  phases: TouchPhase[];
  /** Setter position (1-6) of the touching team. */
  rotations: number[];
  /** Score before the rally, seen from the touching team. */
  scoreSituations: ScoreSituation[];
  rallyOutcome: 'all' | 'won' | 'lost';
  /** Skills of the chain (any order; applied in rally order). Empty: every skill. */
  chain: SkillType[];
  /** Attributes per skill; `any` applies when the chain is empty. */
  attributes: Partial<Record<SkillType | 'any', VideoSkillAttributes>>;
}

export function createDefaultVideoChainFilters(): VideoChainFilters {
  return {
    team: 'all',
    setNumbers: [],
    phases: [],
    rotations: [],
    scoreSituations: [],
    rallyOutcome: 'all',
    chain: [],
    attributes: {},
  };
}

/** An action as the chain filters see it: the index entry plus what they derive from its rally. */
export interface VideoChainEntry<E extends VideoEventEntry = VideoEventEntry> {
  entry: E;
  /** Rally identity across matches. */
  rallyKey: string;
  /** Position within the rally (rally order). */
  order: number;
  phase: TouchPhase | null;
  /** Points needed to win the set: 25, or 15 in a deciding set. */
  setTargetPoints: number;
  focusSide?: TeamSide;
  attack?: {
    situations: AttackerDirectionPhase[];
    zone: string | null;
    blockers: number | null;
  };
}

type Annotatable = VideoEventEntry & { matchKey?: string; focusSide?: TeamSide };

function sortTouches(touches: readonly BallTouch[]): BallTouch[] {
  return [...touches].sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.createdAt - right.createdAt);
}

/**
 * Derives, once per list of entries, what the filters need: phase, set target,
 * rally order and the attack description shared with the tactical report.
 */
export function annotateVideoEntries<E extends Annotatable>(entries: readonly E[]): VideoChainEntry<E>[] {
  const byRally = new Map<string, E[]>();
  for (const entry of entries) {
    const key = `${entry.matchKey ?? ''}|${entry.setNumber}|${entry.rallyNumber}`;
    const list = byRally.get(key);
    if (list) list.push(entry);
    else byRally.set(key, [entry]);
  }

  // Set target from the final score: a set won with fewer than 25 points was a deciding set to 15.
  const finalScore = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.matchKey ?? ''}|${entry.setNumber}`;
    const reached = Math.max(entry.homeScore, entry.awayScore) + (entry.rallyWinner ? 1 : 0);
    finalScore.set(key, Math.max(finalScore.get(key) ?? 0, reached));
  }

  const result = new Map<E, VideoChainEntry<E>>();
  for (const [rallyKey, rallyEntries] of byRally) {
    const first = rallyEntries[0];
    const touches = sortTouches(rallyEntries.map((entry) => entry.touch));
    const rally: RallyStats = {
      setNumber: first.setNumber,
      rallyNumber: first.rallyNumber,
      touches,
      dataVolleyCode: '',
      servingTeam: first.servingTeam,
      pointWinner: first.rallyWinner ?? null,
      terminalReason: null,
    };
    const phases = classifyRallyTouchPhases(rally);
    const preceding = classifyAttackPrecedingContext(rally);
    const target = (finalScore.get(`${first.matchKey ?? ''}|${first.setNumber}`) ?? 25) < 25 ? 15 : 25;
    const lateInSet = isLateInSet(first.homeScore, first.awayScore, target);
    const orderOf = new Map(touches.map((touch, index) => [touch.id, index]));

    for (const entry of rallyEntries) {
      const index = orderOf.get(entry.touch.id) ?? 0;
      let attack: VideoChainEntry['attack'];
      if (entry.skill === 'attack') {
        const context = preceding.get(entry.touch.id);
        const situations: AttackerDirectionPhase[] = [];
        if (context === 'receive') situations.push('after_receive');
        if (context === 'dig') situations.push('after_dig');
        if (isHighBall(previousSet(touches, index, entry.teamSide), entry.touch)) situations.push('high_ball');
        if (lateInSet) situations.push('late_set');
        const rawZone = attackZoneNumber(entry.touch);
        const blockers = entry.touch.numBlockers ?? blockersAfterAttack(touches, index, entry.teamSide);
        attack = {
          situations,
          zone: rawZone === null ? null : String(BACK_ROW_ZONE_MAP[rawZone] ?? rawZone),
          blockers: blockers ?? null,
        };
      }
      result.set(entry, {
        entry,
        rallyKey,
        order: index,
        phase: phases.get(entry.touch.id) ?? null,
        setTargetPoints: target,
        focusSide: entry.focusSide,
        attack,
      });
    }
  }
  return entries.map((entry) => result.get(entry)!);
}

function includesOrEmpty<T>(selected: readonly T[] | undefined, value: T | null | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  return value !== null && value !== undefined && selected.includes(value);
}

/** Whether an action matches the attributes chosen for its skill. */
export function matchesSkillAttributes(item: VideoChainEntry, attributes: VideoSkillAttributes | undefined): boolean {
  if (!attributes) return true;
  const { entry } = item;
  if (!includesOrEmpty(attributes.playerIds, entry.playerId)) return false;
  if (!includesOrEmpty(attributes.evaluations, entry.evaluation)) return false;
  if (!includesOrEmpty(attributes.serveTypes, entry.serveType)) return false;
  if (!includesOrEmpty(attributes.serveStartZones, entry.serveStartZone)) return false;
  if (!includesOrEmpty(attributes.targetZones, entry.serveTargetZone)) return false;
  if (attributes.attackSituations?.length && !attributes.attackSituations.some((situation) => item.attack?.situations.includes(situation))) {
    return false;
  }
  if (!includesOrEmpty(attributes.attackZones, item.attack?.zone)) return false;
  if (!includesOrEmpty(attributes.blockers, item.attack?.blockers)) return false;
  return true;
}

function matchesTeam(item: VideoChainEntry, team: VideoTeamScope): boolean {
  const side = item.entry.teamSide;
  if (team === 'all') return true;
  if (team === 'home' || team === 'away') return side === team;
  if (!item.focusSide) return false;
  return team === 'focus' ? side === item.focusSide : side !== item.focusSide;
}

/** Team, set, phase, rotation, score and outcome of the action shown. */
function matchesContext(item: VideoChainEntry, filters: VideoChainFilters): boolean {
  const { entry } = item;
  if (!matchesTeam(item, filters.team)) return false;
  if (!includesOrEmpty(filters.setNumbers, entry.setNumber)) return false;
  if (!includesOrEmpty(filters.phases, item.phase)) return false;
  if (!includesOrEmpty(filters.rotations, entry.setterPosition)) return false;
  if (filters.scoreSituations.length > 0) {
    const own = entry.teamSide === 'home' ? entry.homeScore : entry.awayScore;
    const opponent = entry.teamSide === 'home' ? entry.awayScore : entry.homeScore;
    if (!filters.scoreSituations.some((situation) => matchesScoreSituation(own, opponent, item.setTargetPoints, situation))) {
      return false;
    }
  }
  if (filters.rallyOutcome !== 'all') {
    if (!entry.rallyWinner) return false;
    const won = entry.rallyWinner === entry.teamSide;
    if ((filters.rallyOutcome === 'won') !== won) return false;
  }
  return true;
}

export function orderVideoChain(chain: readonly SkillType[]): SkillType[] {
  return VIDEO_CHAIN_SKILL_ORDER.filter((skill) => chain.includes(skill));
}

export function applyVideoChainFilters<E extends VideoEventEntry>(
  items: readonly VideoChainEntry<E>[],
  filters: VideoChainFilters,
): E[] {
  const chain = orderVideoChain(filters.chain);
  if (chain.length === 0) {
    return items
      .filter((item) => matchesContext(item, filters) && matchesSkillAttributes(item, filters.attributes.any))
      .map((item) => item.entry);
  }

  const targetSkill = chain[chain.length - 1];
  const predecessors = chain.slice(0, -1);
  const byRally = new Map<string, VideoChainEntry<E>[]>();
  for (const item of items) {
    const list = byRally.get(item.rallyKey);
    if (list) list.push(item);
    else byRally.set(item.rallyKey, [item]);
  }
  for (const list of byRally.values()) list.sort((left, right) => left.order - right.order);

  return items
    .filter((item) => {
      if (item.entry.skill !== targetSkill) return false;
      if (!matchesSkillAttributes(item, filters.attributes[targetSkill])) return false;
      if (!matchesContext(item, filters)) return false;
      if (predecessors.length === 0) return true;
      // Each previous skill needs a matching action earlier in the rally, in rally order.
      const rally = byRally.get(item.rallyKey) ?? [];
      let next = 0;
      for (const candidate of rally) {
        if (candidate.order >= item.order) break;
        const skill = predecessors[next];
        if (candidate.entry.skill === skill && matchesSkillAttributes(candidate, filters.attributes[skill])) {
          next += 1;
          if (next === predecessors.length) return true;
        }
      }
      return false;
    })
    .map((item) => item.entry);
}
