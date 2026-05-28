import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type {
  MatchStats,
  PlayerStats,
  SkillStats,
  TeamStats,
  TrackedSkill,
} from '@src/features/scouting/model/match-stats';
import {
  createEmptySkillStats,
  TRACKED_SKILLS,
  updateSkillStats,
} from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';

function isTrackedSkill(skill: string): skill is TrackedSkill {
  return (TRACKED_SKILLS as readonly string[]).includes(skill);
}

export function getFilteredTouches(
  stats: MatchStats,
  filters: Pick<DashboardFilters, 'set' | 'team' | 'source'>,
): BallTouch[] {
  let touches = stats.rallyStats.flatMap((r) => r.touches);

  if (filters.set !== 'all') {
    touches = touches.filter((t) => t.setNumber === filters.set);
  }

  if (filters.team !== 'all') {
    touches = touches.filter((t) => t.teamSide === filters.team);
  }

  if (filters.source !== 'all') {
    const want = filters.source;
    touches = touches.filter((t) => (t.source ?? 'explicit') === want);
  }

  return touches;
}

export function aggregateSkillStatsFromTouches(
  touches: readonly BallTouch[],
  teamSide: TeamSide,
  skill: TrackedSkill,
): SkillStats {
  const stats = createEmptySkillStats();
  touches
    .filter((t) => t.teamSide === teamSide && t.skill === skill && isTrackedSkill(t.skill))
    .forEach((t) => updateSkillStats(stats, t));
  return stats;
}

export function getSkillStatsForTeam(
  stats: MatchStats,
  filters: DashboardFilters,
  teamSide: TeamSide,
  skill: TrackedSkill,
): SkillStats {
  const needsReaggregation = filters.set !== 'all' || filters.source !== 'all';

  if (!needsReaggregation) {
    return stats.teamStats[teamSide][skill];
  }

  const touches = getFilteredTouches(stats, {
    set: filters.set,
    team: teamSide,
    source: filters.source,
  });
  return aggregateSkillStatsFromTouches(touches, teamSide, skill);
}

export function getFilteredPlayerStats(
  stats: MatchStats,
  filters: DashboardFilters,
): PlayerStats[] {
  let players = stats.playerStats;

  if (filters.team !== 'all') {
    players = players.filter((p) => p.teamSide === filters.team);
  }

  if (filters.player !== 'all') {
    players = players.filter((p) => p.playerId === filters.player);
  }

  if (filters.role !== 'all') {
    players = players.filter((p) => p.role === filters.role);
  }

  return players;
}

export function getTeamsToShow(filters: DashboardFilters): TeamSide[] {
  if (filters.team === 'home') return ['home'];
  if (filters.team === 'away') return ['away'];
  return ['home', 'away'];
}

export function getAvailableSets(stats: MatchStats): number[] {
  return stats.setStats.map((s) => s.setNumber);
}

export type PlayerOption = {
  playerId: string;
  playerName: string;
  teamSide: TeamSide;
  jerseyNumber: number | string;
};

export function getAvailablePlayers(stats: MatchStats): PlayerOption[] {
  return stats.playerStats
    .filter((p) => !p.playerId.startsWith('__'))
    .map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      teamSide: p.teamSide,
      jerseyNumber: p.jerseyNumber,
    }));
}

export function getSelectedPlayer(
  stats: MatchStats,
  playerId: string,
): PlayerStats | null {
  return stats.playerStats.find((p) => p.playerId === playerId) ?? null;
}

export function getTeamPlayerStats(
  stats: MatchStats,
  teamSide: TeamSide,
): PlayerStats[] {
  return stats.playerStats.filter((p) => p.teamSide === teamSide && !p.playerId.startsWith('__'));
}

export type FilteredTeamStats = {
  teamSide: TeamSide;
  teamName: string;
  skillStats: Record<TrackedSkill, SkillStats>;
};

export function getFilteredTeamStats(
  stats: MatchStats,
  filters: DashboardFilters,
  teamSide: TeamSide,
): FilteredTeamStats {
  const needsReaggregation = filters.set !== 'all' || filters.source !== 'all';
  const teamName = stats.teamStats[teamSide].teamName;

  if (!needsReaggregation) {
    const skillStats = TRACKED_SKILLS.reduce((acc, skill) => {
      acc[skill] = stats.teamStats[teamSide][skill];
      return acc;
    }, {} as Record<TrackedSkill, SkillStats>);
    return { teamSide, teamName, skillStats };
  }

  const touches = getFilteredTouches(stats, {
    set: filters.set,
    team: teamSide,
    source: filters.source,
  });
  const skillStats = TRACKED_SKILLS.reduce((acc, skill) => {
    acc[skill] = aggregateSkillStatsFromTouches(touches, teamSide, skill);
    return acc;
  }, {} as Record<TrackedSkill, SkillStats>);
  return { teamSide, teamName, skillStats };
}

export function getTeamStatsForFilters(
  stats: MatchStats,
  filters: DashboardFilters,
): Record<TeamSide, TeamStats> | null {
  if (filters.set !== 'all' || filters.source !== 'all') {
    return null;
  }
  return stats.teamStats;
}
