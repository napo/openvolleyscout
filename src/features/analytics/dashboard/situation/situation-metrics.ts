import type { TeamSide } from '@src/domain/common/enums';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import {
  classifyRallyPhase,
  hasServingTeamAttack,
  type RallyPhase,
} from '../../rally-phase/rally-phase-classifier';

function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export interface PhaseEfficiencyMetrics {
  phase: RallyPhase;
  attempts: number;
  pointsWon: number;
  errors: number;
  pointPct: number | null;
}

export interface TeamSituationMetrics {
  teamSide: TeamSide;
  teamName: string;
  sideOut: PhaseEfficiencyMetrics;
  breakPoint: PhaseEfficiencyMetrics;
  counterattack: PhaseEfficiencyMetrics;
  attackAfterReceive: PhaseEfficiencyMetrics;
  attackAfterDig: PhaseEfficiencyMetrics;
  freeball: PhaseEfficiencyMetrics;
  unknownCount: number;
}

export interface SituationMetrics {
  home: TeamSituationMetrics;
  away: TeamSituationMetrics;
}

function emptyPhase(phase: RallyPhase): PhaseEfficiencyMetrics {
  return { phase, attempts: 0, pointsWon: 0, errors: 0, pointPct: null };
}

function finalize(m: PhaseEfficiencyMetrics): PhaseEfficiencyMetrics {
  return { ...m, pointPct: safeDivide(m.pointsWon, m.attempts) };
}

function accumulate(
  bucket: PhaseEfficiencyMetrics,
  won: boolean,
): void {
  bucket.attempts += 1;
  if (won) bucket.pointsWon += 1;
  else bucket.errors += 1;
}

function finalizeTeam(m: TeamSituationMetrics): TeamSituationMetrics {
  return {
    ...m,
    sideOut: finalize(m.sideOut),
    breakPoint: finalize(m.breakPoint),
    counterattack: finalize(m.counterattack),
    attackAfterReceive: finalize(m.attackAfterReceive),
    attackAfterDig: finalize(m.attackAfterDig),
    freeball: finalize(m.freeball),
  };
}

/**
 * Compute per-phase situation metrics from a list of rallies.
 *
 * Side-out / break-point are broad buckets defined by serving context:
 *   side_out attempt   = this team is the RECEIVING team
 *   break_point attempt = this team is the SERVING team
 *
 * Sub-phases are additional classifications of the same rally:
 *   attack_after_receive – receiving team attacks after reception
 *   attack_after_dig     – any team attacks after a dig
 *   counterattack        – serving team wins after opponent attacked
 *   freeball             – rally contains a freeball touch
 */
export function computeSituationMetrics(
  rallies: readonly RallyStats[],
  homeTeamName: string,
  awayTeamName: string,
): SituationMetrics {
  const mkTeam = (teamSide: TeamSide, teamName: string): TeamSituationMetrics => ({
    teamSide,
    teamName,
    sideOut: emptyPhase('side_out'),
    breakPoint: emptyPhase('break_point'),
    counterattack: emptyPhase('counterattack'),
    attackAfterReceive: emptyPhase('attack_after_receive'),
    attackAfterDig: emptyPhase('attack_after_dig'),
    freeball: emptyPhase('freeball'),
    unknownCount: 0,
  });

  const home = mkTeam('home', homeTeamName);
  const away = mkTeam('away', awayTeamName);

  for (const rally of rallies) {
    if (!rally.servingTeam || !rally.pointWinner) {
      home.unknownCount += 1;
      away.unknownCount += 1;
      continue;
    }

    const phase = classifyRallyPhase(rally);
    const servingTeam = rally.servingTeam;
    const receivingTeam: TeamSide = servingTeam === 'home' ? 'away' : 'home';

    for (const [side, metrics] of [['home', home], ['away', away]] as [TeamSide, TeamSituationMetrics][]) {
      const won = rally.pointWinner === side;

      // Broad: side-out = the team is receiving
      if (side === receivingTeam) {
        accumulate(metrics.sideOut, won);
      }

      // Broad: break-point = the team is serving
      if (side === servingTeam) {
        accumulate(metrics.breakPoint, won);
      }

      // K1: attack after receive for the receiving team
      if (phase === 'attack_after_receive' && side === receivingTeam) {
        accumulate(metrics.attackAfterReceive, won);
      }

      // Counterattack: serving team attacked.
      // In K1 rallies the classifier returns 'attack_after_receive', so we
      // independently check whether the serving team also attacked.
      if (side === servingTeam) {
        if (phase === 'attack_after_receive') {
          if (hasServingTeamAttack(rally)) {
            accumulate(metrics.counterattack, won);
          }
        } else if (phase === 'counterattack') {
          accumulate(metrics.counterattack, won);
        }
      }

      if (phase === 'attack_after_dig') {
        accumulate(metrics.attackAfterDig, won);
      }

      if (phase === 'freeball') {
        accumulate(metrics.freeball, won);
      }

      if (phase === 'unknown') {
        metrics.unknownCount += 1;
      }
    }
  }

  return {
    home: finalizeTeam(home),
    away: finalizeTeam(away),
  };
}

/**
 * Per-phase contribution of a single player.
 *
 * For every phase bucket the team is involved in, counts how many of the
 * team's points won were scored directly by the player (terminal touch with
 * a point evaluation: ace, attack kill or block point).
 */
export interface PhaseContribution {
  teamAttempts: number;
  teamPointsWon: number;
  playerPoints: number;
  /** playerPoints / teamPointsWon */
  playerShare: number | null;
}

