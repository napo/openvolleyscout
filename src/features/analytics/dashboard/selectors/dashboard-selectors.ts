import { resolveRoleGroup, type RoleGroup } from '@src/components/player-role/player-role';
import type { TeamSide } from '@src/domain/common/enums';
import { countRalliesByPlayer } from '@src/components/player-sort/player-sort';
import type { BallTouch } from '@src/domain/touch/types';
import type {
  MatchStats,
  PlayerStats,
  RallyStats,
  SkillStats,
  TrackedSkill,
} from '@src/features/scouting/model/match-stats';
import {
  createEmptySkillStats,
  TRACKED_SKILLS,
  updateSkillStats,
} from '@src/features/scouting/model/match-stats';
import { filterTouchesByPhase } from '../../rally-phase/rally-phase-classifier';
import { baseCodeList, type DashboardFilters } from '../filters/dashboard-filters';
import { filterTouchesByRallyContext, hasRallyContextFilter, type RallyContextFilters } from './rally-context-filters';

function isTrackedSkill(skill: string): skill is TrackedSkill {
  return (TRACKED_SKILLS as readonly string[]).includes(skill);
}

export function getFilteredRallies(
  stats: MatchStats,
  filters: Pick<DashboardFilters, 'set'>,
): RallyStats[] {
  let rallies = stats.rallyStats;

  if (filters.set.length > 0) {
    rallies = rallies.filter((r) => filters.set.includes(r.setNumber));
  }

  return rallies;
}

export function getFilteredTouches(
  stats: MatchStats,
  filters: Pick<DashboardFilters, 'set' | 'team' | 'source' | 'rallyPhase' | 'evaluations'> & Partial<RallyContextFilters>,
): BallTouch[] {
  const rallies = getFilteredRallies(stats, { set: filters.set });
  // Phase is a per-touch classification (not a whole-rally one), so it's
  // applied here instead of dropping whole rallies in getFilteredRallies.
  let touches = filterTouchesByPhase(rallies, filters.rallyPhase);

  if (filters.team !== 'all') {
    touches = touches.filter((t) => t.teamSide === filters.team);
  }

  if (filters.source === 'explicit') {
    touches = touches.filter((t) => (t.source ?? 'explicit') === 'explicit');
  } else if (filters.source === 'inferred') {
    touches = touches.filter((t) => t.source === 'inferred');
  }

  if (filters.evaluations && filters.evaluations.length > 0) {
    touches = touches.filter((t) => filters.evaluations.includes(t.evaluation as any));
  }

  return filterTouchesByRallyContext(rallies, touches, filters);
}

/** The rally-context part of the dashboard filters, to pass along with the basic ones. */
export function pickRallyContextFilters(filters: DashboardFilters): RallyContextFilters {
  return {
    rotation: filters.rotation,
    scoreRange: filters.scoreRange,
    server: filters.server,
    receiver: filters.receiver,
    attacker: filters.attacker,
    base: baseCodeList(filters.base),
  };
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

export function getTeamsToShow(stats: MatchStats, filters: DashboardFilters): TeamSide[] {
  // Se c'è un giocatore selezionato, mostrare solo la sua squadra di appartenenza
  if (filters.player !== 'all') {
    const selectedPlayer = getSelectedPlayer(stats, filters.player);
    if (selectedPlayer) {
      return [selectedPlayer.teamSide];
    }
  }

  // Senza filtro giocatore, mostrare squadre in base al filtro team
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
  firstName?: string;
  lastName?: string;
  /** Rallies in which the athlete touched the ball. */
  rallies?: number;
  roleGroup?: RoleGroup | null;
};

export function getAvailablePlayers(stats: MatchStats): PlayerOption[] {
  const rallies = countRalliesByPlayer(stats.rallyStats);
  return stats.playerStats
    .filter((p) => !p.playerId.startsWith('__'))
    .map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      teamSide: p.teamSide,
      jerseyNumber: p.jerseyNumber,
      firstName: p.firstName,
      // Without separate names, the last word of the display name stands for the surname.
      lastName: p.lastName ?? p.playerName.trim().split(/\s+/).pop(),
      rallies: rallies.get(p.playerId) ?? 0,
      roleGroup: resolveRoleGroup(p),
    }));
}

export function getSelectedPlayer(
  stats: MatchStats,
  playerId: string,
): PlayerStats | null {
  return stats.playerStats.find((p) => p.playerId === playerId) ?? null;
}

/**
 * Athletes picked on the player-performance page, in the order they were picked.
 * Unknown ids and (on a team page) athletes of the other team are dropped.
 */
export function resolveSelectedPlayers(
  stats: MatchStats,
  playerIds: readonly string[],
  lockedTeam?: TeamSide,
): PlayerStats[] {
  const seen = new Set<string>();
  const result: PlayerStats[] = [];
  for (const id of playerIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const player = getSelectedPlayer(stats, id);
    if (!player || (lockedTeam && player.teamSide !== lockedTeam)) continue;
    result.push(player);
  }
  return result;
}

