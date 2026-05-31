import type { PlayerRole, TeamSide, SkillEvaluation } from '@src/domain/common/enums';
import type { TrackedSkill, RotationNumber } from '@src/features/scouting/model/match-stats';
import type { RallyPhase } from '../../rally-phase/rally-phase-classifier';

export type DashboardTeamFilter = 'all' | TeamSide;
export type DashboardSetFilter = 'all' | number;
export type DashboardPlayerFilter = 'all' | string;
export type DashboardRoleFilter = 'all' | PlayerRole;
export type DashboardSourceFilter = 'all' | 'explicit' | 'inferred';
export type DashboardRallyPhaseFilter = 'all' | RallyPhase;
export type DashboardSkillFilter = 'all' | TrackedSkill;
export type DashboardEvaluationFilter = SkillEvaluation[];

// Advanced filters for tactical analysis
export type DashboardRotationFilter = 'all' | RotationNumber;
export type DashboardScoreRangeFilter = 'all' | 'tied' | 'leading' | 'trailing' | 'clutch';
export type DashboardServerFilter = 'all' | string;  // playerId of server
export type DashboardReceiverFilter = 'all' | string;  // playerId of receiver
export type DashboardAttackerFilter = 'all' | string;  // playerId of attacker

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
    set: 'all',
    player: 'all',
    role: 'all',
    source: 'all',
    rallyPhase: 'all',
    skill: 'all',
    evaluations: [...ALL_EVALUATIONS],
    rotation: 'all',
    scoreRange: 'all',
    server: 'all',
    receiver: 'all',
    attacker: 'all',
  };
}

export function isDefaultFilters(filters: DashboardFilters): boolean {
  const defaultEvaluations = [...ALL_EVALUATIONS];
  const evaluationsMatch =
    filters.evaluations.length === defaultEvaluations.length &&
    filters.evaluations.every(e => defaultEvaluations.includes(e));

  return (
    filters.team === 'all'
    && filters.set === 'all'
    && filters.player === 'all'
    && filters.role === 'all'
    && filters.source === 'all'
    && filters.rallyPhase === 'all'
    && filters.skill === 'all'
    && evaluationsMatch
    && filters.rotation === 'all'
    && filters.scoreRange === 'all'
    && filters.server === 'all'
    && filters.receiver === 'all'
    && filters.attacker === 'all'
  );
}

// Basic filter helpers
export function hasRallyPhaseFilter(filters: DashboardFilters): boolean {
  return filters.rallyPhase !== 'all';
}

export function hasPlayerFilter(filters: DashboardFilters): boolean {
  return filters.player !== 'all';
}

export function hasTeamFilter(filters: DashboardFilters): boolean {
  return filters.team !== 'all';
}

export function hasSetFilter(filters: DashboardFilters): boolean {
  return filters.set !== 'all';
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
  return filters.rotation !== 'all';
}

export function hasScoreRangeFilter(filters: DashboardFilters): boolean {
  return filters.scoreRange !== 'all';
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
    filters.set !== 'all',
    filters.player !== 'all',
    filters.role !== 'all',
    filters.source !== 'all',
    filters.rallyPhase !== 'all',
    hasEvaluationFilter(filters),
    filters.rotation !== 'all',
    filters.scoreRange !== 'all',
    filters.server !== 'all',
    filters.receiver !== 'all',
    filters.attacker !== 'all',
  ].filter(Boolean).length;
}

export type { TrackedSkill };
export type { RallyPhase } from '../../rally-phase/rally-phase-classifier';
export { RALLY_PHASES } from '../../rally-phase/rally-phase-classifier';
