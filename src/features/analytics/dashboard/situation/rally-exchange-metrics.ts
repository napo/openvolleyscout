import type { TeamSide } from '@src/domain/common/enums';
import type { RallyStats } from '@src/features/scouting/model/match-stats';

function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** How many exchanges (attack attempts by either team) it took to close a point. */
export interface ExchangeBucket {
  points: number;
  totalExchanges: number;
  avgExchanges: number | null;
  distribution: Record<number, number>;
}

export interface RallyExchangeStats {
  teamSide: TeamSide;
  teamName: string;
  sideOut: ExchangeBucket;
  breakPoint: ExchangeBucket;
}

function emptyBucket(): ExchangeBucket {
  return { points: 0, totalExchanges: 0, avgExchanges: null, distribution: {} };
}

function accumulateExchange(bucket: ExchangeBucket, exchanges: number): void {
  bucket.points += 1;
  bucket.totalExchanges += exchanges;
  bucket.distribution[exchanges] = (bucket.distribution[exchanges] ?? 0) + 1;
}

function finalizeBucket(bucket: ExchangeBucket): ExchangeBucket {
  return { ...bucket, avgExchanges: safeDivide(bucket.totalExchanges, bucket.points) };
}

/**
 * Counts, per rally, how many `attack`-skill touches occurred (by either
 * team) before the point was decided — 0 = ace/serve error, 1 = first-ball
 * kill (FBSO), 2+ = extended rally. This is "rally length in exchanges", the
 * unit the user picked for "how many plays it took to score a point".
 */
export function countRallyExchanges(rally: RallyStats): number {
  return rally.touches.filter((t) => t.skill === 'attack').length;
}

/**
 * Per-team distribution of exchange counts for points won, split by whether
 * the team was receiving (side-out / "CP") or serving (break-point / "BP")
 * when it scored.
 */
export function computeRallyExchangeStats(
  rallies: readonly RallyStats[],
  homeTeamName: string,
  awayTeamName: string,
): { home: RallyExchangeStats; away: RallyExchangeStats } {
  const mkTeam = (teamSide: TeamSide, teamName: string): RallyExchangeStats => ({
    teamSide,
    teamName,
    sideOut: emptyBucket(),
    breakPoint: emptyBucket(),
  });

  const home = mkTeam('home', homeTeamName);
  const away = mkTeam('away', awayTeamName);

  for (const rally of rallies) {
    if (!rally.servingTeam || !rally.pointWinner) continue;

    const winner = rally.pointWinner;
    const winnerMetrics = winner === 'home' ? home : away;
    const exchanges = countRallyExchanges(rally);

    if (winner === rally.servingTeam) {
      accumulateExchange(winnerMetrics.breakPoint, exchanges);
    } else {
      accumulateExchange(winnerMetrics.sideOut, exchanges);
    }
  }

  return {
    home: { ...home, sideOut: finalizeBucket(home.sideOut), breakPoint: finalizeBucket(home.breakPoint) },
    away: { ...away, sideOut: finalizeBucket(away.sideOut), breakPoint: finalizeBucket(away.breakPoint) },
  };
}
