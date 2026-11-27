// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { AttackerDirectionPhase, SetterDistributionServeType } from '@src/domain/opponent-report/types';
import type { BallTouch } from '@src/domain/touch/types';
import {
  BACK_ROW_ZONE_MAP,
  blockersAfterAttack,
  isHighBall,
  previousSet,
} from '../../analytics/attack-context/attack-context';
import {
  matchesScoreSituation,
  type ScoreSituation,
} from '../../analytics/dashboard/selectors/rally-context-filters';
import {
  classifyAttackPrecedingContext,
  classifyRallyTouchPhases,
  type TouchPhase,
} from '../../analytics/rally-phase/rally-phase-classifier';
import { attackZoneNumber } from '../../analytics/sideout/sideout-distribution';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import {
  matchesAttackCodes,
  resolveTouchAttackCodes,
  sortAttackCodes,
} from '../../analytics/attack-context/attack-codes';
import { splitBaseCodeSelection } from '../../../domain/match/code-tables';
import type { VideoEventEntry } from './video-event-index';
import { isLateInSet } from '../../analytics/score-situation/score-situation-settings';

// Relative runtime imports: also run by the node/ts-node tests, which have no @src alias.

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
  /** Attack: set type, the attack's ball type letter (H, M, Q, T, U, N, O). */
  attackBallTypes?: string[];
  /** Set and attack: Base, the setter call (K1...Kn); an attack takes the call of the set before it. */
  setterCalls?: string[];
  /** Attack: the attack's own combination code (X5, V6, ...). */
  combinationCodes?: string[];
}

