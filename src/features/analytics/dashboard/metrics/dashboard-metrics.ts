import type { TeamSide } from '@src/domain/common/enums';
import type {
  MatchStats,
  PlayerStats,
  SetStats,
  SkillStats,
  TeamStats,
  TrackedSkill,
} from '@src/features/scouting/model/match-stats';
import { safeDivide } from '@src/features/scouting/model/match-stats';
import { computePlayerServeWins, computePlayerReceptionWins } from '@src/features/scouting/model/match-report';
import { createTeamScopedPlayerKey } from '@src/domain/lineup';
import type { BallTouch } from '@src/domain/touch/types';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { rallyMatchesPhaseFilter } from '../../rally-phase/rally-phase-classifier';
import type { FilteredTeamStats } from '../selectors/dashboard-selectors';

export interface EfficiencyMetrics {
  serveTotal: number;
  serveAces: number;
  serveErrors: number;
  serveEfficiency: number | null;

  receptionTotal: number;
  receptionPerfect: number;
  receptionPositive: number;
  receptionErrors: number;
  receptionEfficiency: number | null;
  receptionPerfectPct: number | null;
  receptionPositivePct: number | null;

  attackAttempts: number;
  attackPoints: number;
  attackErrors: number;
  attackBlocked: number;
  attackEfficiency: number | null;
  attackKillPct: number | null;

  blockAttempts: number;
  blockPoints: number;
  blockEfficiency: number | null;
}

export function computeEfficiencyFromTeamStats(
  stats: MatchStats,
  teamSide: TeamSide,
): EfficiencyMetrics {
  const qs = stats.quickStats.teams[teamSide];
  const ts = stats.teamStats[teamSide];
  const opponentTs = stats.teamStats[teamSide === 'home' ? 'away' : 'home'];

  return {
    serveTotal: qs.serve.total,
    serveAces: qs.serve.aces,
    serveErrors: qs.serve.errors,
    serveEfficiency: qs.serve.efficiency,

    receptionTotal: qs.reception.total,
    receptionPerfect: qs.reception.perfect,
    receptionPositive: qs.reception.positive,
    receptionErrors: qs.reception.errors,
    receptionEfficiency: qs.reception.efficiency,
    receptionPerfectPct: qs.reception.perfectPercentage,
    receptionPositivePct: safeDivide(qs.reception.positive, qs.reception.total),

    attackAttempts: qs.attack.attempts,
    attackPoints: qs.attack.points,
    attackErrors: qs.attack.errors,
    attackBlocked: qs.attack.blocked,
    attackEfficiency: qs.attack.efficiency,
    attackKillPct: qs.attack.killPercentage,

    blockAttempts: ts.block.total,
    blockPoints: ts.blockPoints,
    blockEfficiency: safeDivide(ts.blockPoints, opponentTs.attack.total),
  };
}

export function computeEfficiencyFromSkillStats(
  serve: SkillStats,
  receive: SkillStats,
  attack: SkillStats,
  block: SkillStats,
  attackPoints: number,
  blockPoints: number,
  aces: number,
  serveErrors: number,
  attackErrors: number,
  attackBlocked: number,
  receptionErrors: number,
  opponentAttackTotal: number,
): EfficiencyMetrics {
  return {
    serveTotal: serve.total,
    serveAces: aces,
    serveErrors,
    serveEfficiency: safeDivide(aces - serveErrors, serve.total),

    receptionTotal: receive.total,
    receptionPerfect: receive.perfect,
    receptionPositive: receive.positive,
    receptionErrors,
    receptionEfficiency: safeDivide(
      receive.hash + receive.plus - receive.slash - receive.minus - receive.equal,
      receive.total,
    ),
    receptionPerfectPct: safeDivide(receive.perfect, receive.total),
    receptionPositivePct: safeDivide(receive.positive, receive.total),

    attackAttempts: attack.total,
    attackPoints,
    attackErrors,
    attackBlocked,
    attackEfficiency: safeDivide(attackPoints - attackErrors - attackBlocked, attack.total),
    attackKillPct: safeDivide(attackPoints, attack.total),

    blockAttempts: block.total,
    blockPoints,
    blockEfficiency: safeDivide(blockPoints, opponentAttackTotal),
  };
}

