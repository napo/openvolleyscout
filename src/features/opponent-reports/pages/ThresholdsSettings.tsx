import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { matchRepository } from '@src/infrastructure/repositories';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import {
  computeThresholdsFromHistory,
  TRAFFIC_METRICS,
  type HistoryTeamMatch,
  type TrafficMetric,
} from '../model/traffic-light';
import { useOpponentReportThresholds } from '../model/thresholds-store';

const METRIC_LABELS: Record<TrafficMetric, TranslationKey> = {
  receptionPositive: 'opponentReportMetricReceptionPositive',
  sideOut: 'opponentReportMetricSideOut',
  breakPoint: 'opponentReportMetricBreakPoint',
  attackKill: 'opponentReportMetricAttackKill',
  directErrors: 'opponentReportMetricDirectErrors',
};

const toPercent = (value: number) => Math.round(value * 100);

/** Settings section: traffic-light thresholds and minimum sample of the opponent reports. */
export function OpponentReportThresholdsSettings() {
  const { t } = useTranslation();
  const { thresholds, setThresholds, reset } = useOpponentReportThresholds();
  const [historyState, setHistoryState] = useState<'idle' | 'busy' | 'done' | 'empty'>('idle');

  const setValue = (metric: TrafficMetric, key: 'green' | 'red', percent: number) => {
    if (!Number.isFinite(percent)) return;
    setThresholds({
      ...thresholds,
      source: 'custom',
      metrics: { ...thresholds.metrics, [metric]: { ...thresholds.metrics[metric], [key]: percent / 100 } },
    });
  };

  const fromHistory = async () => {
    setHistoryState('busy');
    const projects = await matchRepository.list();
    const teamMatches: HistoryTeamMatch[] = projects.flatMap((project) => {
      const stats = buildProjectMatchStats(project);
      return (['home', 'away'] as const).map((side) => ({
        side,
        rallies: stats.rallyStats,
        sideOut: { wins: stats.advancedStats.sideOut[side].sideOutWins, attempts: stats.advancedStats.sideOut[side].sideOutAttempts },
        breakPoint: { wins: stats.advancedStats.breakPoint[side].breakPointWins, attempts: stats.advancedStats.breakPoint[side].breakPointAttempts },
      }));
    });
    if (teamMatches.length === 0) {
      setHistoryState('empty');
      return;
    }
    setThresholds(computeThresholdsFromHistory(teamMatches));
    setHistoryState('done');
  };

  return (
    <section className="settings-page__section">
      <h2 className="settings-page__section-title">{t('opponentReportThresholdsTitle')}</h2>
      <p className="settings-page__text">{t('opponentReportThresholdsDescription')}</p>
      <table className="settings-page__compound-table">
        <thead>
          <tr>
            <th>{t('opponentReportThresholdMetric')}</th>
            <th>{t('opponentReportThresholdGreen')}</th>
            <th>{t('opponentReportThresholdRed')}</th>
          </tr>
        </thead>
        <tbody>
          {TRAFFIC_METRICS.map((metric) => (
            <tr key={metric}>
              <td>{t(METRIC_LABELS[metric])}</td>
              {(['green', 'red'] as const).map((key) => (
                <td key={key}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={toPercent(thresholds.metrics[metric][key])}
                    onChange={(event) => setValue(metric, key, Number(event.target.value))}
                    aria-label={`${t(METRIC_LABELS[metric])} ${key === 'green' ? t('opponentReportThresholdGreen') : t('opponentReportThresholdRed')}`}
                    style={{ width: '4.5rem' }}
                  />
                  {' %'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="settings-page__text">{t('opponentReportThresholdErrorsNote')}</p>
      <label className="settings-page__checkbox-label">
        <span>{t('opponentReportThresholdMinSample')}</span>
        <input
          type="number"
          min={1}
          max={200}
          value={thresholds.minSample}
          onChange={(event) => {
            const value = Math.round(Number(event.target.value));
            if (value >= 1) setThresholds({ ...thresholds, minSample: value, source: 'custom' });
          }}
          style={{ width: '4.5rem', marginInlineStart: '0.5rem' }}
        />
      </label>
      <p className="settings-page__text">
        {t(`opponentReportThresholdSource_${thresholds.source}` as TranslationKey)}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" onClick={() => void fromHistory()} disabled={historyState === 'busy'}>
          {historyState === 'busy' ? t('loading') : t('opponentReportThresholdFromHistory')}
        </button>
        <button type="button" className="btn-secondary" onClick={reset}>{t('opponentReportThresholdReset')}</button>
      </div>
      {historyState === 'done' ? <p className="settings-page__text">{t('opponentReportThresholdFromHistoryDone')}</p> : null}
      {historyState === 'empty' ? <p className="settings-page__text">{t('opponentReportThresholdFromHistoryEmpty')}</p> : null}
    </section>
  );
}
