import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { computeCategoryEvaluationTrend } from './evaluation-breakdown';
import { StackedEvaluationChart } from './StackedEvaluationChart';
import { TrendArrow } from './TrendArrow';
import type { CategoryDiagnosisEntry } from './radar-series';

interface CategoryDrillDownChartProps {
  matches: readonly MatchProject[];
  teamRef: { teamId?: string; teamName?: string };
  entry: CategoryDiagnosisEntry;
  playerId?: string;
}

function CategoryDrillDownChart({ matches, teamRef, entry, playerId }: CategoryDrillDownChartProps) {
  const points = useMemo(
    () => computeCategoryEvaluationTrend(matches, teamRef, entry.category.evaluationSkill, playerId),
    [matches, teamRef, entry.category.evaluationSkill, playerId],
  );
  return <StackedEvaluationChart points={points} />;
}

export interface CategoryDrillDownListProps {
  diagnosis: readonly CategoryDiagnosisEntry[];
  matches: readonly MatchProject[];
  teamRef: { teamId?: string; teamName?: string };
  playerId?: string;
}

/**
 * Per-category list: label + a big trend arrow (signed current-vs-benchmark,
 * see `deficit-score.ts`) always visible, expanding into the per-match
 * evaluation-mix stacked bar on click — the overview (radar/bars) says
 * *which* category is weak, this says *why* and whether it's trending.
 */
export function CategoryDrillDownList({ diagnosis, matches, teamRef, playerId }: CategoryDrillDownListProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (diagnosis.length === 0) return null;

  return (
    <div className="priorities-panel__drilldown-list">
      {diagnosis.map((entry) => {
        const isExpanded = expandedId === entry.category.id;
        return (
          <div key={entry.category.id} className="priorities-panel__drilldown-item">
            <button
              type="button"
              className="priorities-panel__drilldown-header"
              onClick={() => setExpandedId(isExpanded ? null : entry.category.id)}
              aria-expanded={isExpanded}
            >
              <span className="priorities-panel__drilldown-label">{t(entry.category.labelKey)}</span>
              <TrendArrow tier={entry.trend} />
              <span className="priorities-panel__drilldown-toggle" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
            </button>
            {isExpanded && (
              <div className="priorities-panel__drilldown-body">
                <p className="priorities-panel__drilldown-hint">{t('prioritiesEvaluationTrendHint')}</p>
                <CategoryDrillDownChart matches={matches} teamRef={teamRef} entry={entry} playerId={playerId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