export function computeEfficiencyFromFilteredTeamStats(
  teamStats: FilteredTeamStats,
  opponentAttackTotal: number,
): EfficiencyMetrics {
  const s = teamStats.skillStats;
  return computeEfficiencyFromSkillStats(
    s.serve, s.receive, s.attack, s.block,
    s.attack.hash,
    s.block.hash,
    s.serve.hash,
    s.serve.equal,
    s.attack.equal,
    s.attack.slash,
    s.receive.equal,
    opponentAttackTotal,
  );
}

export interface SkillPointsErrors {
  skill: TrackedSkill;
  points: number;
  errors: number;
  total: number;
}

export function computePointsErrorsBySkill(
  teamStats: TeamStats,
): SkillPointsErrors[] {
  const skillsToShow: TrackedSkill[] = ['serve', 'attack', 'block', 'receive'];
  return skillsToShow.map((skill) => ({
    skill,
    points: teamStats[skill].points,
    errors: teamStats[skill].errors,
    total: teamStats[skill].total,
  }));
}

export function computePointsErrorsFromSkillStats(
  skills: Partial<Record<TrackedSkill, SkillStats>>,
): SkillPointsErrors[] {
  const skillsToShow: TrackedSkill[] = ['serve', 'attack', 'block', 'receive'];
  return skillsToShow.map((skill) => {
    const s = skills[skill];
    return {
      skill,
      points: s?.points ?? 0,
      errors: s?.errors ?? 0,
      total: s?.total ?? 0,
    };
  });
}

export interface SetPerformanceRow {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  winner: TeamSide | null;
  homeTouches: number;
  awayTouches: number;
  homeAces: number;
  awayAces: number;
  homeAttackPoints: number;
  awayAttackPoints: number;
  homeBlockPoints: number;
  awayBlockPoints: number;
  homeServeErrors: number;
  awayServeErrors: number;
  homeReceptionErrors: number;
  awayReceptionErrors: number;
  homeAttackErrors: number;
  awayAttackErrors: number;
}

function countTouchesBy(
  touches: readonly BallTouch[],
  predicate: (t: BallTouch) => boolean,
): number {
  return touches.filter(predicate).length;
}

export function computePerformanceBySet(stats: MatchStats): SetPerformanceRow[] {
  return stats.setStats.map((setData: SetStats) => {
    const touches = setData.rallies.flatMap((r) => r.touches);

    const home = (skill: string, evaluation: string) =>
      countTouchesBy(touches, (t) => t.teamSide === 'home' && t.skill === skill && t.evaluation === evaluation);
    const away = (skill: string, evaluation: string) =>
      countTouchesBy(touches, (t) => t.teamSide === 'away' && t.skill === skill && t.evaluation === evaluation);
    const homeTotal = countTouchesBy(touches, (t) => t.teamSide === 'home');
    const awayTotal = countTouchesBy(touches, (t) => t.teamSide === 'away');

    return {
      setNumber: setData.setNumber,
      homeScore: setData.homeScore,
      awayScore: setData.awayScore,
      winner: setData.winner,
      homeTouches: homeTotal,
      awayTouches: awayTotal,
      homeAces: home('serve', '#'),
      awayAces: away('serve', '#'),
      homeAttackPoints: home('attack', '#'),
      awayAttackPoints: away('attack', '#'),
      homeBlockPoints: home('block', '#'),
      awayBlockPoints: away('block', '#'),
      homeServeErrors: home('serve', '='),
      awayServeErrors: away('serve', '='),
      homeReceptionErrors: home('receive', '='),
      awayReceptionErrors: away('receive', '='),
      homeAttackErrors: home('attack', '='),
      awayAttackErrors: away('attack', '='),
    };
  });
}

