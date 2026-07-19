import { useMemo } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from '@src/i18n';
import { formatEfficiencyPct } from '../dashboard/metrics/dashboard-metrics';
import { RADAR_AXES, type RadarAxisId } from './model/radar-metrics';
import {
  normalizeRadarSeries,
  toRechartsRadarData,
  type RadarSeries,
  type RadarScaleMode,
} from './model/radar-normalization';
import './radar-chart.css';

const MIN_AXES = 3;
const SERIES_COLORS = ['#4f8ff7', '#f76c5e', '#5ec962', '#f7b32b', '#9b5de5', '#14b8a6'];

export interface RadarComparisonChartProps {
  series: RadarSeries[];
  axisIds: readonly RadarAxisId[];
  onAxisIdsChange: (ids: RadarAxisId[]) => void;
  scaleMode: RadarScaleMode;
  onScaleModeChange: (mode: RadarScaleMode) => void;
  title: string;
}

type TooltipItem = { value?: number };

function RadarTooltip({
  active,
  label,
  rawByAxisLabel,
  seriesLabelById,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipItem[];
  rawByAxisLabel: Map<string, Record<string, number | null>>;
  seriesLabelById: Map<string, string>;
}) {
  if (!active || typeof label !== 'string') return null;
  const raw = rawByAxisLabel.get(label);
  if (!raw) return null;

  return (
    <div className="radar-chart__tooltip">
      <p className="radar-chart__tooltip-axis">{label}</p>
      {[...seriesLabelById.entries()].map(([seriesId, seriesLabel]) => (
        <p key={seriesId} className="radar-chart__tooltip-row">
          <span>{seriesLabel}</span>
          <span>{formatEfficiencyPct(raw[seriesId] ?? null)}</span>
        </p>
      ))}
    </div>
  );
}

export function RadarComparisonChart({
  series,
  axisIds,
  onAxisIdsChange,
  scaleMode,
  onScaleModeChange,
  title,
}: RadarComparisonChartProps) {
  const { t } = useTranslation();

  const axisLabels = useMemo(() => {
    const map: Partial<Record<RadarAxisId, string>> = {};
    for (const axis of RADAR_AXES) map[axis.id] = t(axis.labelKey);
    return map;
  }, [t]);

  const points = useMemo(
    () => normalizeRadarSeries(series, axisIds, scaleMode),
    [series, axisIds, scaleMode],
  );
  const data = useMemo(() => toRechartsRadarData(points, axisLabels), [points, axisLabels]);

  const rawByAxisLabel = useMemo(() => {
    const map = new Map<string, Record<string, number | null>>();
    for (const point of points) {
      map.set(axisLabels[point.axis] ?? point.axis, point.raw);
    }
    return map;
  }, [points, axisLabels]);

  const seriesLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of series) map.set(s.seriesId, s.label);
    return map;
  }, [series]);

  const toggleAxis = (axisId: RadarAxisId) => {
    const isSelected = axisIds.includes(axisId);
    if (isSelected) {
      if (axisIds.length <= MIN_AXES) return;
      onAxisIdsChange(axisIds.filter((id) => id !== axisId));
    } else {
      onAxisIdsChange([...axisIds, axisId]);
    }
  };

  return (
    <div className="radar-chart">
      <div className="radar-chart__header">
        <h3 className="radar-chart__title">{title}</h3>
        <div className="radar-chart__scale-toggle" role="group" aria-label={t('radarScaleModeRelative')}>
          <button
            type="button"
            className={`radar-chart__scale-btn${scaleMode === 'relative' ? ' radar-chart__scale-btn--active' : ''}`}
            onClick={() => onScaleModeChange('relative')}
          >
            {t('radarScaleModeRelative')}
          </button>
          <button
            type="button"
            className={`radar-chart__scale-btn${scaleMode === 'fixed' ? ' radar-chart__scale-btn--active' : ''}`}
            onClick={() => onScaleModeChange('fixed')}
          >
            {t('radarScaleModeFixed')}
          </button>
        </div>
      </div>

      <div className="radar-chart__axis-picker" role="group" aria-label={t('radarAxisPicker')}>
        {RADAR_AXES.map((axis) => (
          <label key={axis.id} className="radar-chart__axis-option">
            <input
              type="checkbox"
              checked={axisIds.includes(axis.id)}
              onChange={() => toggleAxis(axis.id)}
            />
            {t(axis.labelKey)}
          </label>
        ))}
      </div>
      {axisIds.length <= MIN_AXES && (
        <p className="radar-chart__hint">{t('radarMinAxesWarning')}</p>
      )}

      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {series.map((s, index) => (
            <Radar
              key={s.seriesId}
              name={s.label}
              dataKey={s.seriesId}
              stroke={s.color ?? SERIES_COLORS[index % SERIES_COLORS.length]}
              fill={s.color ?? SERIES_COLORS[index % SERIES_COLORS.length]}
              fillOpacity={0.15}
              isAnimationActive
            />
          ))}
          <Legend />
          <Tooltip content={<RadarTooltip rawByAxisLabel={rawByAxisLabel} seriesLabelById={seriesLabelById} />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
