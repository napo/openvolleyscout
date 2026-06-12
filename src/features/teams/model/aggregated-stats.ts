import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import {
  TRACKED_SKILLS,
  createEmptySkillStats,
  createEmptyTeamStats,
  buildMatchStatsQuickStats,
  safeDivide,
  type MatchStats,
  type TeamStats,
  type PlayerStats,
  type SkillStats,
  type AdvancedStats,
  type RallyStats,
  type SetStats,
} from '@src/features/scouting/model/match-stats';

function flipSide(side: TeamSide): TeamSide {
  return side === 'home' ? 'away' : 'home';
}

function normalizeTouchSide(touch: BallTouch, shouldFlip: boolean): BallTouch {
  if (!shouldFlip) return touch;
  return { ...touch, teamSide: flipSide(touch.teamSide) };
}

function normalizeRally(rally: RallyStats, shouldFlip: boolean): RallyStats {
  if (!shouldFlip) return rally;
  return {
    ...rally,
    touches: rally.touches.map((touch) => normalizeTouchSide(touch, true)),
    servingTeam: rally.servingTeam ? flipSide(rally.servingTeam) : rally.servingTeam,
    pointWinner: rally.pointWinner ? flipSide(rally.pointWinner) : rally.pointWinner,
  };
}

function addSkillStats(a: SkillStats, b: SkillStats): SkillStats {
  const result = createEmptySkillStats();
  for (const key of [
    'total', 'positive', 'perfect', 'errors', 'points',
    'neutral', 'slash', 'exclamation', 'minus', 'plus', 'hash', 'equal',
  ] as const) {
    result[key] = a[key] + b[key];
  }
  return result;
}

function accumulateTeamStats(acc: TeamStats, src: TeamStats): TeamStats {
  const result: TeamStats = { ...acc };
  for (const skill of TRACKED_SKILLS) {
    result[skill] = addSkillStats(acc[skill], src[skill]);
  }
  result.totalTouches = acc.totalTouches + src.totalTouches;
  result.points = acc.points + src.points;
  result.errors = acc.errors + src.errors;
  result.winningTouches = acc.winningTouches + src.winningTouches;
  result.aces = acc.aces + src.aces;
  result.attackPoints = acc.attackPoints + src.attackPoints;
  result.blockPoints = acc.blockPoints + src.blockPoints;
  result.serveErrors = acc.serveErrors + src.serveErrors;
  result.attackErrors = acc.attackErrors + src.attackErrors;
  result.attackBlocked = acc.attackBlocked + src.attackBlocked;
  result.receptionErrors = acc.receptionErrors + src.receptionErrors;
  return result;
}

function accumulatePlayerStats(acc: PlayerStats, src: PlayerStats): PlayerStats {
  const result: PlayerStats = { ...acc };
  for (const skill of TRACKED_SKILLS) {
    result[skill] = addSkillStats(acc[skill], src[skill]);
  }
  result.totalTouches = acc.totalTouches + src.totalTouches;
  result.points = acc.points + src.points;
  result.errors = acc.errors + src.errors;
  result.winningTouches = acc.winningTouches + src.winningTouches;
  result.aces = acc.aces + src.aces;
  result.attackPoints = acc.attackPoints + src.attackPoints;
  result.blockPoints = acc.blockPoints + src.blockPoints;
  result.serveErrors = acc.serveErrors + src.serveErrors;
  result.attackErrors = acc.attackErrors + src.attackErrors;
  result.attackBlocked = acc.attackBlocked + src.attackBlocked;
  result.receptionErrors = acc.receptionErrors + src.receptionErrors;
  return result;
}

export interface MatchEntry {
  stats: MatchStats;
  focusTeamSide: TeamSide;
}

/**
 * Aggregates MatchStats from multiple matches into a single MatchStats.
 * The focus team is mapped to 'home'; all opponents combined map to 'away'.
 */
