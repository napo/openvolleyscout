import { DEFAULT_THRESHOLDS } from '../../opponent-reports/model/traffic-light';
import type { CrossRotationAggregate } from '@src/features/scouting/model/match-stats';

export type CrossRotationView = 'breakPoint' | 'sideOut';

/**
 * Green from `good`, red up to `bad`: the same limits as the traffic lights of the tactical reports
 * (side-out 60% / 50%, break point 40% / 30%), so a value has one colour wherever it is shown.
 */
export const CROSS_ROTATION_THRESHOLDS: Record<CrossRotationView, { good: number; bad: number }> = {
  sideOut: { good: DEFAULT_THRESHOLDS.metrics.sideOut.green, bad: DEFAULT_THRESHOLDS.metrics.sideOut.red },
  breakPoint: { good: DEFAULT_THRESHOLDS.metrics.breakPoint.green, bad: DEFAULT_THRESHOLDS.metrics.breakPoint.red },
};

export function getCrossRotationPercentage(aggregate: CrossRotationAggregate, view: CrossRotationView): number | null {
  return view === 'breakPoint' ? aggregate.breakPointPercentage : aggregate.sideOutPercentage;
}

export function getCrossRotationWins(aggregate: CrossRotationAggregate, view: CrossRotationView): number {
  return view === 'breakPoint' ? aggregate.breakPointWins : aggregate.sideOutWins;
}

export function getCrossRotationCellTone(pct: number | null, view: CrossRotationView): 'green' | 'red' | null {
  if (pct === null) return null;
  const { good, bad } = CROSS_ROTATION_THRESHOLDS[view];
  if (pct >= good) return 'green';
  if (pct <= bad) return 'red';
  return null;
}

export function formatCrossRotationCellMain(
  aggregate: CrossRotationAggregate,
  view: CrossRotationView,
): { fraction: string; percentage: string } {
  if (aggregate.attempts === 0) {
    return { fraction: '-', percentage: '' };
  }
  const wins = getCrossRotationWins(aggregate, view);
  const pct = getCrossRotationPercentage(aggregate, view);
  return {
    fraction: `${wins}/${aggregate.attempts}`,
    percentage: pct === null ? '' : `${(pct * 100).toFixed(0)}%`,
  };
}
