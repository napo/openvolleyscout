// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zone analysis ("Analisi zone" in DataVolley, manual p. 121-122): the attacks of a team
 * drawn on a half court, one box per start zone, with four chosen values per zone and
 * the players who attacked from it.
 *
 * Two ways to place an attack:
 *  - classic: the zone the attack really started from;
 *  - served attacker: the zone of the attacker the combination was meant for
 *    (F = 4, C = 3, B = 2 for front-row attacks), so a cross from 2 to 3 counts in zone 2.
 *    Combinations aimed at the setter go to a separate box between zones 6 and 1.
 *
 * Runs under ts-node too: relative and type-only imports only.
 */
import { matchesChoice } from '@src/lib/utils/choice-list';
import type { SkillEvaluation, TeamSide } from '../../../domain/common/enums';
import type { BallTouch } from '../../../domain/touch/types';
import { hasPlaceholderZones } from '../../../domain/touch/types';
import { getActiveIndicators } from '../../scouting/model/indicator-settings';
import type { DataVolleyCodeTables } from '../../../domain/match/code-tables';
import { findAttackCombination } from '../../../domain/match/code-tables';
import type { MatchStats, RallyStats, RotationNumber } from '../../scouting/model/match-stats';
import type { RoleGroup } from '../../../components/player-role/player-role';
import { getZoneCode } from '../../scouting/model/datavolley-code';
import { classifyRallyTouchPhases } from '../rally-phase/rally-phase-classifier';

/** The six court zones in drawing order (front row 4-3-2, back row 5-6-1), plus the setter box. */
export const ZONE_ANALYSIS_ZONES = ['4', '3', '2', '5', '6', '1'] as const;
/** The nine DataVolley zones in drawing order: 4-3-2 at the net, 7-8-9 in the middle, 5-6-1 at the back. */
export const ZONE_ANALYSIS_ZONES_9 = ['4', '3', '2', '7', '8', '9', '5', '6', '1'] as const;
export type ZoneAnalysisCourtZone = (typeof ZONE_ANALYSIS_ZONES_9)[number];
export type ZoneAnalysisZone = ZoneAnalysisCourtZone | 'setter';
/** 6 zones as DataVolley draws them (7/8/9 counted in 5/6/1), or all 9. */
export type ZoneAnalysisGrid = 6 | 9;

export function zoneAnalysisCourtZones(grid: ZoneAnalysisGrid): readonly ZoneAnalysisCourtZone[] {
  return grid === 9 ? ZONE_ANALYSIS_ZONES_9 : ZONE_ANALYSIS_ZONES;
}

export type ZoneAnalysisMode = 'classic' | 'served';
export type ZoneAnalysisPhase = 'all' | 'reception' | 'transition';

export const ZONE_ANALYSIS_VALUES = [
  'total',
  'totalPct',
  'kills',
  'killPct',
  'errors',
  'blocked',
  'efficiency',
  'pointsWon',
  'pointsLost',
] as const;
export type ZoneAnalysisValue = (typeof ZONE_ANALYSIS_VALUES)[number];

/** DataVolley's own default: total, total %, points won, points lost. */
export const DEFAULT_ZONE_ANALYSIS_VALUES: [ZoneAnalysisValue, ZoneAnalysisValue, ZoneAnalysisValue, ZoneAnalysisValue] = [
  'total', 'totalPct', 'pointsLost', 'pointsWon',
];

export interface ZoneAnalysisFilters {
  team: TeamSide;
  mode: ZoneAnalysisMode;
  grid: ZoneAnalysisGrid;
  phase: ZoneAnalysisPhase;
  /** Sets and rotations studied; an empty list means all of them. */
  setNumbers: number[];
  rotations: RotationNumber[];
  /** The attackers studied (empty or 'all' = everyone; older versions saved one id). */
  playerId: string | string[];
  /** Attacker roles kept (empty = every role). */
  roles: RoleGroup[];
  evaluations: SkillEvaluation[];
}

export function createDefaultZoneAnalysisFilters(team: TeamSide = 'home'): ZoneAnalysisFilters {
  return { team, mode: 'classic', grid: 9, phase: 'all', setNumbers: [], rotations: [], playerId: 'all', roles: [], evaluations: [] };
}

