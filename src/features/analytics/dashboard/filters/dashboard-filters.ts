import type { PlayerRole, TeamSide } from '@src/domain/common/enums';
import type { TrackedSkill } from '@src/features/scouting/model/match-stats';
import type { RallyPhase } from '../../rally-phase/rally-phase-classifier';

export type DashboardTeamFilter = 'all' | TeamSide;
export type DashboardSetFilter = 'all' | number;
export type DashboardPlayerFilter = 'all' | string;
export type DashboardRoleFilter = 'all' | PlayerRole;
export type DashboardSourceFilter = 'all' | 'explicit' | 'inferred';
export type DashboardRallyPhaseFilter = 'all' | RallyPhase;

export interface DashboardFilters {
  team: DashboardTeamFilter;
  set: DashboardSetFilter;
  player: DashboardPlayerFilter;
  role: DashboardRoleFilter;
  source: DashboardSourceFilter;
  rallyPhase: DashboardRallyPhaseFilter;
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
  };
}

export function isDefaultFilters(filters: DashboardFilters): boolean {
  return (
    filters.team === 'all'
    && filters.set === 'all'
    && filters.player === 'all'
    && filters.role === 'all'
    && filters.source === 'all'
    && filters.rallyPhase === 'all'
  );
}

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

export function getActiveFilterCount(filters: DashboardFilters): number {
  return [
    filters.team !== 'all',
    filters.set !== 'all',
    filters.player !== 'all',
    filters.role !== 'all',
    filters.source !== 'all',
    filters.rallyPhase !== 'all',
  ].filter(Boolean).length;
}

export type { TrackedSkill };
export type { RallyPhase } from '../../rally-phase/rally-phase-classifier';
export { RALLY_PHASES } from '../../rally-phase/rally-phase-classifier';
