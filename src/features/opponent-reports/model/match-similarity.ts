/**
 * Indices that help choose which matches of an opponent to include in a
 * report. Pure module.
 *
 * - "Similar to us": how much the team the opponent faced in a match plays
 *   like our team. The more similar, the more that match shows how the
 *   opponent plays against a team like ours.
 * - "Typical": how much the opponent played in that match like it usually
 *   does (its average over its other listed matches). A low value flags an
 *   unusual match (different line-up, a match that did not count…).
 *
 * Both compare radar profiles (the default similarity axes). Each axis is
 * scaled by its theoretical range, so the score does not depend on which
 * matches happen to be listed: 100 = identical, 0 = an average difference of
 * a quarter of the axis range or more.
 */
import { RADAR_AXES, type RadarAxisId, type RadarValues } from '../../analytics/radar/model/radar-metrics';

/** Same axes as the cross-database similarity. */
export const MATCH_SIMILARITY_AXES: readonly RadarAxisId[] = [
  'serveEfficiency',
  'receptionEfficiency',
  'attackEfficiency',
  'sideOutPct',
  'breakPointPct',
  'servePositiveRate',
  'receptionPositiveRate',
  'attackKillRate',
];

/** Fewer shared axes than this give no score. */
export const MIN_SHARED_AXES = 5;

/** Average difference (fraction of the axis range) at which the score reaches 0. */
const ZERO_SCORE_DIFFERENCE = 0.25;

const AXIS_RANGE = new Map(RADAR_AXES.map((axis) => [axis.id, axis.theoreticalMax - axis.theoreticalMin]));

const isValue = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

/** 0..100, or null when the profiles share fewer than MIN_SHARED_AXES axes. */
export function radarProfileSimilarity(a: RadarValues, b: RadarValues): number | null {
  const differences: number[] = [];
  for (const axis of MATCH_SIMILARITY_AXES) {
    const valueA = a[axis];
    const valueB = b[axis];
    const range = AXIS_RANGE.get(axis);
    if (!isValue(valueA) || !isValue(valueB) || !range) continue;
    differences.push((valueA - valueB) / range);
  }
  if (differences.length < MIN_SHARED_AXES) return null;
  const rms = Math.sqrt(differences.reduce((sum, value) => sum + value * value, 0) / differences.length);
  return Math.round(100 * Math.max(0, 1 - rms / ZERO_SCORE_DIFFERENCE));
}

/** Per-axis mean of the profiles that have a value on that axis. */
export function averageRadarValues(profiles: readonly RadarValues[]): RadarValues {
  const result: RadarValues = {};
  for (const axis of MATCH_SIMILARITY_AXES) {
    const values = profiles.map((profile) => profile[axis]).filter(isValue);
    if (values.length > 0) result[axis] = values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return result;
}

export interface OpponentMatchProfile {
  matchId: string;
  /** The opponent's profile in that match. */
  opponent: RadarValues;
  /** The profile of the team the opponent faced in that match. */
  faced: RadarValues;
}

export interface OpponentMatchSimilarity {
  /** Faced team vs our team; null without our team or with too few data. */
  similarToOwn: number | null;
  /** Opponent in this match vs its average in the other matches; null with a single match. */
  typical: number | null;
}

/**
 * `ownProfile`: our team's average profile (null when the report has no own team).
 * "Typical" compares each match with the average of the OTHER matches, so a
 * single odd match does not pull its own reference.
 */
export function computeOpponentMatchSimilarities(
  matches: readonly OpponentMatchProfile[],
  ownProfile: RadarValues | null,
): Map<string, OpponentMatchSimilarity> {
  const result = new Map<string, OpponentMatchSimilarity>();
  matches.forEach((match, index) => {
    const others = matches.filter((_, otherIndex) => otherIndex !== index).map((other) => other.opponent);
    result.set(match.matchId, {
      similarToOwn: ownProfile ? radarProfileSimilarity(match.faced, ownProfile) : null,
      typical: others.length > 0 ? radarProfileSimilarity(match.opponent, averageRadarValues(others)) : null,
    });
  });
  return result;
}
