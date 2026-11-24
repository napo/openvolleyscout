// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react';
import { useTranslation } from '@src/i18n';
import { getScoreSituationSettings, subscribeScoreSituationSettings } from '../../score-situation/score-situation-settings';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { useFilterActions } from '../../stores/filter-selectors';
import { getAvailablePlayers, type PlayerOption } from '../selectors/dashboard-selectors';
import type { DashboardFilters } from './dashboard-filters';

type PlayerFilterKey = 'server' | 'receiver' | 'attacker';

/**
 * Rotation, score situation, server, receiver and attacker filters, shared by
 * every dashboard filter bar (see rally-context-filters.ts for what they keep).
 */
export function RallyContextFilterControls({ filters, stats }: { filters: DashboardFilters; stats: MatchStats }) {
  const { t } = useTranslation();
  const { updateFilter } = useFilterActions();
  // The rules of Settings > Analysis, shown under the score filter so the reading is clear.
  const scoreRules = useSyncExternalStore(subscribeScoreSituationSettings, getScoreSituationSettings, getScoreSituationSettings);
  const players = getAvailablePlayers(stats);
  const teams = (['home', 'away'] as const)
    .map((side) => ({ side, name: stats.teamStats[side].teamName, players: players.filter((p) => p.teamSide === side) }))
    .filter((team) => team.players.length > 0);

  const playerLabel = (player: PlayerOption) => (
    [player.jerseyNumber !== '' && player.jerseyNumber != null ? `#${player.jerseyNumber}` : '', player.playerName]
      .filter(Boolean).join(' ') || player.playerId
  );

  const playerSelect = (key: PlayerFilterKey, labelKey: 'filterServer' | 'filterReceiver' | 'filterAttacker', allKey: 'allServers' | 'allReceivers' | 'allAttackers') => (
    <div className="perf-dashboard__filter-group">
      <label className="perf-dashboard__filter-label" htmlFor={`dash-filter-${key}`}>{t(labelKey)}</label>
      <select
        id={`dash-filter-${key}`}
        className="perf-dashboard__filter-select"
        value={filters[key]}
        onChange={(event) => updateFilter(key, event.target.value)}
      >
        <option value="all">{t(allKey)}</option>
        {teams.map((team) => (
          <optgroup key={team.side} label={team.name}>
            {team.players.map((player) => (
              <option key={player.playerId} value={player.playerId}>{playerLabel(player)}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-rotation">{t('filterRotation')}</label>
        <select
          id="dash-filter-rotation"
          className="perf-dashboard__filter-select"
          value={filters.rotation}
          onChange={(event) => updateFilter('rotation', event.target.value === 'all' ? 'all' : Number(event.target.value) as DashboardFilters['rotation'])}
        >
          <option value="all">{t('allRotations')}</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{t('rotationLabel', { rotationNumber: n })}</option>
          ))}
        </select>
      </div>

      <div className="perf-dashboard__filter-group">
        <label className="perf-dashboard__filter-label" htmlFor="dash-filter-score-range">{t('filterScoreRange')}</label>
        <select
          id="dash-filter-score-range"
          className="perf-dashboard__filter-select"
          value={filters.scoreRange}
          onChange={(event) => updateFilter('scoreRange', event.target.value as DashboardFilters['scoreRange'])}
        >
          <option value="all">{t('allScoreRanges')}</option>
          <option value="tied">{t('scoreRangeTied')}</option>
          <option value="leading">{t('scoreRangeLeading')}</option>
          <option value="trailing">{t('scoreRangeTrailing')}</option>
          <option value="clutch">{t('scoreRangeClutch')}</option>
        </select>
        {filters.scoreRange === 'clutch' || filters.scoreRange === 'leading' || filters.scoreRange === 'trailing' ? (
          <span className="perf-dashboard__filter-hint">
            {filters.scoreRange === 'clutch'
              ? t('scoreSituationCloseRule', { from: scoreRules.closeFrom, decidingFrom: scoreRules.closeFromDecidingSet, gap: scoreRules.closeMaxGap })
              : t('scoreSituationLeadRule', { gap: scoreRules.leadMinGap })}
          </span>
        ) : null}
      </div>

      {teams.length > 0 && (
        <>
          {playerSelect('server', 'filterServer', 'allServers')}
          {playerSelect('receiver', 'filterReceiver', 'allReceivers')}
          {playerSelect('attacker', 'filterAttacker', 'allAttackers')}
        </>
      )}
    </>
  );
}