/** One attack with everything the filters and the zones need. */
export interface ZoneAnalysisAttack {
  touch: BallTouch;
  setNumber: number;
  rallyNumber: number;
  teamSide: TeamSide;
  rotation: RotationNumber | null;
  phase: Exclude<ZoneAnalysisPhase, 'all'>;
  /** Zone (1-9) the attack really started from, null when not recorded. */
  realZone: ZoneAnalysisZone | null;
  /** Zone of the served attacker; equals realZone when the combination says nothing more. */
  servedZone: ZoneAnalysisZone | null;
  rallyWon: boolean | null;
}

export interface ZoneAnalysisPlayerCount {
  playerId: string;
  count: number;
}

export interface ZoneAnalysisBox {
  zone: ZoneAnalysisZone;
  attacks: ZoneAnalysisAttack[];
  values: Record<ZoneAnalysisValue, number | null>;
  players: ZoneAnalysisPlayerCount[];
}

export interface ZoneAnalysisResult {
  total: number;
  boxes: Record<ZoneAnalysisZone, ZoneAnalysisBox>;
  /** Attacks with no start zone: DataVolley lists them in a grey row above the court. */
  noZone: ZoneAnalysisBox;
}

/** On the 6-zone court the middle zones 7, 8, 9 belong to the 5, 6, 1 boxes. */
const FOLD: Record<ZoneAnalysisZone, ZoneAnalysisZone> = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '5', 8: '6', 9: '1', setter: 'setter',
};

function realStartZone(touch: BallTouch, tables: DataVolleyCodeTables): string | null {
  // Same reading as the side-out study: the DataVolley start zone, else the drawn origin.
  // A button-input touch only has a placeholder zone: do not read it as the real start zone.
  const code = hasPlaceholderZones(touch)
    ? undefined
    : touch.startZoneCode ?? getZoneCode(touch.originZone ?? touch.direction?.start ?? touch.zone);
  const digit = typeof code === 'string' ? code.trim().charAt(0) : '';
  if (/^[1-9]$/.test(digit)) return digit;
  const combo = findAttackCombination(tables, touch.combinationCode);
  return combo?.startZone ? String(combo.startZone) : null;
}

const FRONT_ROW = new Set(['2', '3', '4']);
const SERVED_FRONT: Record<string, ZoneAnalysisZone> = { F: '4', C: '3', B: '2' };

export function servedAttackerZone(
  touch: BallTouch,
  realDigit: string | null,
  tables: DataVolleyCodeTables,
): ZoneAnalysisZone | null {
  const combo = findAttackCombination(tables, touch.combinationCode);
  const target = combo?.targetAttacker;
  if (target === 'S') return 'setter';
  const real = realDigit ? realDigit as ZoneAnalysisCourtZone : null;
  // Only front-row attacks move: a back-row attack is already in its attacker's zone.
  if (target && SERVED_FRONT[target] && (!realDigit || FRONT_ROW.has(realDigit))) return SERVED_FRONT[target];
  return real;
}

export function extractZoneAnalysisAttacks(
  rallies: readonly RallyStats[],
  tables: DataVolleyCodeTables,
): ZoneAnalysisAttack[] {
  const result: ZoneAnalysisAttack[] = [];
  for (const rally of rallies) {
    const phases = classifyRallyTouchPhases(rally);
    for (const touch of rally.touches) {
      if (touch.skill !== 'attack') continue;
      const digit = realStartZone(touch, tables);
      result.push({
        touch,
        setNumber: rally.setNumber,
        rallyNumber: rally.rallyNumber,
        teamSide: touch.teamSide,
        rotation: rally.rotations?.[touch.teamSide] ?? null,
        phase: phases.get(touch.id) === 'point' ? 'reception' : 'transition',
        realZone: digit ? digit as ZoneAnalysisCourtZone : null,
        servedZone: servedAttackerZone(touch, digit, tables),
        rallyWon: rally.pointWinner ? rally.pointWinner === touch.teamSide : null,
      });
    }
  }
  return result;
}

export function filterZoneAnalysisAttacks(
  attacks: readonly ZoneAnalysisAttack[],
  filters: ZoneAnalysisFilters,
  roleOf: (playerId: string | undefined) => RoleGroup | null = () => null,
): ZoneAnalysisAttack[] {
  return attacks.filter((attack) => {
    if (filters.roles.length > 0) {
      const role = roleOf(attack.touch.playerId);
      if (!role || !filters.roles.includes(role)) return false;
    }
    if (attack.teamSide !== filters.team) return false;
    if (filters.phase !== 'all' && attack.phase !== filters.phase) return false;
    if (filters.setNumbers.length > 0 && !filters.setNumbers.includes(attack.setNumber)) return false;
    if (filters.rotations.length > 0 && (attack.rotation === null || !filters.rotations.includes(attack.rotation))) return false;
    if (!matchesChoice(filters.playerId, attack.touch.playerId)) return false;
    if (filters.evaluations.length > 0
      && (!attack.touch.evaluation || !filters.evaluations.includes(attack.touch.evaluation))) return false;
    return true;
  });
}

