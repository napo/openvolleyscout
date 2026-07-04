import type { CrossRotationAggregate } from '@src/features/scouting/model/match-stats';

export type CrossRotationView = 'breakPoint' | 'sideOut';

const THRESHOLDS: Record<CrossRotationView, { good: number; bad: number }> = {
  sideOut: { good: 0.55, bad: 0.45 },
  breakPoint: { good: 0.4, bad: 0.3 },
};

export function getCrossRotationPercentage(aggregate: CrossRotationAggregate, view: CrossRotationView): number | null {
  return view === 'breakPoint' ? aggregate.breakPointPercentage : aggregate.sideOutPercentage;
}

export function getCrossRotationWins(aggregate: CrossRotationAggregate, view: CrossRotationView): number {
  return view === 'breakPoint' ? aggregate.breakPointWins : aggregate.sideOutWins;
}

export function getCrossRotationCellTone(pct: number | null, view: CrossRotationView): 'green' | 'red' | null {
  if (pct === null) return null;
  const { good, bad } = THRESHOLDS[view];
  if (pct >= good) return 'green';
  if (pct <= bad) return 'red';
  return null;
}

export function formatCrossRotationCellMain(
  aggregate: CrossRotationAggregate,
  view: CrossRotationView,
): { fraction: string; percentage: string } {
  if (aggregate.attempts === 0) {
    return { fraction: '—', percentage: '' };
  }
  const wins = getCrossRotationWins(aggregate, view);
  const pct = getCrossRotationPercentage(aggregate, view);
  return {
    fraction: `${wins}/${aggregate.attempts}`,
    percentage: pct === null ? '' : `${(pct * 100).toFixed(0)}%`,
  };
}
