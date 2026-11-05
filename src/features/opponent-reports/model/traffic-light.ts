/**
 * Traffic light of the opponent report, read from the OPPONENT's point of
 * view: green = the opponent is good there, red = a weak point to attack.
 * Thresholds have defaults, can be edited in Settings, or derived from the
 * matches in the local archive (percentiles of every team's match values).
 * Pure module.
 */
import type { RallyStats } from '@src/features/scouting/model/match-stats';

export type TrafficMetric = 'receptionPositive' | 'sideOut' | 'breakPoint' | 'attackKill' | 'directErrors';

export const TRAFFIC_METRICS: readonly TrafficMetric[] = ['receptionPositive', 'sideOut', 'breakPoint', 'attackKill', 'directErrors'];

/** Metrics where a LOWER value is better for the team. */
const LOWER_IS_BETTER: ReadonlySet<TrafficMetric> = new Set(['directErrors']);

/**
 * Higher-is-better metrics: green from `green` up, red below `red`.
 * Lower-is-better metrics: green up to `green`, red above `red`.
 */
export interface TrafficThreshold {
  green: number;
  red: number;
}

export interface OpponentReportThresholds {
  metrics: Record<TrafficMetric, TrafficThreshold>;
  /** Below this many actions a value is "few data": flagged, and never used for a key. */
  minSample: number;
  source: 'default' | 'history' | 'custom';
}

export const DEFAULT_THRESHOLDS: OpponentReportThresholds = {
  metrics: {
    receptionPositive: { green: 0.5, red: 0.35 },
    sideOut: { green: 0.6, red: 0.5 },
    breakPoint: { green: 0.4, red: 0.3 },
    attackKill: { green: 0.45, red: 0.35 },
    directErrors: { green: 0.1, red: 0.2 },
  },
  minSample: 15,
  source: 'default',
};

export type TrafficBand = 'green' | 'yellow' | 'red' | 'none';

export function trafficBand(
  value: number | null | undefined,
  metric: TrafficMetric,
  thresholds: OpponentReportThresholds,
  sample?: number,
): TrafficBand {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'none';
  if (sample !== undefined && sample < thresholds.minSample) return 'none';
  const { green, red } = thresholds.metrics[metric];
  if (LOWER_IS_BETTER.has(metric)) {
    if (value <= green) return 'green';
    if (value > red) return 'red';
    return 'yellow';
  }
  if (value >= green) return 'green';
  if (value < red) return 'red';
  return 'yellow';
}

export function isFewData(sample: number, thresholds: OpponentReportThresholds): boolean {
  return sample < thresholds.minSample;
}

// ── From history ─────────────────────────────────────────────────────────────

/** One team in one match, as needed to derive thresholds. */
export interface HistoryTeamMatch {
  rallies: readonly RallyStats[];
  side: 'home' | 'away';
  sideOut: { wins: number; attempts: number };
  breakPoint: { wins: number; attempts: number };
}

/** Fewer team-matches than this keep the default for that metric. */
const MIN_HISTORY_VALUES = 6;
const MIN_ACTIONS_PER_VALUE = 10;

function percentile(sorted: readonly number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Thresholds from the archive: for each metric, every team's value in every
 * match; the bottom third is red, the top third green (reversed for errors).
 * The minimum sample becomes the median number of receptions per receiver
 * per match, kept between 8 and 30: about one match of a regular receiver.
 */
export function computeThresholdsFromHistory(teamMatches: readonly HistoryTeamMatch[]): OpponentReportThresholds {
  const values: Record<TrafficMetric, number[]> = {
    receptionPositive: [],
    sideOut: [],
    breakPoint: [],
    attackKill: [],
    directErrors: [],
  };
  const receptionsPerReceiver: number[] = [];

  for (const teamMatch of teamMatches) {
    let receptions = 0;
    let positiveReceptions = 0;
    let attacks = 0;
    let kills = 0;
    let serves = 0;
    let errors = 0;
    const byReceiver = new Map<string, number>();
    for (const rally of teamMatch.rallies) {
      for (const touch of rally.touches) {
        if (touch.teamSide !== teamMatch.side) continue;
        if (touch.skill === 'receive') {
          receptions += 1;
          if (touch.evaluation === '#' || touch.evaluation === '+') positiveReceptions += 1;
          if (touch.playerId) byReceiver.set(touch.playerId, (byReceiver.get(touch.playerId) ?? 0) + 1);
        } else if (touch.skill === 'attack') {
          attacks += 1;
          if (touch.evaluation === '#') kills += 1;
          if (touch.evaluation === '=') errors += 1;
        } else if (touch.skill === 'serve') {
          serves += 1;
          if (touch.evaluation === '=') errors += 1;
        }
      }
    }
    if (receptions >= MIN_ACTIONS_PER_VALUE) values.receptionPositive.push(positiveReceptions / receptions);
    if (attacks >= MIN_ACTIONS_PER_VALUE) values.attackKill.push(kills / attacks);
    if (attacks + serves >= MIN_ACTIONS_PER_VALUE) values.directErrors.push(errors / (attacks + serves));
    if (teamMatch.sideOut.attempts >= MIN_ACTIONS_PER_VALUE) values.sideOut.push(teamMatch.sideOut.wins / teamMatch.sideOut.attempts);
    if (teamMatch.breakPoint.attempts >= MIN_ACTIONS_PER_VALUE) {
      values.breakPoint.push(teamMatch.breakPoint.wins / teamMatch.breakPoint.attempts);
    }
    // Regular receivers only: a player with a couple of receptions says nothing about the sample size.
    byReceiver.forEach((count) => {
      if (count >= 5) receptionsPerReceiver.push(count);
    });
  }

  const metrics = { ...DEFAULT_THRESHOLDS.metrics };
  for (const metric of TRAFFIC_METRICS) {
    const sorted = [...values[metric]].sort((left, right) => left - right);
    if (sorted.length < MIN_HISTORY_VALUES) continue;
    const low = round(percentile(sorted, 1 / 3));
    const high = round(percentile(sorted, 2 / 3));
    metrics[metric] = LOWER_IS_BETTER.has(metric) ? { green: low, red: high } : { green: high, red: low };
  }

  const sortedReceptions = [...receptionsPerReceiver].sort((left, right) => left - right);
  const minSample = sortedReceptions.length > 0
    ? Math.min(30, Math.max(8, Math.round(percentile(sortedReceptions, 0.5))))
    : DEFAULT_THRESHOLDS.minSample;

  return { metrics, minSample, source: 'history' };
}