export function buildAggregatedTeamMatchStats(
  entries: MatchEntry[],
  focusTeamName: string,
  opponentLabel: string,
): MatchStats {
  let focusStats = createEmptyTeamStats('home', focusTeamName);
  let opponentStats = createEmptyTeamStats('away', opponentLabel);
  const setsWon: Record<TeamSide, number> = { home: 0, away: 0 };
  let totalTouches = 0;

  let soFocusAttempts = 0;
  let soFocusWins = 0;
  let soOppAttempts = 0;
  let soOppWins = 0;
  let bpFocusAttempts = 0;
  let bpFocusWins = 0;
  let bpOppAttempts = 0;
  let bpOppWins = 0;

  const focusPlayerMap = new Map<string, PlayerStats>();
  const opponentPlayers: PlayerStats[] = [];
  const aggregatedRallies: RallyStats[] = [];

  for (const { stats, focusTeamSide } of entries) {
    const oppSide: TeamSide = focusTeamSide === 'home' ? 'away' : 'home';
    const shouldFlip = focusTeamSide === 'away';

    for (const rally of stats.rallyStats) {
      aggregatedRallies.push(normalizeRally(rally, shouldFlip));
    }

    focusStats = accumulateTeamStats(focusStats, stats.teamStats[focusTeamSide]);
    opponentStats = accumulateTeamStats(opponentStats, stats.teamStats[oppSide]);

    setsWon.home += stats.setsWon[focusTeamSide];
    setsWon.away += stats.setsWon[oppSide];
    totalTouches += stats.totalTouches;

    const focusSO = stats.advancedStats.sideOut[focusTeamSide];
    const oppSO = stats.advancedStats.sideOut[oppSide];
    soFocusAttempts += focusSO.sideOutAttempts;
    soFocusWins += focusSO.sideOutWins;
    soOppAttempts += oppSO.sideOutAttempts;
    soOppWins += oppSO.sideOutWins;

    const focusBP = stats.advancedStats.breakPoint[focusTeamSide];
    const oppBP = stats.advancedStats.breakPoint[oppSide];
    bpFocusAttempts += focusBP.breakPointAttempts;
    bpFocusWins += focusBP.breakPointWins;
    bpOppAttempts += oppBP.breakPointAttempts;
    bpOppWins += oppBP.breakPointWins;

    for (const ps of stats.playerStats) {
      if (ps.teamSide === focusTeamSide) {
        const normalized: PlayerStats = { ...ps, teamSide: 'home' };
        const existing = focusPlayerMap.get(ps.playerId);
        focusPlayerMap.set(ps.playerId, existing ? accumulatePlayerStats(existing, normalized) : normalized);
      } else {
        opponentPlayers.push({ ...ps, teamSide: 'away' });
      }
    }
  }

  const advancedStats: AdvancedStats = {
    sideOut: {
      home: {
        sideOutAttempts: soFocusAttempts,
        sideOutWins: soFocusWins,
        sideOutPercentage: safeDivide(soFocusWins, soFocusAttempts),
      },
      away: {
        sideOutAttempts: soOppAttempts,
        sideOutWins: soOppWins,
        sideOutPercentage: safeDivide(soOppWins, soOppAttempts),
      },
    },
    breakPoint: {
      home: {
        breakPointAttempts: bpFocusAttempts,
        breakPointWins: bpFocusWins,
        breakPointPercentage: safeDivide(bpFocusWins, bpFocusAttempts),
      },
      away: {
        breakPointAttempts: bpOppAttempts,
        breakPointWins: bpOppWins,
        breakPointPercentage: safeDivide(bpOppWins, bpOppAttempts),
      },
    },
    rotations: { home: [], away: [] },
  };

  const teamStats: Record<TeamSide, TeamStats> = { home: focusStats, away: opponentStats };
  const playerStats = [...focusPlayerMap.values(), ...opponentPlayers];
  const quickStats = buildMatchStatsQuickStats({ teamStats, playerStats });

  // Synthetic per-set-number buckets: "set 1" groups the first sets of every
  // match, which keeps the set filter meaningful across multiple matches.
  const setBuckets = new Map<number, RallyStats[]>();
  for (const rally of aggregatedRallies) {
    const bucket = setBuckets.get(rally.setNumber) ?? [];
    bucket.push(rally);
    setBuckets.set(rally.setNumber, bucket);
  }
  const setStats: SetStats[] = [...setBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([setNumber, rallies]) => ({
      setNumber,
      homeScore: 0,
      awayScore: 0,
      winner: null,
      totalTouches: rallies.reduce((sum, rally) => sum + rally.touches.length, 0),
      rallies,
    }));

  return {
    teamStats,
    playerStats,
    setStats,
    rallyStats: aggregatedRallies,
    setsWon,
    totalTouches,
    quickStats,
    advancedStats,
    sideOutStats: advancedStats.sideOut,
    breakPointStats: advancedStats.breakPoint,
    rotationStats: advancedStats.rotations,
  };
}
