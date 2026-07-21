import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { computeMarkovChain, type MarkovChainKind } from '../model/markov-rally-model';
import '../trends-panel.css';

function formatPct(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : `${(value * 100).toFixed(1)}%`;
}

function probabilityColor(value: number | null): string {
  if (value === null) return 'var(--color-text-secondary)';
  if (value > 0.55) return '#16a34a';
  if (value < 0.45) return '#dc2626';
  return 'var(--color-text-secondary)';
}

export interface MarkovChainPanelProps {
  matches: readonly MatchProject[];
  teamRef: { teamId?: string; teamName?: string };
}

export function MarkovChainPanel({ matches, teamRef }: MarkovChainPanelProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<MarkovChainKind>('side_out');

  const result = useMemo(() => computeMarkovChain(matches, teamRef, kind), [matches, teamRef, kind]);

  return (
    <div className="markov-chain-panel">
      <div className="markov-chain-panel__toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'side_out'}
          className={`markov-chain-panel__toggle-btn${kind === 'side_out' ? ' is-active' : ''}`}
          onClick={() => setKind('side_out')}
        >
          {t('rallyModelSideOutToggle')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'break_point'}
          className={`markov-chain-panel__toggle-btn${kind === 'break_point' ? ' is-active' : ''}`}
          onClick={() => setKind('break_point')}
        >
          {t('rallyModelBreakPointToggle')}
        </button>
      </div>

      <p className="markov-chain-panel__explanation">{t('rallyModelExplanation')}</p>

      {result.insufficientData ? (
        <p className="trends-panel__empty">{t('rallyModelInsufficientData')}</p>
      ) : (
        <>
          {result.excludedStateCount > 0 ? (
            <p className="trends-panel__scarcity-note">
              {t('rallyModelExcludedStatesNote', { count: result.excludedStateCount })}
            </p>
          ) : null}
          <table className="markov-chain-panel__table">
            <thead>
              <tr>
                <th>{t('rallyModelStateHeader')}</th>
                <th>{t('rallyModelSampleSizeHeader')}</th>
                <th>{t('rallyModelWinProbabilityHeader')}</th>
                <th>{t('rallyModelExpectedTouchesHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {result.states.map((row) => (
                <tr key={`${row.state.skill}:${row.state.evaluation}`}>
                  <th scope="row">{t(row.state.skill)} {row.state.evaluation}</th>
                  <td>{row.observedCount}</td>
                  <td style={{ color: probabilityColor(row.winProbability) }}>{formatPct(row.winProbability)}</td>
                  <td>{row.expectedRemainingTouches !== null ? row.expectedRemainingTouches.toFixed(1) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
