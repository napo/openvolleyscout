import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { RadarComparisonChart } from '../../radar/RadarComparisonChart';
import type { RadarAxisId } from '../../radar/model/radar-metrics';
import type { RadarScaleMode } from '../../radar/model/radar-normalization';
import { buildRadarSeriesPair, radarAxisIdsFromDiagnosis, rawRateEntriesFromDiagnosis, type CategoryDiagnosisEntry } from './radar-series';
import { CategoryDrillDownList } from './CategoryDrillDownList';

export interface CategoryRadarChartProps {
  title: string;
  diagnosis: readonly CategoryDiagnosisEntry[];
  currentLabel: string;
  benchmarkLabel: string;
  matches: readonly MatchProject[];
  teamRef: { teamId?: string; teamName?: string };
  playerId?: string;
}

function formatRawRateValue(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

function RawRateBar({ entry, currentLabel, benchmarkLabel }: {
  entry: CategoryDiagnosisEntry;
  currentLabel: string;
  benchmarkLabel: string;
}) {
  const { t } = useTranslation();
  const values = [entry.current, entry.benchmark].filter((v): v is number => v !== null);
  const maxValue = values.length > 0 ? Math.max(...values, 0.0001) : 1;

  return (
    <div className="priorities-panel__raw-rate">
      <div className="priorities-panel__raw-rate-title">{t(entry.category.labelKey)}</div>
      {[{ label: currentLabel, value: entry.current, key: 'current' }, { label: benchmarkLabel, value: entry.benchmark, key: 'benchmark' }].map((row) => (
        <div key={row.key} className="priorities-panel__raw-rate-row">
          <span className="priorities-panel__raw-rate-label">{row.label}</span>
          <div className="priorities-panel__raw-rate-bar-wrap">
            <div
              className={`priorities-panel__raw-rate-bar priorities-panel__raw-rate-bar--${row.key}`}
              style={{ width: row.value !== null ? `${Math.min((row.value / maxValue) * 100, 100)}%` : '0%' }}
            />
          </div>
          <span className="priorities-panel__raw-rate-value">{formatRawRateValue(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryRadarChart({
  title, diagnosis, currentLabel, benchmarkLabel, matches, teamRef, playerId,
}: CategoryRadarChartProps) {
  const [axisIds, setAxisIds] = useState<RadarAxisId[]>(() => radarAxisIdsFromDiagnosis(diagnosis));
  const [scaleMode, setScaleMode] = useState<RadarScaleMode>('fixed');

  const series = buildRadarSeriesPair(diagnosis, currentLabel, benchmarkLabel);
  const rawRateEntries = rawRateEntriesFromDiagnosis(diagnosis);

  return (
    <div className="priorities-panel__chart-block">
      <RadarComparisonChart
        title={title}
        series={series}
        axisIds={axisIds}
        onAxisIdsChange={setAxisIds}
        scaleMode={scaleMode}
        onScaleModeChange={setScaleMode}
      />
      {rawRateEntries.length > 0 && (
        <div className="priorities-panel__raw-rates">
          {rawRateEntries.map((entry) => (
            <RawRateBar key={entry.category.id} entry={entry} currentLabel={currentLabel} benchmarkLabel={benchmarkLabel} />
          ))}
        </div>
      )}
      <CategoryDrillDownList diagnosis={diagnosis} matches={matches} teamRef={teamRef} playerId={playerId} />
    </div>
  );
}