export function computeFilteredPerformanceBySet(
  stats: MatchStats,
  filters: Pick<DashboardFilters, 'team' | 'player' | 'role' | 'source' | 'rallyPhase'>,
): SetPerformanceRow[] {
  const rolePlayerIds: Set<string> | null = filters.role !== 'all'
    ? new Set(stats.playerStats.filter((p) => p.role === filters.role).map((p) => p.playerId))
    : null;

  return stats.setStats.map((setData: SetStats) => {
    let rallies = setData.rallies;

    if (filters.rallyPhase !== 'all') {
      rallies = rallies.filter((r) => rallyMatchesPhaseFilter(r, filters.rallyPhase));
    }

    let touches = rallies.flatMap((r) => r.touches);

    if (filters.team !== 'all') {
      touches = touches.filter((t) => t.teamSide === filters.team);
    }

    if (filters.source !== 'all') {
      const want = filters.source;
      touches = touches.filter((t) => (t.source ?? 'explicit') === want);
    }

    if (filters.player !== 'all') {
      touches = touches.filter((t) => t.playerId === filters.player);
    }

    if (rolePlayerIds) {
      touches = touches.filter((t) => t.playerId != null && rolePlayerIds.has(t.playerId));
    }

    const home = (skill: string, evaluation: string) =>
      touches.filter((t) => t.teamSide === 'home' && t.skill === skill && t.evaluation === evaluation).length;
    const away = (skill: string, evaluation: string) =>
      touches.filter((t) => t.teamSide === 'away' && t.skill === skill && t.evaluation === evaluation).length;
    const homeTotal = touches.filter((t) => t.teamSide === 'home').length;
    const awayTotal = touches.filter((t) => t.teamSide === 'away').length;

    return {
      setNumber: setData.setNumber,
      homeScore: setData.homeScore,
      awayScore: setData.awayScore,
      winner: setData.winner,
      homeTouches: homeTotal,
      awayTouches: awayTotal,
      homeAces: home('serve', '#'),
      awayAces: away('serve', '#'),
      homeAttackPoints: home('attack', '#'),
      awayAttackPoints: away('attack', '#'),
      homeBlockPoints: home('block', '#'),
      awayBlockPoints: away('block', '#'),
      homeServeErrors: home('serve', '='),
      awayServeErrors: away('serve', '='),
      homeReceptionErrors: home('receive', '='),
      awayReceptionErrors: away('receive', '='),
      homeAttackErrors: home('attack', '='),
      awayAttackErrors: away('attack', '='),
    };
  });
}

export interface PlayerServeSummary {
  total: number;
  aces: number;
  errors: number;
  efficiency: number | null;
}

export interface PlayerReceptionSummary {
  total: number;
  perfect: number;
  positive: number;
  errors: number;
  efficiency: number | null;
  perfectPct: number | null;
  positivePct: number | null;
  errorPct: number | null;
}

export interface PlayerAttackSummary {
  total: number;
  points: number;
  errors: number;
  blocked: number;
  efficiency: number | null;
  killPct: number | null;
}

export interface PlayerBlockSummary {
  total: number;
  points: number;
}

export function computePlayerServeSummary(player: PlayerStats): PlayerServeSummary {
  return {
    total: player.serve.total,
    aces: player.aces,
    errors: player.serveErrors,
    efficiency: safeDivide(player.aces - player.serveErrors, player.serve.total),
  };
}

export function computePlayerReceptionSummary(player: PlayerStats): PlayerReceptionSummary {
  const r = player.receive;
  return {
    total: r.total,
    perfect: r.perfect,
    positive: r.perfect + r.positive,
    errors: player.receptionErrors,
    efficiency: safeDivide(r.hash + r.plus - r.slash - r.minus - r.equal, r.total),
    perfectPct: safeDivide(r.perfect, r.total),
    positivePct: safeDivide(r.perfect + r.positive, r.total),
    errorPct: safeDivide(player.receptionErrors, r.total),
  };
}

export function computePlayerAttackSummary(player: PlayerStats): PlayerAttackSummary {
  const a = player.attack;
  return {
    total: a.total,
    points: player.attackPoints,
    errors: player.attackErrors,
    blocked: player.attackBlocked,
    efficiency: safeDivide(player.attackPoints - player.attackErrors - player.attackBlocked, a.total),
    killPct: safeDivide(player.attackPoints, a.total),
  };
}

export function computePlayerBlockSummary(player: PlayerStats): PlayerBlockSummary {
  return {
    total: player.block.total,
    points: player.blockPoints,
  };
}

export interface PlayerPointConversion {
  servesPerPoint: number | null;
  receptionsPerPoint: number | null;
}

export function computePlayerPointConversion(stats: MatchStats, player: PlayerStats): PlayerPointConversion {
  const playerKey = createTeamScopedPlayerKey(player.teamSide, player.playerId);
  const serveWins = computePlayerServeWins(stats)[playerKey] ?? 0;
  const receptionWins = computePlayerReceptionWins(stats)[playerKey] ?? 0;

  return {
    servesPerPoint: safeDivide(player.serve.total, serveWins),
    receptionsPerPoint: safeDivide(player.receive.total, receptionWins),
  };
}

