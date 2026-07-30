import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n/translations';
import type { MatchProject } from '@src/domain/match/types';
import { SimilarityPanel, type SimilarityFocus } from '../similarity/SimilarityPanel';
import { PrioritiesPanel } from './priorities/PrioritiesPanel';
import { SeasonTrendPanel } from './widgets/SeasonTrendPanel';
import { CompetitionComparisonPanel } from './widgets/CompetitionComparisonPanel';
import { MarkovChainPanel } from './widgets/MarkovChainPanel';
import { TRENDS_FEATURE_IDS, useExperimentalFeaturesStore, type TrendsFeatureId } from '@src/app/store/experimental-features-store';
import './trends-panel.css';

type TrendsSubTab = TrendsFeatureId;

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

const SUB_TAB_LABEL_KEY: Record<TrendsSubTab, TranslationKey> = {
  priorities: 'prioritiesTab',
  similarity: 'similarityTitle',
  'season-trend': 'seasonTrendTab',
  competition: 'competitionComparisonTab',
  'rally-model': 'rallyModelTab',
};

export function TrendsPanel({ similarityFocus, teamOptions }: TrendsPanelProps) {
  const { t } = useTranslation();
  const trendsFeatures = useExperimentalFeaturesStore((state) => state.trendsFeatures);
  const enabledSubTabs = TRENDS_FEATURE_IDS.filter((id) => trendsFeatures[id]);
  const [subTab, setSubTab] = useState<TrendsSubTab | undefined>(enabledSubTabs[0]);
  const [selectedKey, setSelectedKey] = useState<string>(teamOptions[0]?.key ?? '');

  const enabledSubTabsKey = enabledSubTabs.join(',');
  useEffect(() => {
    if (subTab && !enabledSubTabs.includes(subTab)) {
      setSubTab(enabledSubTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledSubTabsKey, subTab]);

  const selectedOption = teamOptions.find((o) => o.key === selectedKey) ?? teamOptions[0];

  return (
    <div className="trends-panel">
      <div className="trends-panel__tabs" role="tablist">
        {enabledSubTabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={subTab === id}
            className={`trends-panel__tab${subTab === id ? ' is-active' : ''}`}
            onClick={() => setSubTab(id)}
          >
            {t(SUB_TAB_LABEL_KEY[id])}
          </button>
        ))}
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

          {selectedOption && subTab === 'priorities' ? (
            <PrioritiesPanel
              matches={selectedOption.matches}
              teamRef={selectedOption.teamRef}
            />
          ) : selectedOption && subTab === 'season-trend' ? (
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
