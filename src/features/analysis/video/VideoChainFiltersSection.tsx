// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { AttackerDirectionPhase } from '@src/domain/opponent-report/types';
import type { ScoreSituation } from '@src/features/analytics/dashboard/selectors/rally-context-filters';
import { TOUCH_PHASES, type TouchPhase } from '@src/features/analytics/rally-phase/rally-phase-classifier';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { MultiSelectFilter, type MultiSelectOption } from './MultiSelectFilter';
import {
  createDefaultVideoChainFilters,
  orderVideoChain,
  VIDEO_CHAIN_SKILL_ORDER,
  type VideoChainFilters,
  type VideoSkillAttributes,
} from './video-chain-filters';
import {
  VIDEO_FILTER_EVALUATIONS,
  VIDEO_FILTER_RECEPTION_ZONES,
  VIDEO_FILTER_SERVE_START_ZONES,
  VIDEO_FILTER_SERVE_TYPES,
} from './video-filters';

const SKILL_LABEL_KEYS: Record<SkillType, TranslationKey> = {
  serve: 'skillServe',
  receive: 'skillReceive',
  set: 'skillSet',
  attack: 'skillAttack',
  block: 'skillBlock',
  dig: 'skillDig',
  freeball: 'skillFreeball',
  cover: 'skillCover',
} as Record<SkillType, TranslationKey>;

const PHASE_LABEL_KEYS: Record<TouchPhase, TranslationKey> = {
  break_point: 'rallyPhaseBreakPoint',
  point: 'rallyPhasePoint',
  transition_break_point: 'rallyPhaseTransitionBreakPoint',
  transition_point: 'rallyPhaseTransitionPoint',
};

const SCORE_SITUATIONS: { value: ScoreSituation; labelKey: TranslationKey }[] = [
  { value: 'tied', labelKey: 'scoreRangeTied' },
  { value: 'leading', labelKey: 'scoreRangeLeading' },
  { value: 'trailing', labelKey: 'scoreRangeTrailing' },
  { value: 'clutch', labelKey: 'scoreRangeClutch' },
];

const ATTACK_SITUATIONS: { value: AttackerDirectionPhase; labelKey: TranslationKey }[] = [
  { value: 'after_receive', labelKey: 'opponentReportAttackAfterReceive' },
  { value: 'after_dig', labelKey: 'opponentReportAttackAfterDig' },
  { value: 'high_ball', labelKey: 'opponentReportAttackHighBall' },
  { value: 'late_set', labelKey: 'videoChainLateSet' },
];

const SERVE_TYPE_LABEL_KEYS = {
  jump_spin: 'setterViewServeJumpSpin',
  jump_float: 'setterViewServeJumpFloat',
  float: 'setterViewServeFloat',
  other: 'setterViewServeOther',
} as const;

const ATTACK_ZONES = ['4', '3', '2', '5', '6', '1'];
const BLOCKER_COUNTS = [0, 1, 2, 3];

export function isDefaultVideoChainFilters(filters: VideoChainFilters): boolean {
  return filters.chain.length === 0 && filters.phases.length === 0 && filters.scoreSituations.length === 0;
}

interface VideoChainFiltersSectionProps {
  value: VideoChainFilters;
  onChange: (next: VideoChainFilters) => void;
  players: MultiSelectOption<string>[];
}

/**
 * Skill chain (serve, then attack...) with per-skill attributes, plus game
 * phase and score situation. Team, set, rotation and outcome come from the
 * main filters above.
 */
