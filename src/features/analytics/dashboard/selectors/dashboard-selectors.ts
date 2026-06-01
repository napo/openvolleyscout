import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type {
  MatchStats,
  PlayerStats,
  RallyStats,
  SkillStats,
  TeamStats,
  TrackedSkill,
} from '@src/features/scouting/model/match-stats';
import {
  createEmptySkillStats,
  TRACKED_SKILLS,
  updateSkillStats,
} from '@src/features/scouting/model/match-stats';
import { rallyMatchesPhaseFilter } from '../../rally-phase/rally-phase-classifier';
import type { DashboardFilters } from '../filters/dashboard-filters';

function isTrackedSkill(skill: string): skill is TrackedSkill {
  return (TRACKED_SKILLS as readonly string[]).includes(skill);
}

export function getFilteredRallies(
  stats: MatchStats,
  filters: Pick<DashboardFilters, 'set' | 'rallyPhase'>,
): RallyStats[] {
  let rallies = stats.rallyStats;

  if (filters.set !== 'all') {
    rallies = rallies.filter((r) => r.setNumber === filters.set);
  }

  if (filters.rallyPhase !== 'all') {
    rallies = rallies.filter((r) => rallyMatchesPhaseFilter(r, filters.rallyPhase));
  }

  return rallies;
}

export function getFilteredTouches(
  stats: MatchStats,
  filters: Pick<DashboardFilters, 'set' | 'team' | 'source' | 'rallyPhase' | 'evaluations'>,
): BallTouch[] {
  const rallies = getFilteredRallies(stats, { set: filters.set, rallyPhase: filters.rallyPhase });
  let touches = rallies.flatMap((r) => r.touches);

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
  const hasEvaluationFilter = filters.evaluations.length < 6; // 6 is the total number of evaluations
  const hasAdvancedFilter = filters.rotation !== 'all' || filters.scoreRange !== 'all' ||
                            filters.server !== 'all' || filters.receiver !== 'all' ||
                            filters.attacker !== 'all';
  const needsReaggregation = filters.set !== 'all' || filters.source !== 'all' || filters.rallyPhase !== 'all' ||
                             hasEvaluationFilter || hasAdvancedFilter;

  if (!needsReaggregation) {
    return stats.teamStats[teamSide][skill];
  }

  const touches = getFilteredTouches(stats, {
    set: filters.set,
    team: teamSide,
    source: filters.source,
    rallyPhase: filters.rallyPhase,
    evaluations: filters.evaluations,
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
  const hasEvaluationFilter = filters.evaluations.length < 6; // 6 is the total number of evaluations
  const needsReaggregation =
    filters.set !== 'all'
    || filters.source !== 'all'
    || filters.rallyPhase !== 'all'
    || filters.player !== 'all'
    || filters.role !== 'all'
    || hasEvaluationFilter;
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

export function getFullyFilteredTouches(
  stats: MatchStats,
  filters: DashboardFilters,
): BallTouch[] {
  let touches = getFilteredTouches(stats, {
    set: filters.set,
    team: filters.team,
    source: filters.source,
    rallyPhase: filters.rallyPhase,
    evaluations: filters.evaluations,
  });

  if (filters.player !== 'all') {
    touches = touches.filter((t) => t.playerId === filters.player);
  }

  if (filters.role !== 'all') {
    const rolePlayerIds = new Set(
      stats.playerStats
        .filter((p) => p.role === filters.role)
        .map((p) => p.playerId),
    );
    touches = touches.filter((t) => t.playerId != null && rolePlayerIds.has(t.playerId));
  }

  return touches;
}

export function getTeamStatsForFilters(
  stats: MatchStats,
  filters: DashboardFilters,
): Record<TeamSide, TeamStats> | null {
  if (filters.set !== 'all' || filters.source !== 'all' || filters.rallyPhase !== 'all') {
    return null;
  }
  return stats.teamStats;
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
  filters: Pick<DashboardFilters, 'set' | 'rallyPhase'>,
): RallyStats[] {
  return getFilteredRallies(stats, filters);
}

// Advanced filter selectors for tactical analysis

export function getServerFromRally(rally: RallyStats): string | null {
  const serveTouch = rally.touches.find((t) => t.skill === 'serve');
  return serveTouch?.playerId ?? null;
}

export function getReceiverFromRally(rally: RallyStats): string | null {
  // Receiver is the first player (after server) who touches the ball on the receiving team
  const servingTeam = rally.servingTeam;
  if (!servingTeam) return null;

  const receivingTeam = servingTeam === 'home' ? 'away' : 'home';
  const receiveTouch = rally.touches.find(
    (t) => t.teamSide === receivingTeam && t.skill === 'receive',
  );
  return receiveTouch?.playerId ?? null;
}

export function getTouchesWithScoreRange(
  stats: MatchStats,
  touches: readonly BallTouch[],
  scoreRange: 'tied' | 'leading' | 'trailing' | 'clutch',
): BallTouch[] {
  if (!scoreRange) {
    return touches as BallTouch[];
  }

  const touchesByRally = new Map<string, { touch: BallTouch; rally: RallyStats }>();
  const ralliesByKey = new Map<string, RallyStats>();

  // Build rally lookup
  stats.rallyStats.forEach((rally) => {
    const key = `${rally.setNumber}-${rally.rallyNumber}`;
    ralliesByKey.set(key, rally);
  });

  // Map each touch to its rally and calculate score
  touches.forEach((touch) => {
    const key = `${touch.setNumber}-${touch.rallyNumber}`;
    const rally = ralliesByKey.get(key);
    if (rally) {
      touchesByRally.set(`${key}-${touch.sequenceNumber}`, { touch, rally });
    }
  });

  // Filter by score range
  return Array.from(touchesByRally.values())
    .filter(({ rally }) => {
      const setStats = stats.setStats.find((s) => s.setNumber === rally.setNumber);
      if (!setStats) return false;

      const { homeScore, awayScore } = setStats;
      const pointDiff = Math.abs(homeScore - awayScore);

      switch (scoreRange) {
        case 'tied':
          return homeScore === awayScore;
        case 'leading':
          return pointDiff > 0;
        case 'trailing':
          return pointDiff > 0;
        case 'clutch':
          return (homeScore >= 23 && awayScore >= 23) || (homeScore >= 14 && awayScore >= 14 && pointDiff <= 2);
        default:
          return true;
      }
    })
    .map(({ touch }) => touch);
}
