import type { TeamSide } from '@src/domain/common/enums';
import { getActiveIndicators } from '@src/features/scouting/model/indicator-settings';
import type {
  MatchStats,
  PlayerStats,
  SkillStats,
  TrackedSkill,
} from '@src/features/scouting/model/match-stats';
import { formatPercent } from '@src/lib/utils/format-percent';
import { safeDivide } from '@src/features/scouting/model/match-stats';
import { computePlayerServeWins, computePlayerReceptionWins } from '@src/features/scouting/model/match-report';
import { createTeamScopedPlayerKey } from '@src/domain/lineup';
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

  digTotal: number;
  digEfficiency: number | null;

  setTotal: number;
  setEfficiency: number | null;

  freeballTotal: number;
  freeballEfficiency: number | null;
}

export function computeEfficiencyFromTeamStats(
  stats: MatchStats,
  teamSide: TeamSide,
): EfficiencyMetrics {
  const qs = stats.quickStats.teams[teamSide];
  const ts = stats.teamStats[teamSide];
  const indicators = getActiveIndicators();

  return {
    serveTotal: qs.serve.total,
    serveAces: qs.serve.aces,
    serveErrors: qs.serve.errors,
    serveEfficiency: qs.serve.efficiency,

    receptionTotal: qs.reception.total,
    receptionPerfect: qs.reception.perfect,
    receptionPositive: qs.reception.perfect + qs.reception.positive,
    receptionErrors: qs.reception.errors,
    receptionEfficiency: qs.reception.efficiency,
    receptionPerfectPct: qs.reception.perfectPercentage,
    receptionPositivePct: safeDivide(qs.reception.perfect + qs.reception.positive, qs.reception.total),

    attackAttempts: qs.attack.attempts,
    attackPoints: qs.attack.points,
    attackErrors: qs.attack.errors,
    attackBlocked: qs.attack.blocked,
    attackEfficiency: qs.attack.efficiency,
    attackKillPct: qs.attack.killPercentage,

    blockAttempts: ts.block.total,
    blockPoints: ts.blockPoints,
    blockEfficiency: indicators.blockEfficiency(ts.block),

    digTotal: ts.dig.total,
    digEfficiency: indicators.digEfficiency(ts.dig),
    setTotal: ts.set.total,
    setEfficiency: indicators.setEfficiency(ts.set),
    freeballTotal: ts.freeball.total,
    freeballEfficiency: indicators.freeballEfficiency(ts.freeball),
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
  _opponentAttackTotal: number,
  others: { dig: SkillStats; set: SkillStats; freeball: SkillStats },
): EfficiencyMetrics {
  const indicators = getActiveIndicators();
  return {
    serveTotal: serve.total,
    serveAces: aces,
    serveErrors,
    serveEfficiency: getActiveIndicators().serveEfficiency(serve),

    receptionTotal: receive.total,
    receptionPerfect: receive.perfect,
    receptionPositive: receive.perfect + receive.positive,
    receptionErrors,
    receptionEfficiency: getActiveIndicators().receptionEfficiency(receive),
    receptionPerfectPct: safeDivide(receive.perfect, receive.total),
    receptionPositivePct: safeDivide(receive.perfect + receive.positive, receive.total),

    attackAttempts: attack.total,
    attackPoints,
    attackErrors,
    attackBlocked,
    attackEfficiency: getActiveIndicators().attackEfficiency(attack),
    attackKillPct: safeDivide(attackPoints, attack.total),

    blockAttempts: block.total,
    blockPoints,
    blockEfficiency: indicators.blockEfficiency(block),

    digTotal: others.dig.total,
    digEfficiency: indicators.digEfficiency(others.dig),
    setTotal: others.set.total,
    setEfficiency: indicators.setEfficiency(others.set),
    freeballTotal: others.freeball.total,
    freeballEfficiency: indicators.freeballEfficiency(others.freeball),
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
    { dig: s.dig, set: s.set, freeball: s.freeball },
  );
}

export interface SkillPointsErrors {
  skill: TrackedSkill;
  points: number;
  errors: number;
  total: number;
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
    efficiency: getActiveIndicators().serveEfficiency(player.serve),
  };
}

export function computePlayerReceptionSummary(player: PlayerStats): PlayerReceptionSummary {
  const r = player.receive;
  return {
    total: r.total,
    perfect: r.perfect,
    positive: r.perfect + r.positive,
    errors: player.receptionErrors,
    efficiency: getActiveIndicators().receptionEfficiency(r),
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
    efficiency: getActiveIndicators().attackEfficiency(a),
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

export const formatEfficiencyPct = (value: number | null): string => formatPercent(value);

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