export function VideoChainFiltersSection({ value, onChange, players }: VideoChainFiltersSectionProps) {
  const { t } = useTranslation();
  const chain = orderVideoChain(value.chain);
  const countLabel = (count: number) => t('videoFilterSelectedCount', { count });
  const isActive = !isDefaultVideoChainFilters(value);

  const toggleSkill = (skill: SkillType, checked: boolean) => {
    const nextChain = checked ? [...value.chain, skill] : value.chain.filter((item) => item !== skill);
    const attributes = { ...value.attributes };
    if (!checked) delete attributes[skill];
    onChange({ ...value, chain: orderVideoChain(nextChain), attributes });
  };

  const setAttribute = <K extends keyof VideoSkillAttributes>(skill: SkillType, key: K, next: VideoSkillAttributes[K]) => {
    onChange({ ...value, attributes: { ...value.attributes, [skill]: { ...value.attributes[skill], [key]: next } } });
  };

  const renderSkillAttributes = (skill: SkillType) => {
    const attributes = value.attributes[skill] ?? {};
    return (
      <div key={skill} className="video-analysis__chain-step">
        <strong>{t(SKILL_LABEL_KEYS[skill])}</strong>
        <MultiSelectFilter
          label={t('player')}
          allLabel={t('allPlayers')}
          selectedCountLabel={countLabel}
          selected={attributes.playerIds ?? []}
          onChange={(next) => setAttribute(skill, 'playerIds', next)}
          options={players}
        />
        <MultiSelectFilter
          label={t('filterEvaluations')}
          allLabel={t('videoPhaseAll')}
          selectedCountLabel={countLabel}
          selected={attributes.evaluations ?? []}
          onChange={(next) => setAttribute(skill, 'evaluations', next as SkillEvaluation[])}
          options={VIDEO_FILTER_EVALUATIONS.map((evaluation) => ({ value: evaluation, label: evaluation }))}
        />
        {skill === 'serve' ? (
          <>
            <MultiSelectFilter
              label={t('sideOutFilterServeType')}
              allLabel={t('videoPhaseAll')}
              selectedCountLabel={countLabel}
              selected={attributes.serveTypes ?? []}
              onChange={(next) => setAttribute(skill, 'serveTypes', next)}
              options={VIDEO_FILTER_SERVE_TYPES.map((serveType) => ({ value: serveType, label: t(SERVE_TYPE_LABEL_KEYS[serveType]) }))}
            />
            <MultiSelectFilter
              label={t('videoFilterServeStartZone')}
              allLabel={t('videoPhaseAll')}
              selectedCountLabel={countLabel}
              selected={attributes.serveStartZones ?? []}
              onChange={(next) => setAttribute(skill, 'serveStartZones', next)}
              options={VIDEO_FILTER_SERVE_START_ZONES.map((zone) => ({ value: zone, label: `${t('zone')} ${zone}` }))}
            />
          </>
        ) : null}
        {skill === 'serve' || skill === 'receive' ? (
          <MultiSelectFilter
            label={t('sideOutFilterReceptionZone')}
            allLabel={t('videoPhaseAll')}
            selectedCountLabel={countLabel}
            selected={attributes.targetZones ?? []}
            onChange={(next) => setAttribute(skill, 'targetZones', next)}
            options={VIDEO_FILTER_RECEPTION_ZONES.map((zone) => ({ value: zone, label: `${t('zone')} ${zone}` }))}
          />
        ) : null}
        {skill === 'attack' ? (
          <>
            <MultiSelectFilter
              label={t('videoChainAttackSituation')}
              allLabel={t('videoPhaseAll')}
              selectedCountLabel={countLabel}
              selected={attributes.attackSituations ?? []}
              onChange={(next) => setAttribute(skill, 'attackSituations', next)}
              options={ATTACK_SITUATIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
            />
            <MultiSelectFilter
              label={t('videoChainAttackZone')}
              allLabel={t('videoPhaseAll')}
              selectedCountLabel={countLabel}
              selected={attributes.attackZones ?? []}
              onChange={(next) => setAttribute(skill, 'attackZones', next)}
              options={ATTACK_ZONES.map((zone) => ({ value: zone, label: `${t('zone')} ${zone}` }))}
            />
            <MultiSelectFilter
              label={t('numBlockersShort')}
              allLabel={t('videoPhaseAll')}
              selectedCountLabel={countLabel}
              selected={attributes.blockers ?? []}
              onChange={(next) => setAttribute(skill, 'blockers', next)}
              options={BLOCKER_COUNTS.map((count) => ({ value: count, label: String(count) }))}
            />
          </>
        ) : null}
      </div>
    );
  };

  return (
    <details className="video-analysis__chain" open={isActive || undefined}>
      <summary>{t('videoChainTitle')}{isActive ? ' •' : ''}</summary>
      <p className="video-analysis__chain-hint">{t('videoChainHint')}</p>
      <fieldset className="video-analysis__evaluations">
        <legend>{t('videoChainSkills')}</legend>
        {VIDEO_CHAIN_SKILL_ORDER.map((skill) => (
          <label key={skill} className="video-analysis__evaluation-toggle">
            <input type="checkbox" checked={chain.includes(skill)} onChange={(event) => toggleSkill(skill, event.target.checked)} />
            <span>{t(SKILL_LABEL_KEYS[skill])}</span>
          </label>
        ))}
      </fieldset>
      {chain.length > 0 ? (
        <p className="video-analysis__chain-summary">{chain.map((skill) => t(SKILL_LABEL_KEYS[skill])).join(' → ')}</p>
      ) : null}
      {chain.map(renderSkillAttributes)}
      <div className="video-analysis__chain-step">
        <MultiSelectFilter
          label={t('videoChainGamePhase')}
          allLabel={t('videoPhaseAll')}
          selectedCountLabel={countLabel}
          selected={value.phases}
          onChange={(phases) => onChange({ ...value, phases })}
          options={TOUCH_PHASES.map((phase) => ({ value: phase, label: t(PHASE_LABEL_KEYS[phase]) }))}
        />
        <MultiSelectFilter
          label={t('filterScoreRange')}
          allLabel={t('allScoreRanges')}
          selectedCountLabel={countLabel}
          selected={value.scoreSituations}
          onChange={(scoreSituations) => onChange({ ...value, scoreSituations })}
          options={SCORE_SITUATIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
        />
        {isActive ? (
          <button type="button" className="secondary-button" onClick={() => onChange(createDefaultVideoChainFilters())}>
            {t('resetFilters')}
          </button>
        ) : null}
      </div>
    </details>
  );
}
