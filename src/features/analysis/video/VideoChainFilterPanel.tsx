// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { AttackerDirectionPhase, SetterDistributionServeType } from '@src/domain/opponent-report/types';
import { ChipSelect, EvaluationChips, FilterGroup, FilterGroups, type ChipOption } from '@src/components/filter-chips/FilterChips';
import { TOUCH_PHASES, type TouchPhase } from '@src/features/analytics/rally-phase/rally-phase-classifier';
import type { ScoreSituation } from '@src/features/analytics/dashboard/selectors/rally-context-filters';
import { useTranslation, type TranslationKey } from '@src/i18n';
import {
  VIDEO_CHAIN_SKILL_ORDER,
  orderVideoChain,
  pruneVideoChainPlayers,
  type VideoChainFilters,
  type VideoSkillAttributes,
  type VideoTeamScope,
} from './video-chain-filters';
import { VIDEO_FILTER_RECEPTION_ZONES, VIDEO_FILTER_SERVE_START_ZONES, VIDEO_FILTER_SERVE_TYPES } from './video-filters';

const SKILL_LABELS: Partial<Record<SkillType, TranslationKey>> = {
  serve: 'skillServe',
  receive: 'skillReceive',
  set: 'skillSet',
  attack: 'skillAttack',
  block: 'skillBlock',
  dig: 'skillDig',
  freeball: 'skillFreeball',
  cover: 'skillCover',
};

const PHASE_LABELS: Record<TouchPhase, TranslationKey> = {
  break_point: 'rallyPhaseBreakPoint',
  point: 'rallyPhasePoint',
  transition_break_point: 'rallyPhaseTransitionBreakPoint',
  transition_point: 'rallyPhaseTransitionPoint',
};

const SERVE_TYPE_LABELS: Record<SetterDistributionServeType, TranslationKey> = {
  jump_spin: 'setterViewServeJumpSpin',
  jump_float: 'setterViewServeJumpFloat',
  float: 'setterViewServeFloat',
  other: 'setterViewServeOther',
};

const ATTACK_SITUATIONS: ReadonlyArray<{ value: AttackerDirectionPhase; labelKey: TranslationKey }> = [
  { value: 'after_receive', labelKey: 'opponentReportAttackAfterReceive' },
  { value: 'after_dig', labelKey: 'opponentReportAttackAfterDig' },
  { value: 'high_ball', labelKey: 'opponentReportAttackHighBall' },
  { value: 'late_set', labelKey: 'opponentReportAttackLateSet' },
];

const SCORE_SITUATIONS: ReadonlyArray<{ value: ScoreSituation; labelKey: TranslationKey }> = [
  { value: 'tied', labelKey: 'scoreRangeTied' },
  { value: 'leading', labelKey: 'scoreRangeLeading' },
  { value: 'trailing', labelKey: 'scoreRangeTrailing' },
  { value: 'clutch', labelKey: 'scoreRangeClutch' },
];

const ATTACK_ZONES = ['4', '3', '2', '5', '6', '1'] as const;
const BLOCKERS = [0, 1, 2, 3] as const;
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

export interface VideoChainFilterPanelProps {
  filters: VideoChainFilters;
  onChange: (next: VideoChainFilters) => void;
  /** Team choices: the two teams of one match, or the team studied and its opponents over several. */
  teamOptions: ReadonlyArray<{ value: Exclude<VideoTeamScope, 'all'>; label: string }>;
  /** Players to offer, for the actions shown (team scope) or for a previous link of the chain. */
  playerOptions: (scope: VideoTeamScope) => ChipOption<string>[];
  setNumbers: readonly number[];
}

/**
 * The contextual video filters: team, phase, a chain of skills with each skill's
 * attributes, then the rally context. Built from the shared filter chips.
 */