export interface PlayerSituationContribution {
  sideOut: PhaseContribution;
  breakPoint: PhaseContribution;
  counterattack: PhaseContribution;
  attackAfterReceive: PhaseContribution;
  attackAfterDig: PhaseContribution;
  freeball: PhaseContribution;
}

function emptyContribution(): PhaseContribution {
  return { teamAttempts: 0, teamPointsWon: 0, playerPoints: 0, playerShare: null };
}

function rallyPointScoredByPlayer(
  rally: RallyStats,
  teamSide: TeamSide,
  playerId: string,
): boolean {
  return rally.touches.some(
    (touch) =>
      touch.teamSide === teamSide
      && touch.playerId === playerId
      && touch.evaluation === '#'
      && (touch.skill === 'serve' || touch.skill === 'attack' || touch.skill === 'block'),
  );
}

export function computePlayerSituationContribution(
  rallies: readonly RallyStats[],
  teamSide: TeamSide,
  playerId: string,
): PlayerSituationContribution {
  const result: PlayerSituationContribution = {
    sideOut: emptyContribution(),
    breakPoint: emptyContribution(),
    counterattack: emptyContribution(),
    attackAfterReceive: emptyContribution(),
    attackAfterDig: emptyContribution(),
    freeball: emptyContribution(),
  };

  const accumulateContribution = (
    bucket: PhaseContribution,
    won: boolean,
    scoredByPlayer: boolean,
  ): void => {
    bucket.teamAttempts += 1;
    if (won) {
      bucket.teamPointsWon += 1;
      if (scoredByPlayer) bucket.playerPoints += 1;
    }
  };

  for (const rally of rallies) {
    if (!rally.servingTeam || !rally.pointWinner) continue;

    const phase = classifyRallyPhase(rally);
    const servingTeam = rally.servingTeam;
    const receivingTeam: TeamSide = servingTeam === 'home' ? 'away' : 'home';
    const won = rally.pointWinner === teamSide;
    const scoredByPlayer = won && rallyPointScoredByPlayer(rally, teamSide, playerId);

    if (teamSide === receivingTeam) {
      accumulateContribution(result.sideOut, won, scoredByPlayer);
    }
    if (teamSide === servingTeam) {
      accumulateContribution(result.breakPoint, won, scoredByPlayer);
    }
    if (phase === 'attack_after_receive' && teamSide === receivingTeam) {
      accumulateContribution(result.attackAfterReceive, won, scoredByPlayer);
    }
    if (teamSide === servingTeam) {
      if (phase === 'attack_after_receive') {
        if (hasServingTeamAttack(rally)) {
          accumulateContribution(result.counterattack, won, scoredByPlayer);
        }
      } else if (phase === 'counterattack') {
        accumulateContribution(result.counterattack, won, scoredByPlayer);
      }
    }
    if (phase === 'attack_after_dig') {
      accumulateContribution(result.attackAfterDig, won, scoredByPlayer);
    }
    if (phase === 'freeball') {
      accumulateContribution(result.freeball, won, scoredByPlayer);
    }
  }

  for (const bucket of Object.values(result)) {
    bucket.playerShare = safeDivide(bucket.playerPoints, bucket.teamPointsWon);
  }

  return result;
}

/** Points scored directly by a player, per set. */
export function computeSetPlayerPoints(
  rallies: readonly RallyStats[],
  teamSide: TeamSide,
  playerId: string,
): Record<number, number> {
  const bySet: Record<number, number> = {};
  for (const rally of rallies) {
    if (!rally.servingTeam || !rally.pointWinner) continue;
    if (rally.pointWinner !== teamSide) continue;
    if (!rallyPointScoredByPlayer(rally, teamSide, playerId)) continue;
    bySet[rally.setNumber] = (bySet[rally.setNumber] ?? 0) + 1;
  }
  return bySet;
}

/** Per-set phase trend for a team. */
export interface SetPhaseTrend {
  setNumber: number;
  sideOutAttempts: number;
  sideOutWins: number;
  sideOutPct: number | null;
  breakPointAttempts: number;
  breakPointWins: number;
  breakPointPct: number | null;
}

export function computeSetPhaseTrend(
  rallies: readonly RallyStats[],
  teamSide: TeamSide,
): SetPhaseTrend[] {
  const bySet = new Map<number, {
    sideOutAttempts: number;
    sideOutWins: number;
    breakPointAttempts: number;
    breakPointWins: number;
  }>();

  for (const rally of rallies) {
    if (!rally.servingTeam || !rally.pointWinner) continue;
    const s = rally.setNumber;
    if (!bySet.has(s)) {
      bySet.set(s, { sideOutAttempts: 0, sideOutWins: 0, breakPointAttempts: 0, breakPointWins: 0 });
    }
    const row = bySet.get(s)!;
    const isReceiving = teamSide !== rally.servingTeam;
    const isServing = teamSide === rally.servingTeam;
    const won = rally.pointWinner === teamSide;

    if (isReceiving) {
      row.sideOutAttempts += 1;
      if (won) row.sideOutWins += 1;
    }
    if (isServing) {
      row.breakPointAttempts += 1;
      if (won) row.breakPointWins += 1;
    }
  }

  return [...bySet.entries()]
    .sort(([a], [b]) => a - b)
    .map(([setNumber, row]) => ({
      setNumber,
      ...row,
      sideOutPct: safeDivide(row.sideOutWins, row.sideOutAttempts),
      breakPointPct: safeDivide(row.breakPointWins, row.breakPointAttempts),
    }));
}
