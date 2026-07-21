import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { matchRepository } from '@src/infrastructure/repositories';
import { filterMatchesForTeam } from '@src/features/teams/model/team-match-filter';
import { RADAR_AXES, type RadarAxisId } from '../../radar/model/radar-metrics';
import {
  listDistinctCompetitions,
  computeCompetitionComparison,
  type CompetitionOption,
  type CompetitionTeamSnapshot,
} from '../model/competition-comparison';
import '../trends-panel.css';

function formatPct(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : `${(value * 100).toFixed(1)}%`;
}

function competitionKey(option: CompetitionOption): string {
  return option.competitionEntryId ?? `name:${(option.competitionName ?? '').toLowerCase().trim()}`;
}

export interface CompetitionComparisonPanelProps {
  teamRef: { teamId?: string; teamName?: string };
}

export function CompetitionComparisonPanel({ teamRef }: CompetitionComparisonPanelProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [allMatches, setAllMatches] = useState<MatchProject[]>([]);
  const [selectedAxis, setSelectedAxis] = useState<RadarAxisId>('attackEfficiency');
  const [selectedCompetitionKey, setSelectedCompetitionKey] = useState<string | null>(null);
  const [teams, setTeams] = useState<CompetitionTeamSnapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const matches = await matchRepository.list();
      if (!cancelled) {
        setAllMatches(matches);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const teamMatches = useMemo(
    () => filterMatchesForTeam(allMatches, teamRef.teamId, teamRef.teamName),
    [allMatches, teamRef.teamId, teamRef.teamName],
  );

  const competitionOptions = useMemo(() => listDistinctCompetitions(teamMatches), [teamMatches]);

  useEffect(() => {
    if (competitionOptions.length === 0) {
      setSelectedCompetitionKey(null);
      return;
    }
    if (!selectedCompetitionKey || !competitionOptions.some((o) => competitionKey(o) === selectedCompetitionKey)) {
      setSelectedCompetitionKey(competitionKey(competitionOptions[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionOptions]);

  const selectedOption = competitionOptions.find((o) => competitionKey(o) === selectedCompetitionKey) ?? null;

  useEffect(() => {
    if (!selectedOption) {
      setTeams(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await computeCompetitionComparison(allMatches, selectedOption);
      if (!cancelled) setTeams(result);
    })();
    return () => { cancelled = true; };
  }, [allMatches, selectedOption]);

  const focusTeamId = teamRef.teamId
    ?? teams?.find((team) => team.teamName.toLowerCase().trim() === (teamRef.teamName ?? '').toLowerCase().trim())?.archivedTeamId;

  const ranked = useMemo(() => {
    if (!teams) return [];
    return [...teams].sort((a, b) => (b.values[selectedAxis] ?? -Infinity) - (a.values[selectedAxis] ?? -Infinity));
  }, [teams, selectedAxis]);

  if (isLoading) {
    return <p className="load-data-page__loading">{t('loading')}</p>;
  }

  if (competitionOptions.length === 0) {
    return <p className="trends-panel__empty">{t('competitionComparisonNoCompetition')}</p>;
  }

  return (
    <div className="competition-comparison-panel">
      <div className="competition-comparison-panel__pickers">
        <div className="competition-comparison-panel__picker">
          <label htmlFor="competition-picker" className="season-trend-panel__picker-label">
            {t('competitionComparisonPickerLabel')}
          </label>
          <select
            id="competition-picker"
            value={selectedCompetitionKey ?? ''}
            onChange={(e) => setSelectedCompetitionKey(e.target.value)}
          >
            {competitionOptions.map((option) => (
              <option key={competitionKey(option)} value={competitionKey(option)}>
                {option.label} ({option.matchCount})
              </option>
            ))}
          </select>
        </div>
        <div className="competition-comparison-panel__picker">
          <label htmlFor="competition-metric" className="season-trend-panel__picker-label">
            {t('seasonTrendMetricPickerLabel')}
          </label>
          <select
            id="competition-metric"
            value={selectedAxis}
            onChange={(e) => setSelectedAxis(e.target.value as RadarAxisId)}
          >
            {RADAR_AXES.map((axis) => (
              <option key={axis.id} value={axis.id}>{t(axis.labelKey)}</option>
            ))}
          </select>
        </div>
      </div>

      {ranked.length <= 1 ? (
        <p className="trends-panel__empty">{t('competitionComparisonNoOtherTeams')}</p>
      ) : (
        <table className="competition-comparison-panel__table">
          <thead>
            <tr>
              <th>{t('competitionComparisonRankLabel')}</th>
              <th>{t('team')}</th>
              <th>{t(RADAR_AXES.find((a) => a.id === selectedAxis)!.labelKey)}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((team, index) => (
              <tr
                key={team.archivedTeamId}
                className={team.archivedTeamId === focusTeamId ? 'competition-comparison-panel__row--focus' : ''}
              >
                <td>{index + 1} / {ranked.length}</td>
                <th scope="row">{team.teamName}</th>
                <td>{formatPct(team.values[selectedAxis] ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
