import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { SimilarityPanel, type SimilarityFocus } from '../similarity/SimilarityPanel';
import { SeasonTrendPanel } from './widgets/SeasonTrendPanel';
import { CompetitionComparisonPanel } from './widgets/CompetitionComparisonPanel';
import { MarkovChainPanel } from './widgets/MarkovChainPanel';
import './trends-panel.css';

type TrendsSubTab = 'similarity' | 'season-trend' | 'competition' | 'rally-model';

export interface TrendsTeamOption {
  /** Distinguishes options on the panel — 'home'/'away' on a single match, or the locked team's id on Team Analysis. */
  key: string;
  label: string;
  teamRef: { teamId?: string; teamName?: string };
  /** Matches to use for Season Trend and Rally Model — already filtered/selected by the host page. */
  matches: readonly MatchProject[];
}

export interface TrendsPanelProps {
  similarityFocus?: SimilarityFocus;
  /** One entry (Team Analysis, single locked team) or two (Analysis, home + away). */
  teamOptions: TrendsTeamOption[];
}

export function TrendsPanel({ similarityFocus, teamOptions }: TrendsPanelProps) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<TrendsSubTab>('similarity');
  const [selectedKey, setSelectedKey] = useState<string>(teamOptions[0]?.key ?? '');

  const selectedOption = teamOptions.find((o) => o.key === selectedKey) ?? teamOptions[0];

  return (
    <div className="trends-panel">
      <div className="trends-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'similarity'}
          className={`trends-panel__tab${subTab === 'similarity' ? ' is-active' : ''}`}
          onClick={() => setSubTab('similarity')}
        >
          {t('similarityTitle')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'season-trend'}
          className={`trends-panel__tab${subTab === 'season-trend' ? ' is-active' : ''}`}
          onClick={() => setSubTab('season-trend')}
        >
          {t('seasonTrendTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'competition'}
          className={`trends-panel__tab${subTab === 'competition' ? ' is-active' : ''}`}
          onClick={() => setSubTab('competition')}
        >
          {t('competitionComparisonTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'rally-model'}
          className={`trends-panel__tab${subTab === 'rally-model' ? ' is-active' : ''}`}
          onClick={() => setSubTab('rally-model')}
        >
          {t('rallyModelTab')}
        </button>
      </div>

      {subTab === 'similarity' ? (
        <div className="trends-panel__section">
          <p className="trends-panel__scarcity-note">{t('trendsSimilarityScarcityNote')}</p>
          <SimilarityPanel focus={similarityFocus} />
        </div>
      ) : (
        <div className="trends-panel__section">
          {teamOptions.length > 1 && (
            <div className="trends-panel__team-toggle" role="tablist">
              {teamOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={selectedKey === option.key}
                  className={`trends-panel__team-toggle-btn${selectedKey === option.key ? ' is-active' : ''}`}
                  onClick={() => setSelectedKey(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {selectedOption && subTab === 'season-trend' ? (
            <SeasonTrendPanel
              matches={selectedOption.matches}
              teamRef={selectedOption.teamRef}
            />
          ) : selectedOption && subTab === 'competition' ? (
            <CompetitionComparisonPanel teamRef={selectedOption.teamRef} />
          ) : selectedOption && subTab === 'rally-model' ? (
            <MarkovChainPanel
              matches={selectedOption.matches}
              teamRef={selectedOption.teamRef}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
