import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { RadarComparisonChart } from '../radar/RadarComparisonChart';
import {
  computeRadarValuesFromSkillStats,
  DEFAULT_RADAR_AXIS_IDS,
  type RadarAxisId,
} from '../radar/model/radar-metrics';
import type { RadarSeries, RadarScaleMode } from '../radar/model/radar-normalization';
import {
  buildCrossDatabaseAggregation,
  type CrossDatabaseAggregationResult,
  type PlayerIdentitySample,
  type TeamIdentitySample,
} from './model/cross-database-aggregation';
import { computeSimilarityMatrix, type SimilarityVectorEntity } from './model/similarity';
import { buildTopSimilarityNarratives, type SimilarityNarrativeEntry } from './model/similarity-narrative';
import './similarity-panel.css';

type SimilarityTab = 'players' | 'teams';

/**
 * Restricts which entities are shown as the SUBJECT of a "looks like" entry
 * (the comparison pool itself always stays the full database — you need
 * cross-database history to find a meaningful match). Pass the archived
 * team/player ids relevant to whatever match or set of matches the panel was
 * opened from.
 */
export interface SimilarityFocus {
  teamIds: readonly string[];
  playerIds: readonly string[];
}

function playerEntity(sample: PlayerIdentitySample, teamNameById: Map<string, string>): SimilarityVectorEntity {
  const teamName = sample.archivedTeamId ? teamNameById.get(sample.archivedTeamId) : undefined;
  const name = `#${sample.aggregatedStats.jerseyNumber} ${sample.playerName}`;
  return {
    id: sample.playerId,
    label: teamName ? `${name} · ${teamName}` : name,
    sampleSize: sample.matchesCount,
    values: computeRadarValuesFromSkillStats(
      {
        serve: sample.aggregatedStats.serve,
        receive: sample.aggregatedStats.receive,
        attack: sample.aggregatedStats.attack,
      },
      sample.sideOutPct,
      sample.breakPointPct,
    ),
  };
}

function teamEntity(sample: TeamIdentitySample): SimilarityVectorEntity {
  return {
    id: sample.archivedTeamId,
    label: sample.teamName,
    sampleSize: sample.matchesCount,
    values: computeRadarValuesFromSkillStats(
      {
        serve: sample.aggregatedStats.serve,
        receive: sample.aggregatedStats.receive,
        attack: sample.aggregatedStats.attack,
      },
      sample.sideOutPct,
      sample.breakPointPct,
    ),
  };
}

export interface SimilarityPanelProps {
  /** Restrict the narrative list's subjects to this match/these matches; omit to show everyone. */
  focus?: SimilarityFocus;
}

/**
 * Cross-database similarity view — the comparison pool is every match in the
 * local database (all teams, all players), so a subject can be matched
 * against real history rather than just the current view. `focus` narrows
 * WHICH entities are shown as subjects (e.g. only the teams/players of the
 * match or set of matches the panel was opened from).
 */
export function SimilarityPanel({ focus }: SimilarityPanelProps) {
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);
  const [aggregation, setAggregation] = useState<CrossDatabaseAggregationResult | null>(null);
  const [activeTab, setActiveTab] = useState<SimilarityTab>('players');
  const [selectedEntry, setSelectedEntry] = useState<SimilarityNarrativeEntry | null>(null);
  const [axisIds, setAxisIds] = useState<RadarAxisId[]>([...DEFAULT_RADAR_AXIS_IDS]);
  const [scaleMode, setScaleMode] = useState<RadarScaleMode>('fixed');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await buildCrossDatabaseAggregation();
      if (!cancelled) {
        setAggregation(result);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of aggregation?.teams ?? []) map.set(team.archivedTeamId, team.teamName);
    return map;
  }, [aggregation]);

  const entities = useMemo<SimilarityVectorEntity[]>(() => {
    if (!aggregation) return [];
    return activeTab === 'players'
      ? aggregation.players.map((p) => playerEntity(p, teamNameById))
      : aggregation.teams.map(teamEntity);
  }, [aggregation, activeTab, teamNameById]);

  const labelsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entities) map.set(e.id, e.label);
    return map;
  }, [entities]);

  const focusIds = useMemo(() => {
    if (!focus) return null;
    return new Set(activeTab === 'players' ? focus.playerIds : focus.teamIds);
  }, [focus, activeTab]);

  const narratives = useMemo(() => {
    const pairs = computeSimilarityMatrix(entities);
    const all = buildTopSimilarityNarratives(pairs, labelsById, activeTab === 'players' ? 'player' : 'team');
    return focusIds ? all.filter((entry) => focusIds.has(entry.subjectId)) : all;
  }, [entities, labelsById, activeTab, focusIds]);

  const selectedSeries = useMemo<RadarSeries[] | null>(() => {
    if (!selectedEntry) return null;
    const subject = entities.find((e) => e.id === selectedEntry.subjectId);
    const match = entities.find((e) => e.id === selectedEntry.matchId);
    if (!subject || !match) return null;
    return [
      { seriesId: subject.id, label: subject.label, values: subject.values },
      { seriesId: match.id, label: match.label, values: match.values },
    ];
  }, [selectedEntry, entities]);

  const headlineKey = activeTab === 'players' ? 'similarPlayerHeadline' : 'similarTeamHeadline';
  const excludedCount = activeTab === 'players'
    ? aggregation?.excludedPlayerAppearances ?? 0
    : aggregation?.excludedTeamAppearances ?? 0;
  const excludedKey = activeTab === 'players' ? 'excludedManualEntryPlayers' : 'excludedManualEntryTeams';

  return (
    <div className="similarity-panel">
      <p className="similarity-panel__description">{t('similarityDescription')}</p>

      <div className="similarity-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'players'}
          className={`similarity-panel__tab${activeTab === 'players' ? ' is-active' : ''}`}
          onClick={() => { setActiveTab('players'); setSelectedEntry(null); }}
        >
          {t('similarPlayersTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'teams'}
          className={`similarity-panel__tab${activeTab === 'teams' ? ' is-active' : ''}`}
          onClick={() => { setActiveTab('teams'); setSelectedEntry(null); }}
        >
          {t('similarTeamsTab')}
        </button>
      </div>

      {isLoading ? (
        <p className="load-data-page__loading">{t('similarityLoading')}</p>
      ) : entities.length < 2 || narratives.length === 0 ? (
        <p className="similarity-panel__empty">
          {entities.length < 2 ? t('similarityInsufficientData') : t('noSimilarEntities')}
        </p>
      ) : (
        <div className="similarity-panel__list">
          {narratives.map((entry) => {
            const isSelected = selectedEntry?.subjectId === entry.subjectId && selectedEntry?.matchId === entry.matchId;
            return (
              <div key={`${entry.subjectId}-${entry.matchId}`} className="similarity-panel__item">
                <button
                  type="button"
                  className={`similarity-panel__card${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedEntry(isSelected ? null : entry)}
                >
                  {t(headlineKey, { subject: entry.subjectLabel, match: entry.matchLabel, score: entry.score })}
                </button>

                {isSelected && selectedSeries && (
                  <RadarComparisonChart
                    title={activeTab === 'players' ? t('radarChartTitlePlayer') : t('radarChartTitleTeam')}
                    series={selectedSeries}
                    axisIds={axisIds}
                    onAxisIdsChange={setAxisIds}
                    scaleMode={scaleMode}
                    onScaleModeChange={setScaleMode}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {excludedCount > 0 && (
        <p className="similarity-panel__excluded-banner">{t(excludedKey, { count: excludedCount })}</p>
      )}
    </div>
  );
}
