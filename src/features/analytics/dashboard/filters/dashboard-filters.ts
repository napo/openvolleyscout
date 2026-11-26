import type { PlayerRole, TeamSide, SkillEvaluation } from '@src/domain/common/enums';
import type { TrackedSkill, RotationNumber } from '@src/features/scouting/model/match-stats';
import type { TouchPhase } from '../../rally-phase/rally-phase-classifier';

export type DashboardTeamFilter = 'all' | TeamSide;
/**
 * Set, rally phase, rotation and score situation take several values at once, like the Video
 * analysis filters: an empty list means "all of them". (Older shared links carry one value or
 * 'all': see normalizeDashboardFilters.)
 */
export type DashboardSetFilter = number[];
export type DashboardPlayerFilter = 'all' | string;
export type DashboardRoleFilter = 'all' | PlayerRole;
export type DashboardSourceFilter = 'all' | 'explicit' | 'inferred';
export type DashboardRallyPhaseFilter = TouchPhase[];
export type DashboardSkillFilter = 'all' | TrackedSkill;
export type DashboardEvaluationFilter = SkillEvaluation[];

// Advanced filters for tactical analysis
export type DashboardRotationFilter = RotationNumber[];
export type ScoreSituation = 'tied' | 'leading' | 'trailing' | 'clutch';
export type DashboardScoreRangeFilter = ScoreSituation[];
export type DashboardServerFilter = 'all' | string;  // playerId of server
export type DashboardReceiverFilter = 'all' | string;  // playerId of receiver
export type DashboardAttackerFilter = 'all' | string;  // playerId of attacker
export type DashboardBaseFilter = 'all' | string;  // base / combination code (K1...Kn, X5...)

export const ALL_EVALUATIONS: readonly SkillEvaluation[] = ['=', '/', '!', '-', '+', '#'];

export interface DashboardFilters {
  // Basic filters
  team: DashboardTeamFilter;
  set: DashboardSetFilter;
  player: DashboardPlayerFilter;
  role: DashboardRoleFilter;
  source: DashboardSourceFilter;
  rallyPhase: DashboardRallyPhaseFilter;
  skill: DashboardSkillFilter;
  evaluations: DashboardEvaluationFilter;

  // Advanced tactical filters
  rotation: DashboardRotationFilter;
  scoreRange: DashboardScoreRangeFilter;
  server: DashboardServerFilter;
  receiver: DashboardReceiverFilter;
  attacker: DashboardAttackerFilter;
  /** Rallies in which the team played this base / combination (set or attack). */
  base: DashboardBaseFilter;
}

export const PLAYER_ROLES: readonly PlayerRole[] = [
  'setter',
  'outside_hitter',
  'middle_blocker',
  'opposite',
  'libero',
  'defensive_specialist',
];

export function createDefaultFilters(): DashboardFilters {
  return {
    team: 'all',
    set: [],
    player: 'all',
    role: 'all',
    source: 'all',
    rallyPhase: [],
    skill: 'all',
    evaluations: [...ALL_EVALUATIONS],
    rotation: [],
    scoreRange: [],
    server: 'all',
    receiver: 'all',
    attacker: 'all',
    base: 'all',
  };
}

/** Whether a value passes a multi-value filter: an empty filter lets everything through. */
export function matchesAny<T>(selected: readonly T[] | undefined, value: T | null | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  return value !== null && value !== undefined && selected.includes(value);
}

/** One value, 'all' or a list, as a list (what older shared links and saved filters hold). */
function toList<T>(value: unknown, isValid: (item: unknown) => item is T): T[] {
  if (Array.isArray(value)) return value.filter(isValid);
  return isValid(value) ? [value] : [];
}

/**
 * Filters read from outside (a shared link, saved filters) as the app holds them today: the
 * single values of older versions become lists.
 */
export function normalizeDashboardFilters<T extends DashboardFilters>(filters: T): T {
  const raw = filters as unknown as Record<string, unknown>;
  return {
    ...filters,
    set: toList(raw.set, (item): item is number => typeof item === 'number' && Number.isFinite(item)),
    rallyPhase: toList(raw.rallyPhase, (item): item is TouchPhase => typeof item === 'string' && item !== 'all'),
    rotation: toList(raw.rotation, (item): item is RotationNumber => typeof item === 'number' && item >= 1 && item <= 6),
    scoreRange: toList(raw.scoreRange, (item): item is ScoreSituation => item === 'tied' || item === 'leading' || item === 'trailing' || item === 'clutch'),
  };
}

export function isDefaultFilters(filters: DashboardFilters): boolean {
  const defaultEvaluations = [...ALL_EVALUATIONS];
  const evaluationsMatch =
    filters.evaluations.length === defaultEvaluations.length &&
    filters.evaluations.every(e => defaultEvaluations.includes(e));

  return (
    filters.team === 'all'
    && filters.set.length === 0
    && filters.player === 'all'
    && filters.role === 'all'
    && filters.source === 'all'
    && filters.rallyPhase.length === 0
    && filters.skill === 'all'
    && evaluationsMatch
    && filters.rotation.length === 0
    && filters.scoreRange.length === 0
    && filters.server === 'all'
    && filters.receiver === 'all'
    && filters.attacker === 'all'
    && (filters.base ?? 'all') === 'all'
  );
}

// Basic filter helpers
export function hasRallyPhaseFilter(filters: DashboardFilters): boolean {
  return filters.rallyPhase.length > 0;
}

export function hasPlayerFilter(filters: DashboardFilters): boolean {
  return filters.player !== 'all';
}

export function hasTeamFilter(filters: DashboardFilters): boolean {
  return filters.team !== 'all';
}

export function hasSetFilter(filters: DashboardFilters): boolean {
  return filters.set.length > 0;
}

export function hasRoleFilter(filters: DashboardFilters): boolean {
  return filters.role !== 'all';
}

export function hasSourceFilter(filters: DashboardFilters): boolean {
  return filters.source !== 'all';
}

export function hasEvaluationFilter(filters: DashboardFilters): boolean {
  return filters.evaluations.length < ALL_EVALUATIONS.length;
}

// Advanced filter helpers
export function hasRotationFilter(filters: DashboardFilters): boolean {
  return filters.rotation.length > 0;
}

export function hasScoreRangeFilter(filters: DashboardFilters): boolean {
  return filters.scoreRange.length > 0;
}

export function hasServerFilter(filters: DashboardFilters): boolean {
  return filters.server !== 'all';
}

export function hasReceiverFilter(filters: DashboardFilters): boolean {
  return filters.receiver !== 'all';
}

export function hasAttackerFilter(filters: DashboardFilters): boolean {
  return filters.attacker !== 'all';
}

export function getActiveFilterCount(filters: DashboardFilters): number {
  return [
    filters.team !== 'all',
    filters.set.length > 0,
    filters.player !== 'all',
    filters.role !== 'all',
    filters.source !== 'all',
    filters.rallyPhase.length > 0,
    hasEvaluationFilter(filters),
    filters.rotation.length > 0,
    filters.scoreRange.length > 0,
    filters.server !== 'all',
    filters.receiver !== 'all',
    filters.attacker !== 'all',
    (filters.base ?? 'all') !== 'all',
  ].filter(Boolean).length;
}

export type { TrackedSkill };
export type { TouchPhase } from '../../rally-phase/rally-phase-classifier';
export { TOUCH_PHASES } from '../../rally-phase/rally-phase-classifier';
