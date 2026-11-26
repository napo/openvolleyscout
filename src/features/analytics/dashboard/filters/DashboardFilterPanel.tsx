// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore, type ReactNode, useMemo } from 'react';
import type { SkillEvaluation } from '@src/domain/common/enums';
import { ChipSelect, EvaluationChips, FilterGroup, FilterGroups, ResetFiltersButton } from '@src/components/filter-chips/FilterChips';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { SkillIcon } from '@src/components/skill-icons/SkillIcon';
import { rallyBaseCodes, sortBaseCodes } from '../selectors/base-code';
import { TRACKED_SKILLS, type MatchStats, type TrackedSkill } from '@src/features/scouting/model/match-stats';
import { getScoreSituationSettings, subscribeScoreSituationSettings } from '../../score-situation/score-situation-settings';
import { useFilterActions } from '../../stores/filter-selectors';
import { getAvailablePlayers, getAvailableSets, type PlayerOption } from '../selectors/dashboard-selectors';
import {
  ALL_EVALUATIONS,
  PLAYER_ROLES,
  baseCodeList,
  TOUCH_PHASES,
  getActiveFilterCount,
  type DashboardFilters,
  type TouchPhase,
} from './dashboard-filters';

const PHASE_LABELS: Record<TouchPhase, TranslationKey> = {
  break_point: 'rallyPhaseBreakPoint',
  point: 'rallyPhasePoint',
  transition_break_point: 'rallyPhaseTransitionBreakPoint',
  transition_point: 'rallyPhaseTransitionPoint',
};

const SKILL_LABELS: Record<TrackedSkill, TranslationKey> = {
  serve: 'skillServe',
  receive: 'skillReceive',
  set: 'skillSet',
  attack: 'skillAttack',
  block: 'skillBlock',
  dig: 'skillDig',
  freeball: 'skillFreeball',
  cover: 'skillCover',
};

const SCORE_SITUATIONS: ReadonlyArray<{ value: DashboardFilters['scoreRange'][number]; labelKey: TranslationKey }> = [
  { value: 'tied', labelKey: 'scoreRangeTied' },
  { value: 'leading', labelKey: 'scoreRangeLeading' },
  { value: 'trailing', labelKey: 'scoreRangeTrailing' },
  { value: 'clutch', labelKey: 'scoreRangeClutch' },
];

const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

export interface DashboardFilterPanelProps {
  filters: DashboardFilters;
  stats: MatchStats;
  /** The team is fixed by the page: no team choice, and it does not count as a filter. */
  lockedTeam?: 'home' | 'away';
  showTeam?: boolean;
  showSkill?: boolean;
  showEvaluations?: boolean;
  showRole?: boolean;
  showSource?: boolean;
  /** The athlete picker of the page, shown above the groups. */
  playerPicker?: ReactNode;
}

/**
 * The filters of the analysis dashboards, with the same groups and chips as the
 * Video analysis and the tactical report. The dashboards keep one value per
 * group (one set, one phase, one rotation), so those groups pick one chip.
 */
