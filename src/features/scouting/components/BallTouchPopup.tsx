import { useEffect, useMemo, useState } from 'react';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { Player } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { TOUCH_EVALUATIONS, TOUCH_SKILLS, suggestNextTouchSkill } from '../model';

interface BallTouchPopupProps {
  players: Player[];
  previousSkill?: SkillType;
  anchor: {
    x: number;
    y: number;
  };
  onConfirm: (input: {
    playerId?: string;
    skill: SkillType;
    evaluation?: SkillEvaluation;
  }) => void;
}

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

function getEvaluationTranslationKey(evaluation: SkillEvaluation): TranslationKey {
  switch (evaluation) {
    case '=':
      return 'evaluationEqual';
    case '/':
      return 'evaluationSlash';
    case '!':
      return 'evaluationExclamation';
    case '-':
      return 'evaluationMinus';
    case '+':
      return 'evaluationPlus';
    case '#':
      return 'evaluationHash';
    default:
      return 'evaluation';
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function BallTouchPopup({ players, previousSkill, anchor, onConfirm }: BallTouchPopupProps) {
  const { t } = useTranslation();
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<SkillType>(suggestNextTouchSkill(previousSkill));
  const [selectedEvaluation, setSelectedEvaluation] = useState<SkillEvaluation | ''>('');

  useEffect(() => {
    setSelectedPlayerIndex(0);
  }, [players]);

  useEffect(() => {
    setSelectedSkill(suggestNextTouchSkill(previousSkill));
    setSelectedEvaluation('');
  }, [previousSkill, anchor.x, anchor.y]);

  const selectedPlayer = players[selectedPlayerIndex] ?? null;
  const canCyclePlayers = players.length > 1;
  const hasPlayers = players.length > 0;
  const popupStyle = useMemo(() => {
    const placeRight = anchor.x <= 70;

    return {
      left: `${clamp(placeRight ? anchor.x + 5.5 : anchor.x - 30, 2, 68)}%`,
      top: `${clamp(anchor.y - 11, 4, 74)}%`,
    };
  }, [anchor.x, anchor.y]);

  return (
    <section className="ball-touch-popup" style={popupStyle}>
      <div className="ball-touch-popup__header">
        <span className="ball-touch-popup__eyebrow">{t('recordTouch')}</span>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('jerseyNumber')}</span>
        <div className="ball-touch-popup__player">
          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => {
              if (!hasPlayers) {
                return;
              }

              setSelectedPlayerIndex((current) => (current - 1 + players.length) % players.length);
            }}
            disabled={!canCyclePlayers}
            aria-label={t('previousPlayer')}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="ball-touch-popup__player-display">
            <strong className="ball-touch-popup__player-number">
              {selectedPlayer ? `#${selectedPlayer.jerseyNumber}` : t('notSpecified')}
            </strong>
          </div>

          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => {
              if (!hasPlayers) {
                return;
              }

              setSelectedPlayerIndex((current) => (current + 1) % players.length);
            }}
            disabled={!canCyclePlayers}
            aria-label={t('nextPlayer')}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('skill')}</span>
        <div className="ball-touch-popup__chips">
          {TOUCH_SKILLS.map((skill) => (
            <button
              key={skill}
              type="button"
              className={`ball-touch-popup__chip ${selectedSkill === skill ? 'is-active' : ''}`}
              onClick={() => setSelectedSkill(skill)}
            >
              {t(getSkillTranslationKey(skill))}
            </button>
          ))}
        </div>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('evaluation')}</span>
        <div className="ball-touch-popup__chips ball-touch-popup__chips--compact">
          {TOUCH_EVALUATIONS.map((evaluation) => (
            <button
              key={evaluation}
              type="button"
              className={`ball-touch-popup__chip ball-touch-popup__chip--evaluation ${selectedEvaluation === evaluation ? 'is-active' : ''}`}
              onClick={() => setSelectedEvaluation((current) => (current === evaluation ? '' : evaluation))}
              aria-label={t(getEvaluationTranslationKey(evaluation))}
            >
              {evaluation}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn-primary ball-touch-popup__confirm"
        onClick={() => onConfirm({ playerId: selectedPlayer?.id, skill: selectedSkill, evaluation: selectedEvaluation || undefined })}
      >
        {t('confirmTouch')}
      </button>
    </section>
  );
}
