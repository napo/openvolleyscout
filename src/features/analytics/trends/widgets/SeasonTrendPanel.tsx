import { useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { RADAR_AXES, type RadarAxisId } from '../../radar/model/radar-metrics';
import { computeSeasonTrend, computeDeltaVsAverage } from '../model/season-trend';
import '../trends-panel.css';

const CHART_COLORS = {
  line: 'var(--color-primary)',
  grid: 'var(--color-border, rgba(15, 23, 42, 0.12))',
  text: 'var(--color-text-secondary)',
};

function formatPct(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : `${(value * 100).toFixed(1)}%`;
}

function deltaColor(delta: number | null): string {
  if (delta === null) return 'var(--color-text-secondary)';
  if (delta > 0.005) return '#16a34a';
  if (delta < -0.005) return '#dc2626';
  return 'var(--color-text-secondary)';
}

export interface SeasonTrendPanelProps {
  matches: readonly MatchProject[];
  teamRef: { teamId?: string; teamName?: string };
}

export function SeasonTrendPanel({ matches, teamRef }: SeasonTrendPanelProps) {
  const { t } = useTranslation();
  const [selectedAxis, setSelectedAxis] = useState<RadarAxisId>('attackEfficiency');

  const trend = useMemo(() => computeSeasonTrend(matches, teamRef), [matches, teamRef]);
  const deltas = useMemo(() => computeDeltaVsAverage(trend), [trend]);

  const chartData = useMemo(() => trend.map((point, index) => ({
    index: index + 1,
    date: point.playedAt,
    opponent: point.opponentName,
    value: point.values[selectedAxis] ?? null,
  })), [trend, selectedAxis]);

  if (trend.length === 0) {
    return <p className="trends-panel__empty">{t('seasonTrendNoHistory')}</p>;
  }

  return (
    <div className="season-trend-panel">
      <div className="season-trend-panel__picker">
        <label htmlFor="season-trend-metric" className="season-trend-panel__picker-label">
          {t('seasonTrendMetricPickerLabel')}
        </label>
        <select
          id="season-trend-metric"
          value={selectedAxis}
          onChange={(e) => setSelectedAxis(e.target.value as RadarAxisId)}
        >
          {RADAR_AXES.map((axis) => (
            <option key={axis.id} value={axis.id}>{t(axis.labelKey)}</option>
          ))}
        </select>
      </div>

      <div className="season-trend-panel__chart">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 14, right: 14, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} />
            <XAxis dataKey="index" allowDecimals={false} stroke={CHART_COLORS.text} />
            <YAxis stroke={CHART_COLORS.text} tickFormatter={(v: number) => formatPct(v)} />
            <Tooltip
              labelFormatter={(label: unknown) => {
                const point = chartData[Number(label) - 1];
                return point ? `${point.date ?? ''} · ${t('vs')} ${point.opponent}` : String(label);
              }}
              formatter={(value: unknown) => [
                formatPct(typeof value === 'number' ? value : null),
                t(RADAR_AXES.find((a) => a.id === selectedAxis)!.labelKey),
              ]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              name={t(RADAR_AXES.find((a) => a.id === selectedAxis)!.labelKey)}
              stroke={CHART_COLORS.line}
              strokeWidth={3}
              dot
              connectNulls
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h4 className="season-trend-panel__delta-title">{t('seasonTrendDeltaTableTitle')}</h4>
      <table className="season-trend-panel__delta-table">
        <thead>
          <tr>
            <th>{t('seasonTrendMetricPickerLabel')}</th>
            <th>{t('seasonTrendLatestShort')}</th>
            <th>{t('seasonTrendAverageShort')}</th>
            <th>{t('seasonTrendDeltaShort')}</th>
          </tr>
        </thead>
        <tbody>
          {deltas.map((row) => (
            <tr key={row.axis}>
              <th scope="row">{t(RADAR_AXES.find((a) => a.id === row.axis)!.labelKey)}</th>
              <td>{formatPct(row.latest)}</td>
              <td>{formatPct(row.average)}</td>
              <td style={{ color: deltaColor(row.delta) }}>
                {row.delta === null ? '-' : `${row.delta > 0 ? '+' : ''}${(row.delta * 100).toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
