// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation, type TranslationKey } from '@src/i18n';
import { formatCount, formatEfficiencyPct, type EfficiencyMetrics } from '../metrics/dashboard-metrics';

function EfficiencyBar({ value }: { value: number | null }) {
  if (value === null) return <span className="perf-dashboard__eff-bar-empty">-</span>;
  const greenPct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="perf-dashboard__eff-bar perf-dashboard__eff-bar--bicolor" title={formatEfficiencyPct(value)}>
      <div className="perf-dashboard__eff-bar-fill perf-dashboard__eff-bar-fill--green" style={{ width: `${greenPct}%` }} />
    </div>
  );
}

const SECTIONS: ReadonlyArray<{
  labelKey: TranslationKey;
  total: keyof EfficiencyMetrics;
  efficiency: keyof EfficiencyMetrics;
}> = [
  { labelKey: 'skillDig', total: 'digTotal', efficiency: 'digEfficiency' },
  { labelKey: 'skillSet', total: 'setTotal', efficiency: 'setEfficiency' },
  { labelKey: 'skillFreeball', total: 'freeballTotal', efficiency: 'freeballEfficiency' },
];

/**
 * Dig, set and freeball: the skills of the DataVolley "Efficienza" table that have no other numbers on
 * the efficiency cards. Shown only when the skill was recorded at least once.
 */
export function EfficiencyExtraSections({ metrics }: { metrics: EfficiencyMetrics }) {
  const { t } = useTranslation();
  return (
    <>
      {SECTIONS.map(({ labelKey, total, efficiency }) => {
        const count = metrics[total] as number;
        if (count <= 0) return null;
        const value = metrics[efficiency] as number | null;
        return (
          <div key={labelKey} className="perf-dashboard__eff-section">
            <div className="perf-dashboard__eff-section-header">
              <span>{t(labelKey)}</span>
              <span className="perf-dashboard__eff-total">{formatCount(count)}</span>
            </div>
            <div className="perf-dashboard__eff-row-bar">
              <span>{t('efficiency')} <strong>{formatEfficiencyPct(value)}</strong></span>
              <EfficiencyBar value={value} />
            </div>
          </div>
        );
      })}
    </>
  );
}
