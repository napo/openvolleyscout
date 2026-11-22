import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n/translations';
import type { MatchProject } from '@src/domain/match/types';
import { SimilarityPanel, type SimilarityFocus } from '../similarity/SimilarityPanel';
import { PrioritiesPanel } from './priorities/PrioritiesPanel';
import { SeasonTrendPanel } from './widgets/SeasonTrendPanel';
import { CompetitionComparisonPanel } from './widgets/CompetitionComparisonPanel';
import { MarkovChainPanel } from './widgets/MarkovChainPanel';
import { TRENDS_FEATURE_IDS, useExperimentalFeaturesStore, type TrendsFeatureId } from '@src/app/store/experimental-features-store';
import { useTrendsViewStore } from './trends-data-source';
import './trends-panel.css';

export type TrendsSubTab = 'priorities' | 'season-trend' | TrendsFeatureId;

const OFFICIAL_TRENDS_SUB_TABS: TrendsSubTab[] = ['priorities', 'season-trend'];

export interface TrendsTeamOption {
  /** Distinguishes options on the panel - 'home'/'away' on a single match, or the locked team's id on Team Analysis. */
  key: string;
  label: string;
  teamRef: { teamId?: string; teamName?: string };
  /** Matches to use for Season Trend and Rally Model - already filtered/selected by the host page. */
  matches: readonly MatchProject[];
}

export interface TrendsPanelProps {
  /** Shared viewer: only these sub-tabs (the ones a link can carry). */
  subTabs?: TrendsSubTab[];
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

export function TrendsPanel({ subTabs, similarityFocus, teamOptions }: TrendsPanelProps) {
  const { t } = useTranslation();
  const trendsFeatures = useExperimentalFeaturesStore((state) => state.trendsFeatures);
  const enabledSubTabs: TrendsSubTab[] = subTabs ?? [
    ...OFFICIAL_TRENDS_SUB_TABS,
    ...TRENDS_FEATURE_IDS.filter((id) => trendsFeatures[id]),
  ];
  const storedSubTab = useTrendsViewStore((state) => state.subTab);
  const setSubTab = useTrendsViewStore((state) => state.setSubTab);
  const subTab: TrendsSubTab | undefined = storedSubTab && enabledSubTabs.includes(storedSubTab) ? storedSubTab : enabledSubTabs[0];
  const storedKey = useTrendsViewStore((state) => state.teamKey);
  const setSelectedKey = useTrendsViewStore((state) => state.setTeamKey);
  const selectedKey = teamOptions.some((option) => option.key === storedKey) ? storedKey! : teamOptions[0]?.key ?? '';

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
