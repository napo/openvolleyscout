import type { TeamSide } from '@src/domain/common/enums';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { BallTouch } from '@src/domain/touch/types';

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

export function sortTouches(touches: readonly BallTouch[]): BallTouch[] {
  return touches
    .slice()
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber || a.createdAt - b.createdAt);
}

/**
 * Counts real cross-net exchanges among `sorted` touches (see `sortTouches`),
 * considering only touches up to and including index `throughIndex` — 0 =
 * ace/serve error, 1 = first-ball kill (FBSO), 2+ = extended rally. Shared by
 * `countRallyExchanges` and the rally-phase classifier's transition fallback.
 *
 * Deliberately keyed off which team last touched the ball, not off specific
 * skill types (dig/set/freeball): those aren't always scouted explicitly
 * (only serve, reception, attack and block-on-point-or-error are assumed
 * always present), so requiring an explicit "dig" would undercount
 * transitions whenever the defensive touch was only inferred rather than
 * logged.
 *
 * One exception: an attack rated `!` ("blocked for reattack") is a
 * deliberate tactic — the ball is meant to stay with the attacking team.
 * Everything up to the next touch by that same team is absorbed as a single
 * possession, not a new exchange. If that team never touches the ball again
 * (it genuinely changed hands), the transition is counted normally.
 */
export function countExchangesThroughIndex(sorted: readonly BallTouch[], throughIndex: number): number {
  if (sorted.length === 0 || throughIndex <= 0) return 0;

  let exchanges = 0;
  let currentSide = sorted[0].teamSide;
  let i = 1;

  while (i <= throughIndex) {
    const prev = sorted[i - 1];
    const touch = sorted[i];

    if (prev.skill === 'attack' && prev.evaluation === '!' && touch.teamSide !== prev.teamSide) {
      const returnIndex = sorted.findIndex((t, j) => j > i && t.teamSide === prev.teamSide);
      if (returnIndex !== -1) {
        // Absorbed: the attacking team gets the ball back — skip straight past the detour.
        currentSide = prev.teamSide;
        i = returnIndex + 1;
        continue;
      }
      // The team never touches the ball again — this was a real exchange after all, fall through.
    }

    if (touch.teamSide !== currentSide) {
      exchanges += 1;
      currentSide = touch.teamSide;
    }
    i += 1;
  }

  return exchanges;
}

export function countRallyExchanges(rally: RallyStats): number {
  const sorted = sortTouches(rally.touches);
  return countExchangesThroughIndex(sorted, sorted.length - 1);
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