export function VideoChainFilterPanel({ filters, onChange, teamOptions, playerOptions, setNumbers }: VideoChainFilterPanelProps) {
  const { t } = useTranslation();
  const all = t('setterViewReceptionAll');
  // A team or chain change can hide chosen players: drop them so nothing hidden keeps filtering.
  const playerIdsFor = (scope: VideoTeamScope) => new Set(playerOptions(scope).map((option) => option.value));
  const patch = (next: Partial<VideoChainFilters>) => onChange(pruneVideoChainPlayers({ ...filters, ...next }, playerIdsFor));
  const chain = orderVideoChain(filters.chain);
  const target = chain.at(-1);

  const patchAttributes = (key: SkillType | 'any', next: Partial<VideoSkillAttributes>) => {
    onChange({ ...filters, attributes: { ...filters.attributes, [key]: { ...filters.attributes[key], ...next } } });
  };

  const skillCard = (key: SkillType | 'any') => {
    const attributes = filters.attributes[key] ?? {};
    const skill = key === 'any' ? null : key;
    // Players of the actions shown follow the team filter; a previous link may be either team.
    const players = playerOptions(key === 'any' || key === target ? filters.team : 'all');
    const active = Object.values(attributes).some((value) => Array.isArray(value) && value.length > 0);
    return (
      <FilterGroup key={key} title={key === 'any' ? t('videoChainAnySkill') : t(SKILL_LABELS[key] ?? 'videoChainAnySkill')} active={active} wide>
        {key === 'serve' ? (
          <>
            <ChipSelect
              label={t('sideOutFilterServeType')}
              allLabel={all}
              options={VIDEO_FILTER_SERVE_TYPES.map((value) => ({ value, label: t(SERVE_TYPE_LABELS[value]) }))}
              selected={attributes.serveTypes ?? []}
              onChange={(serveTypes) => patchAttributes(key, { serveTypes })}
            />
            <ChipSelect
              label={t('videoFilterServeStartZone')}
              allLabel={all}
              options={VIDEO_FILTER_SERVE_START_ZONES.map((value) => ({ value, label: value }))}
              selected={attributes.serveStartZones ?? []}
              onChange={(serveStartZones) => patchAttributes(key, { serveStartZones })}
            />
          </>
        ) : null}
        {key === 'serve' || key === 'receive' ? (
          <ChipSelect
            label={t('sideOutFilterReceptionZone')}
            allLabel={all}
            options={VIDEO_FILTER_RECEPTION_ZONES.map((value) => ({ value, label: value }))}
            selected={attributes.targetZones ?? []}
            onChange={(targetZones) => patchAttributes(key, { targetZones })}
          />
        ) : null}
        {key === 'attack' ? (
          <>
            <ChipSelect
              label={t('videoAttackSituation')}
              allLabel={all}
              options={ATTACK_SITUATIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
              selected={attributes.attackSituations ?? []}
              onChange={(attackSituations) => patchAttributes(key, { attackSituations })}
            />
            <ChipSelect
              label={t('opponentReportAttackZone')}
              allLabel={all}
              options={ATTACK_ZONES.map((value) => ({ value, label: value }))}
              selected={attributes.attackZones ?? []}
              onChange={(attackZones) => patchAttributes(key, { attackZones })}
            />
            <ChipSelect
              label={t('opponentReportAttackBlockers')}
              allLabel={all}
              options={BLOCKERS.map((value) => ({ value, label: String(value) }))}
              selected={attributes.blockers ?? []}
              onChange={(blockers) => patchAttributes(key, { blockers })}
            />
          </>
        ) : null}
        {players.length > 0 ? (
          <ChipSelect
            label={t('player')}
            allLabel={all}
            options={players}
            selected={attributes.playerIds ?? []}
            onChange={(playerIds) => patchAttributes(key, { playerIds })}
          />
        ) : null}
        <EvaluationChips
          skill={skill}
          label={t('filterEvaluations')}
          allLabel={all}
          selected={attributes.evaluations ?? []}
          onChange={(evaluations: SkillEvaluation[]) => patchAttributes(key, { evaluations })}
        />
      </FilterGroup>
    );
  };

  return (
    <div className="video-chain-filters">
      <FilterGroups>
        <FilterGroup title={t('filterTeam')} active={filters.team !== 'all'}>
          <ChipSelect
            single
            allLabel={all}
            options={teamOptions}
            selected={filters.team === 'all' ? [] : [filters.team]}
            onChange={(next) => patch({ team: next[0] ?? 'all' })}
          />
        </FilterGroup>
        <FilterGroup title={t('videoFilterPhase')} active={filters.phases.length > 0}>
          <ChipSelect
            allLabel={all}
            options={TOUCH_PHASES.map((phase) => ({ value: phase, label: t(PHASE_LABELS[phase]) }))}
            selected={filters.phases}
            onChange={(phases) => patch({ phases })}
          />
        </FilterGroup>
        <FilterGroup title={t('videoChainSkillsTitle')} active={chain.length > 0} wide>
          <ChipSelect
            allLabel={all}
            options={VIDEO_CHAIN_SKILL_ORDER.map((skill) => ({ value: skill, label: t(SKILL_LABELS[skill] ?? 'videoChainAnySkill') }))}
            selected={chain}
            onChange={(next) => patch({ chain: next.length === VIDEO_CHAIN_SKILL_ORDER.length ? [] : next })}
          />
          {chain.length > 1 ? <span className="filter-chips__row-label">{t('videoChainSkillsHint')}</span> : null}
        </FilterGroup>
        {(chain.length > 0 ? chain : ['any' as const]).map(skillCard)}
        {setNumbers.length > 1 ? (
          <FilterGroup title={t('filterSet')} active={filters.setNumbers.length > 0}>
            <ChipSelect
              allLabel={all}
              options={setNumbers.map((value) => ({ value, label: String(value) }))}
              selected={filters.setNumbers}
              onChange={(next) => patch({ setNumbers: next })}
            />
          </FilterGroup>
        ) : null}
        <FilterGroup title={t('opponentReportColRotation')} active={filters.rotations.length > 0}>
          <ChipSelect
            allLabel={all}
            options={ROTATIONS.map((value) => ({ value, label: `P${value}` }))}
            selected={filters.rotations}
            onChange={(rotations) => patch({ rotations })}
          />
        </FilterGroup>
        <FilterGroup title={t('filterScoreRange')} active={filters.scoreSituations.length > 0}>
          <ChipSelect
            allLabel={all}
            options={SCORE_SITUATIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
            selected={filters.scoreSituations}
            onChange={(scoreSituations) => patch({ scoreSituations })}
          />
        </FilterGroup>
        <FilterGroup title={t('videoFilterOutcome')} active={filters.rallyOutcome !== 'all'}>
          <ChipSelect
            single
            allLabel={all}
            options={[{ value: 'won', label: t('videoOutcomeWon') }, { value: 'lost', label: t('videoOutcomeLost') }]}
            selected={filters.rallyOutcome === 'all' ? [] : [filters.rallyOutcome]}
            onChange={(next) => patch({ rallyOutcome: (next[0] as 'won' | 'lost' | undefined) ?? 'all' })}
          />
        </FilterGroup>
      </FilterGroups>
    </div>
  );
}