export function DashboardFilterPanel({
  filters,
  stats,
  lockedTeam,
  showTeam = false,
  showSkill = false,
  showEvaluations = false,
  showRole = false,
  showSource = false,
  playerPicker,
}: DashboardFilterPanelProps) {
  const { t } = useTranslation();
  const { updateFilter, resetFilters } = useFilterActions();
  // The rules of Settings > Analysis, shown under the score filter so the reading is clear.
  const scoreRules = useSyncExternalStore(subscribeScoreSituationSettings, getScoreSituationSettings, getScoreSituationSettings);
  const sets = getAvailableSets(stats);
  const players = getAvailablePlayers(stats);
  const baseCodes = useMemo(
    () => sortBaseCodes(stats.rallyStats.flatMap((rally) => (['home', 'away'] as const).flatMap((side) => [...rallyBaseCodes(rally.touches, side)]))),
    [stats.rallyStats],
  );
  const activeCount = getActiveFilterCount(lockedTeam ? { ...filters, team: 'all' } : filters);
  const all = t('setterViewReceptionAll');

  const teams = (['home', 'away'] as const)
    .filter((side) => !lockedTeam || side === lockedTeam)
    .map((side) => ({ side, name: stats.teamStats[side].teamName, players: players.filter((p) => p.teamSide === side) }))
    .filter((team) => team.players.length > 0);

  const playerLabel = (player: PlayerOption) => (
    [player.jerseyNumber !== '' && player.jerseyNumber != null ? `#${player.jerseyNumber}` : '', player.playerName]
      .filter(Boolean).join(' ') || player.playerId
  );

  // Every symbol chosen is stored as the full list, as the selectors expect.
  const selectedEvaluations = filters.evaluations.length >= ALL_EVALUATIONS.length ? [] : filters.evaluations;
  const onEvaluations = (next: SkillEvaluation[]) => updateFilter('evaluations', next.length === 0 ? [...ALL_EVALUATIONS] : next);

  const playerSelect = (
    key: 'server' | 'receiver' | 'attacker',
    labelKey: 'filterServer' | 'filterReceiver' | 'filterAttacker',
    allKey: 'allServers' | 'allReceivers' | 'allAttackers',
  ) => (
    <label className="dashboard-filter-panel__select">
      <span className="filter-chips__row-label">{t(labelKey)}</span>
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
    </label>
  );

  return (
    <div className="perf-dashboard__filters dashboard-filter-panel" aria-label={t('dashboardFilters')}>
      {playerPicker ? <div className="dashboard-filter-panel__picker">{playerPicker}</div> : null}
      <FilterGroups>
        {showTeam && !lockedTeam ? (
          <FilterGroup title={t('filterTeam')} active={filters.team !== 'all'}>
            <ChipSelect
              single
              allLabel={all}
              options={[
                { value: 'home', label: stats.teamStats.home.teamName },
                { value: 'away', label: stats.teamStats.away.teamName },
              ]}
              selected={filters.team === 'all' ? [] : [filters.team]}
              onChange={(next) => {
                updateFilter('team', next[0] ?? 'all');
                updateFilter('player', 'all');
              }}
            />
          </FilterGroup>
        ) : null}

        {showSkill ? (
          <FilterGroup title={t('filterSkill')} active={filters.skill !== 'all'}>
            <ChipSelect
              single
              allLabel={t('allSkills')}
              options={TRACKED_SKILLS.map((skill) => ({ value: skill, label: t(SKILL_LABELS[skill]), icon: <SkillIcon skill={skill} size={22} />, iconOnly: true }))}
              selected={filters.skill === 'all' ? [] : [filters.skill]}
              onChange={(next) => updateFilter('skill', next[0] ?? 'all')}
            />
          </FilterGroup>
        ) : null}

        <FilterGroup title={t('filterRallyPhase')} active={filters.rallyPhase.length > 0}>
          <ChipSelect
            allLabel={all}
            options={TOUCH_PHASES.map((phase) => ({ value: phase, label: t(PHASE_LABELS[phase]) }))}
            selected={filters.rallyPhase}
            onChange={(next) => updateFilter('rallyPhase', next)}
          />
        </FilterGroup>

        {showEvaluations ? (
          <FilterGroup title={t('filterEvaluations')} active={selectedEvaluations.length > 0}>
            <EvaluationChips
              skill={filters.skill === 'all' ? null : filters.skill}
              allLabel={all}
              selected={selectedEvaluations}
              onChange={onEvaluations}
            />
          </FilterGroup>
        ) : null}

        {sets.length > 1 ? (
          <FilterGroup title={t('filterSet')} active={filters.set.length > 0}>
            <ChipSelect
              allLabel={all}
              options={sets.map((value) => ({ value, label: String(value) }))}
              selected={filters.set}
              onChange={(next) => updateFilter('set', next)}
            />
          </FilterGroup>
        ) : null}

        <FilterGroup title={t('filterRotation')} active={filters.rotation.length > 0}>
          <ChipSelect
            allLabel={all}
            options={ROTATIONS.map((value) => ({ value, label: `P${value}` }))}
            selected={filters.rotation}
            onChange={(next) => updateFilter('rotation', next)}
          />
        </FilterGroup>

        <FilterGroup title={t('filterScoreRange')} active={filters.scoreRange.length > 0}>
          <ChipSelect
            allLabel={all}
            options={SCORE_SITUATIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
            selected={filters.scoreRange}
            onChange={(next) => updateFilter('scoreRange', next)}
          />
          {/* The rule behind each situation chosen, from Settings > Analysis. */}
          {filters.scoreRange.includes('clutch') ? (
            <span className="perf-dashboard__filter-hint">
              {t('scoreSituationCloseRule', { from: scoreRules.closeFrom, decidingFrom: scoreRules.closeFromDecidingSet, gap: scoreRules.closeMaxGap })}
            </span>
          ) : null}
          {filters.scoreRange.includes('leading') || filters.scoreRange.includes('trailing') ? (
            <span className="perf-dashboard__filter-hint">
              {t('scoreSituationLeadRule', { gap: scoreRules.leadMinGap })}
            </span>
          ) : null}
        </FilterGroup>

        {baseCodes.length > 0 ? (
          <FilterGroup title={t('attackerViewBaseLabel')} active={baseCodeList(filters.base).length > 0}>
            <ChipSelect
              allLabel={all}
              options={baseCodes.map((value) => ({ value, label: value }))}
              selected={baseCodeList(filters.base)}
              onChange={(next) => updateFilter('base', next)}
            />
          </FilterGroup>
        ) : null}

        {teams.length > 0 || showRole || showSource ? (
          <FilterGroup
            title={t('dashboardFilterPlayersTitle')}
            active={filters.server !== 'all' || filters.receiver !== 'all' || filters.attacker !== 'all' || filters.role !== 'all' || filters.source !== 'all'}
          >
            {teams.length > 0 ? (
              <>
                {playerSelect('server', 'filterServer', 'allServers')}
                {playerSelect('receiver', 'filterReceiver', 'allReceivers')}
                {playerSelect('attacker', 'filterAttacker', 'allAttackers')}
              </>
            ) : null}
            {showRole ? (
              <label className="dashboard-filter-panel__select">
                <span className="filter-chips__row-label">{t('filterRole')}</span>
                <select
                  id="dash-filter-role"
                  className="perf-dashboard__filter-select"
                  value={filters.role}
                  onChange={(event) => updateFilter('role', event.target.value as DashboardFilters['role'])}
                >
                  <option value="all">{t('allRoles')}</option>
                  {PLAYER_ROLES.map((role) => (
                    <option key={role} value={role}>{t(role as TranslationKey)}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {showSource ? (
              <label className="dashboard-filter-panel__select">
                <span className="filter-chips__row-label">{t('filterSource')}</span>
                <select
                  id="dash-filter-source"
                  className="perf-dashboard__filter-select"
                  value={filters.source}
                  onChange={(event) => updateFilter('source', event.target.value as DashboardFilters['source'])}
                >
                  <option value="all">{t('allSources')}</option>
                  <option value="explicit">{t('explicitTouches')}</option>
                  <option value="inferred">{t('inferredTouches')}</option>
                </select>
              </label>
            ) : null}
          </FilterGroup>
        ) : null}
      </FilterGroups>

      <ResetFiltersButton count={activeCount} onReset={resetFilters} />
    </div>
  );
}
