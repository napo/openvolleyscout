import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { NumBlockers } from '@src/domain/touch/types';
import { DEFAULT_DATAVOLLEY_CODE_TABLES, type DataVolleyCodeTables } from '@src/domain/match/code-tables';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { getEvaluationsForSkill } from '../model';
import type { LiveInputState } from '../live/stores/live-touch-flow-store';
import {
  createLiveToolbarSnapshot,
  type LiveToolbarPlayerSummary,
} from '../live/rally/live-toolbar-state';
import { getToolbarModeLayout } from '../live/rally/toolbar-mode-layout';
import {
  getBallTypeOptionsForSkill,
  type DataVolleyBallTypeCode,
} from '../model/datavolley-ball-types';
import './live-touch-toolbar.css';

const NUM_BLOCKERS_OPTIONS = [0, 1, 2, 3, 4] as const;
// Simple input always shows all six slots in this order so buttons never move:
// worst to best, with "!" between "-" and "+".
const ALL_EVALUATIONS: SkillEvaluation[] = ['=', '/', '-', '!', '+', '#'];
const SKILLS_WITH_OWN_SHORT_LABELS: SkillType[] = ['serve', 'receive', 'attack', 'block'];

type LiveScoutingToolbarProps = {
  inputState: LiveInputState;
  selectedPlayer: LiveToolbarPlayerSummary | null;
  controlsDisabled: boolean;
  skillEditable: boolean;
  canUndo: boolean;
  canRemoveLastTouch?: boolean;
  canOpenEvents: boolean;
  onSkillChange: (skill: SkillType) => void;
  onEvaluationChange: (evaluation: SkillEvaluation) => void;
  /** Restricts the selectable evaluations (e.g. only + / - for a block kept in play). */
  availableEvaluations?: SkillEvaluation[] | null;
  onBallTypeCodeChange?: (code: DataVolleyBallTypeCode) => void;
  selectedBallTypeCode?: DataVolleyBallTypeCode | null;
  onNumBlockersChange?: (numBlockers: NumBlockers) => void;
  selectedNumBlockers?: NumBlockers | null;
  /** Setter call (on a set) or attack combination (on an attack); '' clears it. */
  onCombinationCodeChange?: (code: string) => void;
  selectedCombinationCode?: string | null;
  /** The match's DataVolley tables listing the selectable calls and combinations. */
  codeTables?: DataVolleyCodeTables;
  onUndo: () => void;
  onRemoveLastTouch?: () => void;
  onOpenEvents: () => void;
  /** Touch layout: large evaluation bar, no DataVolley detail rows, fixed height. */
  simple?: boolean;
};

const EVAL_SYMBOL_KEY: Record<SkillEvaluation, string> = {
  '#': 'Hash', '+': 'Plus', '-': 'Minus', '!': 'Excl', '/': 'Slash', '=': 'Equal',
};

function getEvalTooltipKey(skill: SkillType | null, evaluation: SkillEvaluation): TranslationKey | null {
  if (!skill) return null;
  const suffix = EVAL_SYMBOL_KEY[evaluation];
  if (!suffix) return null;
  const skillCapitalized = skill.charAt(0).toUpperCase() + skill.slice(1);
  const key = `eval${skillCapitalized}${suffix}` as TranslationKey;
  return key;
}

function getEvalShortLabelKey(skill: SkillType | null, evaluation: SkillEvaluation): TranslationKey {
  const group = skill && SKILLS_WITH_OWN_SHORT_LABELS.includes(skill) ? skill : 'generic';
  return `evalShort${group.charAt(0).toUpperCase()}${group.slice(1)}${EVAL_SYMBOL_KEY[evaluation]}` as TranslationKey;
}

export function getSkillTranslationKey(skill: SkillType): TranslationKey {
  switch (skill) {
    case 'serve':
      return 'skillServe';
    case 'receive':
      return 'skillReceive';
    case 'set':
      return 'skillSet';
    case 'attack':
      return 'skillAttack';
    case 'block':
      return 'skillBlock';
    case 'dig':
      return 'skillDig';
    case 'freeball':
      return 'skillFreeball';
    case 'cover':
      return 'skillCover';
    default:
      return 'skill';
  }
}

