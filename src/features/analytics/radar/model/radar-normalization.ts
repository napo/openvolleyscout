import { RADAR_AXES, type RadarAxisId, type RadarValues } from './radar-metrics';

export type RadarScaleMode = 'relative' | 'fixed';

export interface RadarSeries {
  seriesId: string;
  label: string;
  color?: string;
  values: RadarValues;
}

export interface NormalizedRadarPoint {
  axis: RadarAxisId;
  /** seriesId -> raw metric value (null when undefined for that series). */
  raw: Record<string, number | null>;
  /** seriesId -> value rescaled to 0..100 (null when the raw value is null). */
  normalized: Record<string, number | null>;
}

function theoreticalRange(axisId: RadarAxisId): { min: number; max: number } {
  const axis = RADAR_AXES.find((a) => a.id === axisId);
  return axis ? { min: axis.theoreticalMin, max: axis.theoreticalMax } : { min: 0, max: 1 };
}

function toPercent(raw: number, min: number, max: number): number {
  if (max === min) return 50;
  const clamped = Math.min(Math.max(raw, min), max);
  return ((clamped - min) / (max - min)) * 100;
}

/**
 * Rescales each axis independently to a 0..100 range so efficiency (~[-1,1])
 * and rate metrics (~[0,1]) can be plotted on the same radar without one
 * dwarfing the other.
 *
 * - `relative`: min/max taken from the series actually being compared —
 *   maximizes shape readability for 2-5 entities, at the cost of always
 *   saturating 0/100% when exactly 2 series are shown (raw values are kept
 *   alongside for that reason).
 * - `fixed`: min/max taken from the indicator's theoretical range — stays
 *   comparable across different charts, at the cost of compressing real-world
 *   efficiency values (which rarely span the full [-1,1] range) near the center.
 */
export function normalizeRadarSeries(
  series: readonly RadarSeries[],
  axisIds: readonly RadarAxisId[],
  mode: RadarScaleMode,
): NormalizedRadarPoint[] {
  return axisIds.map((axis) => {
    const raw: Record<string, number | null> = {};
    for (const s of series) {
      raw[s.seriesId] = s.values[axis] ?? null;
    }

    const rawValues = Object.values(raw).filter((v): v is number => v !== null);
    const { min: theoreticalMin, max: theoreticalMax } = theoreticalRange(axis);

    let min: number;
    let max: number;
    if (mode === 'fixed' || rawValues.length === 0) {
      min = theoreticalMin;
      max = theoreticalMax;
    } else {
      min = Math.min(...rawValues);
      max = Math.max(...rawValues);
      if (min === max) {
        // Fallback to the theoretical range for this axis only: avoids a
        // division by zero and a misleading flat/degenerate polygon.
        min = theoreticalMin;
        max = theoreticalMax;
      }
    }

    const normalized: Record<string, number | null> = {};
    for (const s of series) {
      const value = raw[s.seriesId];
      normalized[s.seriesId] = value === null ? null : toPercent(value, min, max);
    }

    return { axis, raw, normalized };
  });
}

export interface RadarChartRow {
  axis: string;
  [seriesId: string]: string | number | null;
}

/**
 * Converts normalized points into Recharts-ready rows. `axisLabels` lets the
 * caller (which owns the translation function) supply human-readable axis
 * names — this module stays translation-agnostic and testable in isolation.
 */
export function toRechartsRadarData(
  points: readonly NormalizedRadarPoint[],
  axisLabels: Partial<Record<RadarAxisId, string>> = {},
): RadarChartRow[] {
  return points.map((point) => {
    const row: RadarChartRow = { axis: axisLabels[point.axis] ?? point.axis };
    for (const [seriesId, value] of Object.entries(point.normalized)) {
      row[seriesId] = value;
    }
    return row;
  });
}