/** Attributes as saved before Base and Combination were two filters: one mixed list. */
type LegacyVideoSkillAttributes = VideoSkillAttributes & { baseCodes?: unknown };

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
  /**
   * The skill of the chain whose actions are shown; the others must come before or after it
   * in the same rally, in rally order. Missing or not in the chain: the last skill of the chain.
   */
  shown?: SkillType;
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
    /** Set type: the attack's ball type letter (upper case), null when the scout wrote none. */
    ballType: string | null;
  };
  /** Set and attack: the Base (setter call, upper case), null when the scout wrote none. */
  setterCall?: string | null;
  /** Attack: its own combination code (upper case, never a K code), null when it has none. */
  combinationCode?: string | null;
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
      // Same reading as the tactical report, heatmap and Analysis panel (shared resolver).
      const codes = resolveTouchAttackCodes(touches, index);
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
          ballType: codes.ballType,
        };
      }
      result.set(entry, {
        entry,
        rallyKey,
        setterCall: entry.skill === 'set' || entry.skill === 'attack' ? codes.setterCall : undefined,
        combinationCode: entry.skill === 'attack' ? codes.combinationCode : undefined,
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

/** Base codes (setter calls) present in the sets and attacks of the entries, sorted (K2 before K10). */
export function availableSetterCalls(entries: readonly VideoChainEntry[]): string[] {
  return sortAttackCodes(entries.flatMap((item) => (item.setterCall ? [item.setterCall] : [])));
}

/** Combination codes present in the attacks of the entries, sorted (X5 before X9). */
export function availableCombinationCodes(entries: readonly VideoChainEntry[]): string[] {
  return sortAttackCodes(entries.flatMap((item) => (item.entry.skill === 'attack' && item.combinationCode ? [item.combinationCode] : [])));
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
  // Base, Combination and Set type, crossed with AND; the chosen codes are compared ignoring case.
  const codes = {
    setterCall: item.setterCall ?? null,
    combinationCode: item.combinationCode ?? null,
    ballType: item.attack?.ballType ?? null,
  };
  if (!matchesAttackCodes(codes, attributes)) return false;
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

/** The skill whose actions are shown: the one chosen, if it is in the chain, else the last of the chain. */
export function shownVideoSkill(filters: Pick<VideoChainFilters, 'chain' | 'shown'>): SkillType | undefined {
  const chain = orderVideoChain(filters.chain);
  return filters.shown && chain.includes(filters.shown) ? filters.shown : chain.at(-1);
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

  const targetSkill = shownVideoSkill(filters)!;
  const position = chain.indexOf(targetSkill);
  const before = chain.slice(0, position);
  const after = chain.slice(position + 1);
  const byRally = new Map<string, VideoChainEntry<E>[]>();
  for (const item of items) {
    const list = byRally.get(item.rallyKey);
    if (list) list.push(item);
    else byRally.set(item.rallyKey, [item]);
  }
  for (const list of byRally.values()) list.sort((left, right) => left.order - right.order);

  // Whether `links` happen one after the other, in this order, among `candidates`.
  const followsChain = (candidates: readonly VideoChainEntry<E>[], links: readonly SkillType[]): boolean => {
    let next = 0;
    for (const candidate of candidates) {
      if (next === links.length) break;
      const skill = links[next];
      if (candidate.entry.skill === skill && matchesSkillAttributes(candidate, filters.attributes[skill])) next += 1;
    }
    return next === links.length;
  };

  return items
    .filter((item) => {
      if (item.entry.skill !== targetSkill) return false;
      if (!matchesSkillAttributes(item, filters.attributes[targetSkill])) return false;
      if (!matchesContext(item, filters)) return false;
      if (before.length === 0 && after.length === 0) return true;
      // The skills before the one shown happen earlier in the rally, those after it later, in rally order.
      const rally = byRally.get(item.rallyKey) ?? [];
      return followsChain(rally.filter((candidate) => candidate.order < item.order), before)
        && followsChain(rally.filter((candidate) => candidate.order > item.order), after);
    })
    .map((item) => item.entry);
}

/** The skills whose attributes apply (and are shown): the chain, or "any skill" without one. */
function activeAttributeKeys(filters: VideoChainFilters): Array<SkillType | 'any'> {
  const chain = orderVideoChain(filters.chain);
  return chain.length > 0 ? chain : ['any'];
}

/** Whether nothing is filtered. Attributes of skills no longer in the chain do not count: they filter nothing. */
export function isDefaultVideoChainFilters(filters: VideoChainFilters): boolean {
  const attributesEmpty = activeAttributeKeys(filters)
    .map((key) => filters.attributes[key])
    .every((attributes) => !attributes || Object.values(attributes).every((value) => !Array.isArray(value) || value.length === 0));
  return filters.team === 'all'
    && filters.setNumbers.length === 0
    && filters.phases.length === 0
    && filters.rotations.length === 0
    && filters.scoreSituations.length === 0
    && filters.rallyOutcome === 'all'
    && filters.chain.length === 0
    && attributesEmpty;
}

/**
 * Drops the chosen players the filters can no longer show (another team, another match), so no
 * hidden choice keeps filtering. The actions shown follow the team filter; an earlier link of
 * the chain may be either team. `playerIdsFor` gives the players offered for a team scope.
 */
export function pruneVideoChainPlayers(
  filters: VideoChainFilters,
  playerIdsFor: (scope: VideoTeamScope) => ReadonlySet<string>,
): VideoChainFilters {
  const target = shownVideoSkill(filters);
  let changed = false;
  const attributes: VideoChainFilters['attributes'] = {};
  for (const [key, value] of Object.entries(filters.attributes) as Array<[SkillType | 'any', VideoSkillAttributes | undefined]>) {
    if (!value?.playerIds?.length) {
      attributes[key] = value;
      continue;
    }
    const allowed = playerIdsFor(key === 'any' || key === target ? filters.team : 'all');
    const playerIds = value.playerIds.filter((id) => allowed.has(id));
    if (playerIds.length !== value.playerIds.length) changed = true;
    attributes[key] = { ...value, playerIds };
  }
  return changed ? { ...filters, attributes } : filters;
}

type LegacyVideoFilters = {
  team?: 'all' | TeamSide;
  setNumbers?: number[];
  skills?: SkillType[];
  evaluations?: SkillEvaluation[];
  playerIds?: string[];
  phase?: 'all' | 'breakpoint' | 'sideout';
  setterPositions?: number[];
  rallyOutcome?: 'all' | 'won' | 'lost';
  serveStartZones?: string[];
  serveTypes?: SetterDistributionServeType[];
  receptionZones?: string[];
  receiverIds?: string[];
};

const LEGACY_EVALUATION_COUNT = 6;

/**
 * Splits the mixed "Base / Combination" list of saved filters into the two filters. Set and
 * attack cards get the K codes as Base; only the attack card has a Combination filter, so other
 * codes go there on the attack card and are dropped elsewhere (a hidden filter would still
 * filter). Cards without the old list are returned as they are, so this is idempotent.
 */
function migrateVideoAttributes(attributes: VideoChainFilters['attributes'] | undefined): VideoChainFilters['attributes'] {
  const result: VideoChainFilters['attributes'] = {};
  for (const [key, value] of Object.entries(attributes ?? {}) as Array<[SkillType | 'any', LegacyVideoSkillAttributes | undefined]>) {
    if (!value || typeof value !== 'object' || !('baseCodes' in value)) {
      result[key] = value;
      continue;
    }
    const { baseCodes, ...rest } = value;
    const next: VideoSkillAttributes = rest;
    if (key === 'set' || key === 'attack') {
      const split = splitBaseCodeSelection(baseCodes, {
        setterCalls: rest.setterCalls,
        combinationCodes: key === 'attack' ? rest.combinationCodes : undefined,
      });
      if (split.setterCalls.length > 0) next.setterCalls = split.setterCalls;
      if (key === 'attack' && split.combinationCodes.length > 0) next.combinationCodes = split.combinationCodes;
    }
    result[key] = next;
  }
  return result;
}

/**
 * Filters saved before the chain filters (video filter presets): converted so
 * nothing saved is lost. The old phase covered transitions too, the setter
 * position is the rotation, and the serve/receiver filters become the serve and
 * reception links of the chain. Several old skills meant "any of them", which a
 * chain cannot say: then the skill choice is dropped and the rest kept.
 *
 * Chain filters saved with the one mixed "Base / Combination" list are split into the Base
 * (setter calls) and Combination filters, read the same way every time (nothing rewritten).
 */
export function toVideoChainFilters(raw: unknown): VideoChainFilters {
  const defaults = createDefaultVideoChainFilters();
  if (typeof raw !== 'object' || raw === null) return defaults;
  if (Array.isArray((raw as Partial<VideoChainFilters>).chain)) {
    return { ...defaults, ...(raw as Partial<VideoChainFilters>), attributes: migrateVideoAttributes((raw as VideoChainFilters).attributes) };
  }
  const legacy = raw as LegacyVideoFilters;
  const filters: VideoChainFilters = {
    ...defaults,
    team: legacy.team ?? 'all',
    setNumbers: legacy.setNumbers ?? [],
    rotations: legacy.setterPositions ?? [],
    rallyOutcome: legacy.rallyOutcome ?? 'all',
    phases: legacy.phase === 'breakpoint' ? ['break_point', 'transition_break_point']
      : legacy.phase === 'sideout' ? ['point', 'transition_point'] : [],
  };
  const skills = legacy.skills ?? [];
  const shown: SkillType | 'any' = skills.length === 1 ? skills[0] : 'any';
  const evaluations = legacy.evaluations && legacy.evaluations.length < LEGACY_EVALUATION_COUNT ? legacy.evaluations : [];
  const chain: SkillType[] = shown === 'any' ? [] : [shown];
  const attributes: VideoChainFilters['attributes'] = {};
  if (evaluations.length > 0 || (legacy.playerIds ?? []).length > 0) {
    attributes[shown] = { evaluations, playerIds: legacy.playerIds ?? [] };
  }
  const serveFilters = {
    serveTypes: legacy.serveTypes ?? [],
    serveStartZones: legacy.serveStartZones ?? [],
    targetZones: legacy.receptionZones ?? [],
  };
  if (Object.values(serveFilters).some((value) => value.length > 0)) {
    chain.push('serve');
    attributes.serve = { ...attributes.serve, ...serveFilters };
  }
  if ((legacy.receiverIds ?? []).length > 0) {
    chain.push('receive');
    attributes.receive = { ...attributes.receive, playerIds: legacy.receiverIds };
  }
  // Without an explicit skill, the serve/receiver filters become a chain of their own (the serves
  // or receptions of those rallies) rather than being lost.
  return { ...filters, chain, attributes };
}
