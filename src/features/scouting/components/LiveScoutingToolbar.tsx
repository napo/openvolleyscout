import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { getEvaluationsForSkill } from '../model';
import type { LiveInputState } from '../live/stores/live-touch-flow-store';
import {
  createLiveToolbarSnapshot,
  type LiveToolbarPlayerSummary,
} from '../live/rally/live-toolbar-state';
import { getToolbarModeLayout } from '../live/rally/toolbar-mode-layout';
import { getScoutingModeLabelKey } from '../model/scouting-mode';

export type BallHeight = 'low' | 'medium' | 'high';

type LiveScoutingToolbarProps = {
  inputState: LiveInputState;
  scoutingMode: ScoutingMode;
  selectedPlayer: LiveToolbarPlayerSummary | null;
  controlsDisabled: boolean;
  skillEditable: boolean;
  canUndo: boolean;
  canRemoveLastTouch?: boolean;
  canOpenEvents: boolean;
  onSkillChange: (skill: SkillType) => void;
  onEvaluationChange: (evaluation: SkillEvaluation) => void;
  onBallHeightChange?: (height: BallHeight) => void;
  selectedBallHeight?: BallHeight;
  onUndo: () => void;
  onRemoveLastTouch?: () => void;
  onOpenEvents: () => void;
};

function getSkillTranslationKey(skill: SkillType): TranslationKey {
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
  scoutingMode,
  selectedPlayer,
  controlsDisabled,
  skillEditable,
  canUndo,
  canRemoveLastTouch = false,
  canOpenEvents,
  onSkillChange,
  onEvaluationChange,
  onBallHeightChange,
  selectedBallHeight,
  onUndo,
  onRemoveLastTouch,
  onOpenEvents,
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
  const layout = getToolbarModeLayout(scoutingMode, selectedSkill);

  return (
    <section
      className={`live-scouting-toolbar live-scouting-toolbar--${layout.density}`}
      aria-label={t('liveToolbar')}
      data-input-phase={snapshot.inputPhase}
      data-scouting-mode={scoutingMode}
      data-secondary-actions={layout.secondaryActions}
    >
      <div className="live-scouting-toolbar__player" aria-label={t('selectedPlayer')}>
        <div className="live-scouting-toolbar__status-line">
          <span className="live-scouting-toolbar__phase">{t(snapshot.phaseLabelKey)}</span>
          <span className="live-scouting-toolbar__mode">{t(getScoutingModeLabelKey(scoutingMode))}</span>
        </div>
        {snapshot.selectedPlayer ? (
          <div className="live-scouting-toolbar__player-main">
            <strong className="live-scouting-toolbar__jersey">
              #{snapshot.selectedPlayer.jerseyNumber}
            </strong>
            <span className="live-scouting-toolbar__player-name">
              {snapshot.selectedPlayer.name}
            </span>
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
        {evaluations.map((evaluation) => (
          <button
            key={evaluation}
            type="button"
            className={`live-scouting-toolbar__button live-scouting-toolbar__button--evaluation${
              snapshot.selectedEvaluation === evaluation ? ' is-active' : ''
            }`}
            disabled={snapshot.controlsDisabled}
            aria-pressed={snapshot.selectedEvaluation === evaluation}
            onClick={() => onEvaluationChange(evaluation)}
          >
            {evaluation}
          </button>
        ))}
      </div>

      {onBallHeightChange && (
        <div className="live-scouting-toolbar__group live-scouting-toolbar__group--ball-height" aria-label={t('ballHeight', { defaultValue: 'Ball Height' })}>
          {(['low', 'medium', 'high'] as const).map((height) => {
            const codeMap = { low: 'Q', medium: 'M', high: 'H' };
            const descMap = { low: 'Quick - palla veloce', medium: 'Medium - palla media', high: 'High - palla alta' };
            const code = codeMap[height];
            const desc = descMap[height];
            return (
              <button
                key={height}
                type="button"
                className={`live-scouting-toolbar__button live-scouting-toolbar__button--ball-height${
                  selectedBallHeight === height ? ' is-active' : ''
                }`}
                disabled={snapshot.controlsDisabled}
                aria-pressed={selectedBallHeight === height}
                onClick={() => onBallHeightChange(height)}
                title={desc}
              >
                {code}
              </button>
            );
          })}
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