export function LiveScoutingToolbar({
  inputState,
  selectedPlayer,
  controlsDisabled,
  skillEditable,
  canUndo,
  canRemoveLastTouch = false,
  canOpenEvents,
  onSkillChange,
  onEvaluationChange,
  availableEvaluations = null,
  onBallTypeCodeChange,
  selectedBallTypeCode,
  onNumBlockersChange,
  selectedNumBlockers,
  onCombinationCodeChange,
  selectedCombinationCode,
  codeTables = DEFAULT_DATAVOLLEY_CODE_TABLES,
  onUndo,
  onRemoveLastTouch,
  onOpenEvents,
  simple = false,
}: LiveScoutingToolbarProps) {
  const { t } = useTranslation();
  const snapshot = createLiveToolbarSnapshot({
    inputState,
    selectedPlayer,
    controlsDisabled,
    skillEditable,
  });
  const selectedSkill = snapshot.selectedSkill;
  const evaluations = selectedSkill ? getEvaluationsForSkill(selectedSkill) : [];
  const evaluationSlots = simple ? ALL_EVALUATIONS : evaluations;
  const layout = getToolbarModeLayout(selectedSkill);
  const ballTypeOptions = getBallTypeOptionsForSkill(selectedSkill);

  return (
    <section
      className={`live-scouting-toolbar live-scouting-toolbar--${layout.density}${simple ? ' live-scouting-toolbar--touch' : ''}`}
      aria-label={t('liveToolbar')}
      data-input-phase={snapshot.inputPhase}
      data-secondary-actions={layout.secondaryActions}
    >
      <div className="live-scouting-toolbar__player" aria-label={t('selectedPlayer')}>
        <div className="live-scouting-toolbar__status-line">
          <span className="live-scouting-toolbar__phase">{t(snapshot.phaseLabelKey)}</span>
        </div>
        {snapshot.selectedPlayer ? (
          <div className="live-scouting-toolbar__player-main">
            <strong className="live-scouting-toolbar__jersey">
              #{snapshot.selectedPlayer.jerseyNumber}
            </strong>
            {/* Jersey-only players have "#12" as their name; don't repeat the number. */}
            {snapshot.selectedPlayer.name !== `#${snapshot.selectedPlayer.jerseyNumber}` ? (
              <span className="live-scouting-toolbar__player-name">
                {snapshot.selectedPlayer.name}
              </span>
            ) : null}
            {snapshot.selectedPlayer.isLibero ? (
              <span className="live-scouting-toolbar__libero">{t('libero')}</span>
            ) : null}
            <span className="live-scouting-toolbar__team">
              {snapshot.selectedPlayer.teamLabel}
            </span>
          </div>
        ) : (
          <strong className="live-scouting-toolbar__prompt">{t('selectPlayer')}</strong>
        )}
      </div>

      <div className="live-scouting-toolbar__group live-scouting-toolbar__group--skills" aria-label={t('skill')}>
        {layout.visibleSkills.map((skill) => (
          <button
            key={skill}
            type="button"
            className={`live-scouting-toolbar__button live-scouting-toolbar__button--${
              layout.secondarySkills.includes(skill) ? 'secondary' : 'primary'
            }${selectedSkill === skill ? ' is-active' : ''}`}
            disabled={snapshot.controlsDisabled || !snapshot.skillEditable}
            aria-pressed={selectedSkill === skill}
            onClick={() => onSkillChange(skill)}
          >
            {t(getSkillTranslationKey(skill))}
          </button>
        ))}
      </div>

      <div className="live-scouting-toolbar__group live-scouting-toolbar__group--evaluations" aria-label={t('evaluation')}>
        {evaluationSlots.map((evaluation) => {
          const tooltipKey = getEvalTooltipKey(selectedSkill, evaluation);
          const isAvailable = evaluations.includes(evaluation)
            && (!availableEvaluations || availableEvaluations.includes(evaluation));
          return (
            <button
              key={evaluation}
              type="button"
              className={`live-scouting-toolbar__button live-scouting-toolbar__button--evaluation live-scouting-toolbar__button--eval-${EVAL_SYMBOL_KEY[evaluation].toLowerCase()}${
                snapshot.selectedEvaluation === evaluation ? ' is-active' : ''
              }`}
              disabled={snapshot.controlsDisabled || !isAvailable}
              aria-pressed={snapshot.selectedEvaluation === evaluation}
              onClick={() => onEvaluationChange(evaluation)}
              title={tooltipKey ? t(tooltipKey) : undefined}
            >
              {simple ? (
                <>
                  <span className="live-scouting-toolbar__eval-symbol">{evaluation}</span>
                  <span className="live-scouting-toolbar__eval-label">{isAvailable ? t(getEvalShortLabelKey(selectedSkill, evaluation)) : ''}</span>
                </>
              ) : evaluation}
            </button>
          );
        })}
      </div>

      {!simple && onCombinationCodeChange && selectedSkill === 'set' && codeTables.setterCalls.length > 0 && (
        <div className="live-scouting-toolbar__group live-scouting-toolbar__group--combination" aria-label={t('setterCall')}>
          {codeTables.setterCalls.map((call) => (
            <button
              key={call.code}
              type="button"
              className={`live-scouting-toolbar__button live-scouting-toolbar__button--combination${
                selectedCombinationCode === call.code ? ' is-active' : ''
              }`}
              disabled={snapshot.controlsDisabled}
              aria-pressed={selectedCombinationCode === call.code}
              onClick={() => onCombinationCodeChange(call.code)}
              title={call.description ? `${call.code} — ${call.description}` : call.code}
            >
              {call.code}
            </button>
          ))}
        </div>
      )}

      {!simple && onCombinationCodeChange && selectedSkill === 'attack' && codeTables.attackCombinations.length > 0 && (
        <div className="live-scouting-toolbar__group live-scouting-toolbar__group--combination">
          <select
            className="live-scouting-toolbar__select"
            aria-label={t('attackCombination')}
            title={t('attackCombination')}
            disabled={snapshot.controlsDisabled}
            value={selectedCombinationCode ?? ''}
            onChange={(event) => onCombinationCodeChange(event.target.value)}
          >
            <option value="">{t('attackCombinationNone')}</option>
            {codeTables.attackCombinations.map((combination) => (
              <option key={combination.code} value={combination.code}>
                {combination.description ? `${combination.code} — ${combination.description}` : combination.code}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Court input keeps only the serve and attack types, which matter most
          for the analyses; the rest stays in Detailed input. */}
      {(!simple || selectedSkill === 'serve' || selectedSkill === 'attack')
        && onBallTypeCodeChange && ballTypeOptions.length > 0 && (
        <div className="live-scouting-toolbar__group live-scouting-toolbar__group--ball-type" aria-label={t('ballType')}>
          {ballTypeOptions.map((option) => {
            return (
              <button
                key={option.code}
                type="button"
                className={`live-scouting-toolbar__button live-scouting-toolbar__button--ball-type${
                  selectedBallTypeCode === option.code ? ' is-active' : ''
                }`}
                disabled={snapshot.controlsDisabled}
                aria-pressed={selectedBallTypeCode === option.code}
                onClick={() => onBallTypeCodeChange(option.code)}
                title={t(option.labelKey)}
              >
                {option.code}
              </button>
            );
          })}
        </div>
      )}

      {!simple && onNumBlockersChange && selectedSkill === 'attack' && (
        <div className="live-scouting-toolbar__group live-scouting-toolbar__group--num-blockers" aria-label={t('numBlockers')}>
          <span className="live-scouting-toolbar__group-label">{t('numBlockersShort')}</span>
          {NUM_BLOCKERS_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`live-scouting-toolbar__button live-scouting-toolbar__button--num-blockers${
                selectedNumBlockers === n ? ' is-active' : ''
              }`}
              disabled={snapshot.controlsDisabled}
              aria-pressed={selectedNumBlockers === n}
              onClick={() => onNumBlockersChange(n)}
              title={t(`numBlockers${n}`)}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      <div className="live-scouting-toolbar__actions">
        <button
          type="button"
          className="live-scouting-toolbar__action live-scouting-toolbar__action--undo-action"
          aria-label={t('undoGroupedAction')}
          title={t('undoActionShortcutHint')}
          onClick={onUndo}
          disabled={!canUndo}
        >
          {t('undoAction')}
        </button>
        {canRemoveLastTouch && onRemoveLastTouch && (
          <button
            type="button"
            className="live-scouting-toolbar__action live-scouting-toolbar__action--undo-touch"
            aria-label={t('undoLastTouchShort')}
            title={t('undoLastTouchOnlyHint')}
            onClick={onRemoveLastTouch}
          >
            {t('undoLastTouchShort')}
          </button>
        )}
        <button
          type="button"
          className="live-scouting-toolbar__action live-scouting-toolbar__action--events"
          onClick={onOpenEvents}
          disabled={!canOpenEvents}
        >
          {t('events')}
        </button>
      </div>
    </section>
  );
}