export function formatEfficiencyPct(value: number | null): string {
  if (value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatCount(value: number): string {
  return String(value);
}

export function formatRatio(value: number | null): string {
  if (value === null) return '-';
  return value.toFixed(1);
}

export function getEfficiencyColor(value: number | null): string {
  if (value === null) return 'var(--color-text-secondary)';
  if (value >= 0.3) return '#16a34a';
  if (value >= 0.1) return '#22c55e';
  if (value >= 0) return '#eab308';
  if (value >= -0.1) return '#f97316';
  return '#dc2626';
}

export function computeRoleSummary(
  stats: MatchStats,
  filters: { team: 'all' | TeamSide; role: string },
): PlayerStats[] {
  return stats.playerStats.filter((p) => {
    if (filters.team !== 'all' && p.teamSide !== filters.team) return false;
    if (filters.role !== 'all' && p.role !== filters.role) return false;
    return true;
  });
}

// ─── ROTATION ANALYTICS ──────────────────────────────────────────────────────

export interface RotationAnalyticsMetrics {
  rotationNumber: number;
  sideOutAttempts: number;
  sideOutWins: number;
  sideOutEfficiency: number | null;
  breakPointAttempts: number;
  breakPointWins: number;
  breakPointEfficiency: number | null;
  pointsScored: number;
  pointsConceded: number;
  netPoints: number;
  pointsPerRotation: number | null;
}

/**
 * Get analytics for a specific rotation
 * @param stats MatchStats containing pre-calculated rotationStats
 * @param teamSide Team to analyze
 * @param rotationNumber Rotation number (1-6)
 * @returns RotationAnalyticsMetrics
 */
export function getRotationAnalytics(
  stats: MatchStats,
  teamSide: TeamSide,
  rotationNumber: number,
): RotationAnalyticsMetrics {
  const rotationStats = stats.rotationStats[teamSide].find(
    (r) => r.rotationNumber === rotationNumber,
  );

  if (!rotationStats) {
    return {
      rotationNumber,
      sideOutAttempts: 0,
      sideOutWins: 0,
      sideOutEfficiency: null,
      breakPointAttempts: 0,
      breakPointWins: 0,
      breakPointEfficiency: null,
      pointsScored: 0,
      pointsConceded: 0,
      netPoints: 0,
      pointsPerRotation: null,
    };
  }

  const netPoints = rotationStats.pointsScored - rotationStats.pointsConceded;
  const totalTouches = rotationStats.sideOutAttempts + rotationStats.breakPointAttempts;

  return {
    rotationNumber,
    sideOutAttempts: rotationStats.sideOutAttempts,
    sideOutWins: rotationStats.sideOutWins,
    sideOutEfficiency: safeDivide(rotationStats.sideOutWins, rotationStats.sideOutAttempts),
    breakPointAttempts: rotationStats.breakPointAttempts,
    breakPointWins: rotationStats.breakPointWins,
    breakPointEfficiency: safeDivide(rotationStats.breakPointWins, rotationStats.breakPointAttempts),
    pointsScored: rotationStats.pointsScored,
    pointsConceded: rotationStats.pointsConceded,
    netPoints,
    pointsPerRotation: safeDivide(netPoints, totalTouches),
  };
}

/**
 * Get on-court players for a specific rotation in a set
 * @param stats MatchStats
 * @param rotationNumber Rotation number (1-6)
 * @param setNumber Set to get lineup for
 * @returns Array of PlayerStats that are in this rotation
 */
export function getOnCourtPlayersForRotation(
  stats: MatchStats,
  rotationNumber: number,
  setNumber: number,
  teamSide: TeamSide,
): PlayerStats[] {
  // Find first rally in set where this rotation occurred
  // For now, return all players (full rotation analytics would track lineup changes per rally)
  // This is a simplified implementation pending full lineup tracking per rotation

  const setStats = stats.setStats.find((s) => s.setNumber === setNumber);
  if (!setStats) return [];

  // Return players from this team (rotation concept applies to a team)
  return stats.playerStats.filter((p) => p.teamSide === teamSide);
}

/**
 * Get all rotation analytics for a team in a set
 * @param stats MatchStats
 * @param teamSide Team to analyze
 * @returns Array of RotationAnalyticsMetrics for all 6 rotations
 */
export function getRotationStatsAggregated(
  stats: MatchStats,
  teamSide: TeamSide,
): RotationAnalyticsMetrics[] {
  return [1, 2, 3, 4, 5, 6].map((rotationNumber) =>
    getRotationAnalytics(stats, teamSide, rotationNumber),
  );
}

// ─── SCORE-STATE ANALYTICS ──────────────────────────────────────────────────

export interface ScoreStateAnalyticsMetrics {
  scoreRange: 'tied' | 'leading' | 'trailing' | 'clutch';
  totalRallies: number;
  pointsScored: number;
  pointsConceded: number;
  netPoints: number;
  serveEfficiency: number | null;
  receptionEfficiency: number | null;
  attackEfficiency: number | null;
  blockPoints: number;
}

/**
 * Calculate metrics for a specific score state
 * Tied: equal score
 * Leading: ahead by any amount
 * Trailing: behind by any amount
 * Clutch: score >= 23 OR (score >= 14 AND pointDiff <= 2)
 */
export function getScoreStateAnalytics(
  stats: MatchStats,
  teamSide: TeamSide,
  scoreRange: 'tied' | 'leading' | 'trailing' | 'clutch',
): ScoreStateAnalyticsMetrics {
  let ralliesInState: { homeScore: number; awayScore: number; rally: any }[] = [];

  // Build score state rally list
  stats.setStats.forEach((set) => {
    let currentHomeScore = 0;
    let currentAwayScore = 0;

    set.rallies.forEach((rally) => {
      // Update scores based on point winner
      if (rally.pointWinner === 'home') {
        currentHomeScore++;
      } else if (rally.pointWinner === 'away') {
        currentAwayScore++;
      }

      // Check if rally matches score range
      const pointDiff = Math.abs(currentHomeScore - currentAwayScore);
      let matches = false;

      switch (scoreRange) {
        case 'tied':
          matches = currentHomeScore === currentAwayScore;
          break;
        case 'leading':
          matches = (teamSide === 'home' && currentHomeScore > currentAwayScore) ||
                   (teamSide === 'away' && currentAwayScore > currentHomeScore);
          break;
        case 'trailing':
          matches = (teamSide === 'home' && currentHomeScore < currentAwayScore) ||
                   (teamSide === 'away' && currentAwayScore < currentHomeScore);
          break;
        case 'clutch':
          matches = (currentHomeScore >= 23 && currentAwayScore >= 23) ||
                   (currentHomeScore >= 14 && currentAwayScore >= 14 && pointDiff <= 2);
          break;
      }

      if (matches) {
        ralliesInState.push({
          homeScore: currentHomeScore,
          awayScore: currentAwayScore,
          rally,
        });
      }
    });
  });

  // Calculate metrics for rallies in this state
  let pointsScored = 0;
  let pointsConceded = 0;
  let serveAttempts = 0;
  let serveAces = 0;
  let receptionAttempts = 0;
  let receptionPositive = 0;
  let receptionNegative = 0;
  let attackAttempts = 0;
  let attackPoints = 0;
  let attackBlocked = 0;
  let attackErrors = 0;
  let blockPoints = 0;

  ralliesInState.forEach(({ rally }) => {
    rally.touches.forEach((touch: BallTouch) => {
      if (touch.teamSide === teamSide) {
        if (touch.skill === 'serve') {
          serveAttempts++;
          if (touch.evaluation === '#') serveAces++;
        } else if (touch.skill === 'receive') {
          receptionAttempts++;
          if (touch.evaluation === '#' || touch.evaluation === '+') receptionPositive++;
          if (touch.evaluation === '/' || touch.evaluation === '-' || touch.evaluation === '=') receptionNegative++;
        } else if (touch.skill === 'attack') {
          attackAttempts++;
          if (touch.evaluation === '#') attackPoints++;
          if (touch.evaluation === '=') attackErrors++;
          if (touch.evaluation === '/') attackBlocked++;
        } else if (touch.skill === 'block' && touch.evaluation === '#') {
          blockPoints++;
        }
      }
    });

    if (rally.pointWinner === teamSide) {
      pointsScored++;
    } else if (rally.pointWinner !== null) {
      pointsConceded++;
    }
  });

  return {
    scoreRange,
    totalRallies: ralliesInState.length,
    pointsScored,
    pointsConceded,
    netPoints: pointsScored - pointsConceded,
    serveEfficiency: safeDivide(serveAces, serveAttempts),
    receptionEfficiency: safeDivide(receptionPositive - receptionNegative, receptionAttempts),
    attackEfficiency: safeDivide(attackPoints - attackErrors - attackBlocked, attackAttempts),
    blockPoints,
  };
}

// ─── PLAYER COMBINATION ANALYTICS ───────────────────────────────────────────

export interface PlayerComboAnalyticsMetrics {
  players: string[];  // Player IDs
  playerNames: string[];
  pointsScored: number;
  pointsConceded: number;
  netPoints: number;
  totalRallies: number;
  pointsPerRally: number | null;
  serveEfficiency: number | null;
  attackEfficiency: number | null;
  blockPoints: number;
}

/**
 * Get analytics for setter + libero combination
 * Shows how well the team performs with specific setter/libero pair
 */
export function getSetterLiberoComboAnalytics(
  stats: MatchStats,
  teamSide: TeamSide,
  setterId: string,
  liberoId: string,
): PlayerComboAnalyticsMetrics {
  const setter = stats.playerStats.find((p) => p.playerId === setterId);
  const libero = stats.playerStats.find((p) => p.playerId === liberoId);

  let pointsScored = 0;
  let pointsConceded = 0;
  let serveAttempts = 0;
  let serveAces = 0;
  let attackAttempts = 0;
  let attackPoints = 0;
  let blockPoints = 0;
  let ralliesWithCombo = 0;

  // Analyze rallies where both setter and libero are involved
  stats.rallyStats.forEach((rally) => {
    const setterTouch = rally.touches.find(
      (t) => t.teamSide === teamSide && t.playerId === setterId && t.skill === 'set',
    );
    const liberoTouch = rally.touches.find(
      (t) => t.teamSide === teamSide && t.playerId === liberoId && t.skill === 'receive',
    );

    if (setterTouch && liberoTouch) {
      ralliesWithCombo++;
      if (rally.pointWinner === teamSide) {
        pointsScored++;
      } else if (rally.pointWinner !== null) {
        pointsConceded++;
      }
    }
  });

  return {
    players: [setterId, liberoId],
    playerNames: [setter?.playerName || setterId, libero?.playerName || liberoId],
    pointsScored,
    pointsConceded,
    netPoints: pointsScored - pointsConceded,
    totalRallies: ralliesWithCombo,
    pointsPerRally: safeDivide(pointsScored - pointsConceded, ralliesWithCombo),
    serveEfficiency: null,
    attackEfficiency: null,
    blockPoints: 0,
  };
}

/**
 * Get analytics for on-court player combination (any 2 or more players)
 * Shows how team performs when specific players are together in field
 */
export function getOnCourtComboAnalytics(
  stats: MatchStats,
  teamSide: TeamSide,
  playerIds: string[],
): PlayerComboAnalyticsMetrics {
  const players = playerIds.map((id) => stats.playerStats.find((p) => p.playerId === id));
  const playerSet = new Set(playerIds);

  let pointsScored = 0;
  let pointsConceded = 0;
  let attackAttempts = 0;
  let attackPoints = 0;
  let blockPoints = 0;
  let ralliesWithCombo = 0;

  // Analyze rallies where all specified players touched the ball
  stats.rallyStats.forEach((rally) => {
    const touchingPlayers = new Set(
      rally.touches
        .filter((t) => t.teamSide === teamSide && t.playerId)
        .map((t) => t.playerId!),
    );

    // Check if all players from combo touched ball in this rally
    const allPlayersInvolved = playerIds.every((id) => touchingPlayers.has(id));

    if (allPlayersInvolved) {
      ralliesWithCombo++;
      if (rally.pointWinner === teamSide) {
        pointsScored++;
      } else if (rally.pointWinner !== null) {
        pointsConceded++;
      }

      // Count attack stats from combo
      rally.touches.forEach((touch) => {
        if (touch.teamSide === teamSide && playerIds.includes(touch.playerId || '')) {
          if (touch.skill === 'attack') {
            attackAttempts++;
            if (touch.evaluation === '#') attackPoints++;
          } else if (touch.skill === 'block' && touch.evaluation === '#') {
            blockPoints++;
          }
        }
      });
    }
  });

  return {
    players: playerIds,
    playerNames: players.map((p) => p?.playerName || '?'),
    pointsScored,
    pointsConceded,
    netPoints: pointsScored - pointsConceded,
    totalRallies: ralliesWithCombo,
    pointsPerRally: safeDivide(pointsScored - pointsConceded, ralliesWithCombo),
    serveEfficiency: null,
    attackEfficiency: safeDivide(attackPoints, attackAttempts),
    blockPoints,
  };
}