/** Adds the athlete when absent, removes it when present (multi-select toggle). */
export function togglePlayerId(playerIds: readonly string[], playerId: string): string[] {
  return playerIds.includes(playerId)
    ? playerIds.filter((id) => id !== playerId)
    : [...playerIds, playerId];
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
  const hasEvaluationFilter = filters.evaluations.length < 6; // 6 is the total number of evaluations
  const needsReaggregation =
    filters.set.length > 0
    || filters.source !== 'all'
    || filters.rallyPhase.length > 0
    || filters.player !== 'all'
    || filters.role !== 'all'
    || hasEvaluationFilter
    || hasRallyContextFilter(filters);
  const teamName = stats.teamStats[teamSide].teamName;

  if (!needsReaggregation) {
    const skillStats = TRACKED_SKILLS.reduce((acc, skill) => {
      acc[skill] = stats.teamStats[teamSide][skill];
      return acc;
    }, {} as Record<TrackedSkill, SkillStats>);
    return { teamSide, teamName, skillStats };
  }

  let touches = getFilteredTouches(stats, {
    set: filters.set,
    team: teamSide,
    source: filters.source,
    rallyPhase: filters.rallyPhase,
    evaluations: filters.evaluations,
    ...pickRallyContextFilters(filters),
  });

  if (filters.player !== 'all') {
    touches = touches.filter((t) => t.playerId === filters.player);
  }

  if (filters.role !== 'all') {
    const rolePlayerIds = new Set(
      stats.playerStats
        .filter((p) => p.role === filters.role && p.teamSide === teamSide)
        .map((p) => p.playerId),
    );
    touches = touches.filter((t) => t.playerId != null && rolePlayerIds.has(t.playerId));
  }

  const skillStats = TRACKED_SKILLS.reduce((acc, skill) => {
    acc[skill] = aggregateSkillStatsFromTouches(touches, teamSide, skill);
    return acc;
  }, {} as Record<TrackedSkill, SkillStats>);
  return { teamSide, teamName, skillStats };
}

export function computeFilteredPlayerStats(
  basePlayer: PlayerStats,
  filteredTouches: readonly BallTouch[],
): PlayerStats {
  const playerTouches = filteredTouches.filter(
    (t) => t.playerId === basePlayer.playerId && t.teamSide === basePlayer.teamSide,
  );

  const skillStatsMap: Record<string, ReturnType<typeof createEmptySkillStats>> = {
    serve: createEmptySkillStats(),
    receive: createEmptySkillStats(),
    attack: createEmptySkillStats(),
    block: createEmptySkillStats(),
    dig: createEmptySkillStats(),
    freeball: createEmptySkillStats(),
    set: createEmptySkillStats(),
    cover: createEmptySkillStats(),
  };

  let aces = 0;
  let serveErrors = 0;
  let attackPoints = 0;
  let attackErrors = 0;
  let attackBlocked = 0;
  let receptionErrors = 0;
  let blockPoints = 0;

  for (const touch of playerTouches) {
    const sk = touch.skill as string;
    if (skillStatsMap[sk]) {
      updateSkillStats(skillStatsMap[sk], touch);
    }
    if (touch.skill === 'serve') {
      if (touch.evaluation === '#') aces += 1;
      if (touch.evaluation === '=') serveErrors += 1;
    } else if (touch.skill === 'receive') {
      if (touch.evaluation === '=') receptionErrors += 1;
    } else if (touch.skill === 'attack') {
      if (touch.evaluation === '#') attackPoints += 1;
      if (touch.evaluation === '=') attackErrors += 1;
      if (touch.evaluation === '/') attackBlocked += 1;
    } else if (touch.skill === 'block') {
      if (touch.evaluation === '#') blockPoints += 1;
    }
  }

  const points = aces + attackPoints + blockPoints;
  const errors = serveErrors + attackErrors + receptionErrors;

  return {
    ...basePlayer,
    serve: skillStatsMap['serve'],
    receive: skillStatsMap['receive'],
    attack: skillStatsMap['attack'],
    block: skillStatsMap['block'],
    dig: skillStatsMap['dig'],
    freeball: skillStatsMap['freeball'],
    set: skillStatsMap['set'],
    cover: skillStatsMap['cover'],
    aces,
    serveErrors,
    attackPoints,
    attackErrors,
    attackBlocked,
    receptionErrors,
    blockPoints,
    points,
    errors,
    totalTouches: playerTouches.length,
    winningTouches: aces + attackPoints + blockPoints,
  };
}

export function getFilteredRalliesForSituation(
  stats: MatchStats,
  filters: Pick<DashboardFilters, 'set'>,
): RallyStats[] {
  return getFilteredRallies(stats, filters);
}