function computeValues(attacks: readonly ZoneAnalysisAttack[], grandTotal: number): Record<ZoneAnalysisValue, number | null> {
  const total = attacks.length;
  const count = (evaluation: SkillEvaluation) => attacks.filter((a) => a.touch.evaluation === evaluation).length;
  const kills = count('#');
  const errors = count('=');
  const blocked = count('/');
  // The efficiency follows the winning and losing effects chosen in Settings > Analysis
  // (by default kills minus errors and blocked attacks, over the attacks).
  const efficiency = getActiveIndicators().attackEfficiency({
    total,
    positive: 0,
    perfect: kills,
    errors,
    points: kills,
    neutral: attacks.filter((a) => !a.touch.evaluation).length,
    slash: blocked,
    exclamation: count('!'),
    minus: count('-'),
    plus: count('+'),
    hash: kills,
    equal: errors,
  });
  return {
    total,
    totalPct: grandTotal === 0 ? null : total / grandTotal,
    kills,
    killPct: total === 0 ? null : kills / total,
    errors,
    blocked,
    efficiency,
    pointsWon: attacks.filter((a) => a.rallyWon === true).length,
    pointsLost: attacks.filter((a) => a.rallyWon === false).length,
  };
}

function buildBox(zone: ZoneAnalysisZone, attacks: ZoneAnalysisAttack[], grandTotal: number): ZoneAnalysisBox {
  const byPlayer = new Map<string, number>();
  for (const attack of attacks) {
    const id = attack.touch.playerId;
    if (id) byPlayer.set(id, (byPlayer.get(id) ?? 0) + 1);
  }
  const players = [...byPlayer.entries()]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count);
  return { zone, attacks, values: computeValues(attacks, grandTotal), players };
}

export function computeZoneAnalysis(
  attacks: readonly ZoneAnalysisAttack[],
  mode: ZoneAnalysisMode,
  grid: ZoneAnalysisGrid = 6,
): ZoneAnalysisResult {
  const total = attacks.length;
  const groups = new Map<ZoneAnalysisZone | null, ZoneAnalysisAttack[]>();
  for (const attack of attacks) {
    const raw = mode === 'served' ? attack.servedZone : attack.realZone;
    const zone = raw && grid === 6 ? FOLD[raw] : raw;
    const list = groups.get(zone) ?? [];
    list.push(attack);
    groups.set(zone, list);
  }
  const zones: ZoneAnalysisZone[] = [...ZONE_ANALYSIS_ZONES_9, 'setter'];
  const boxes = Object.fromEntries(
    zones.map((zone) => [zone, buildBox(zone, groups.get(zone) ?? [], total)]),
  ) as Record<ZoneAnalysisZone, ZoneAnalysisBox>;
  return { total, boxes, noZone: buildBox('setter', groups.get(null) ?? [], total) };
}

/** Boxes holding the lowest and highest first value (DataVolley: red = low, black = high). */
export function zoneAnalysisExtremes(
  result: ZoneAnalysisResult,
  value: ZoneAnalysisValue,
): { low: ZoneAnalysisZone | null; high: ZoneAnalysisZone | null } {
  // Boxes off the drawn court (7/8/9 on the 6-zone court) are always empty, so they drop out here.
  const candidates = ZONE_ANALYSIS_ZONES_9
    .map((zone) => ({ zone, v: result.boxes[zone].values[value] }))
    .filter((entry): entry is { zone: ZoneAnalysisCourtZone; v: number } =>
      entry.v !== null && result.boxes[entry.zone].attacks.length > 0);
  if (candidates.length < 2) return { low: null, high: null };
  let low = candidates[0];
  let high = candidates[0];
  for (const entry of candidates) {
    if (entry.v < low.v) low = entry;
    if (entry.v > high.v) high = entry;
  }
  if (low.v === high.v) return { low: null, high: null };
  return { low: low.zone, high: high.zone };
}

/** True when at least one attack has a start zone: without zones the analysis has nothing to draw. */
export function hasZoneAnalysisData(stats: Pick<MatchStats, 'rallyStats'>, tables: DataVolleyCodeTables): boolean {
  return extractZoneAnalysisAttacks(stats.rallyStats, tables).some((attack) => attack.realZone !== null);
}
