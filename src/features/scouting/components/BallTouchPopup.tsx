import { useLayoutEffect, useRef, useState } from 'react';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import {
  TOUCH_SKILLS,
  getEvaluationsForSkill,
  getNextItem,
} from '../model';

interface BallTouchPopupProps {
  playerLabel: string;
  teamLabel: string;
  skill: SkillType;
  selectedEvaluation?: SkillEvaluation;
  skillEditable?: boolean;
  hideConfirm?: boolean;
  anchor: {
    x: number;
    y: number;
  };
  onSkillChange: (skill: SkillType) => void;
  onEvaluationChange: (evaluation: SkillEvaluation) => void;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function BallTouchPopup({
  playerLabel,
  teamLabel,
  skill,
  selectedEvaluation,
  skillEditable = true,
  hideConfirm = false,
  anchor,
  onSkillChange,
  onEvaluationChange,
}: BallTouchPopupProps) {
  const { t } = useTranslation();
  const popupRef = useRef<HTMLElement>(null);
  const skillEvaluations = getEvaluationsForSkill(skill);
  const [popupLayout, setPopupLayout] = useState({
    left: 0,
    top: 0,
    maxHeight: 320,
    compact: false,
  });

  useLayoutEffect(() => {
    const measurePopup = () => {
      const popupElement = popupRef.current;
      const surfaceElement = popupElement?.closest('.scouting-court__surface');

      if (!(popupElement instanceof HTMLElement) || !(surfaceElement instanceof HTMLElement)) {
        return;
      }

      const surfaceRect = surfaceElement.getBoundingClientRect();
      const popupRect = popupElement.getBoundingClientRect();
      const padding = surfaceRect.height < 360 ? 8 : 12;
      const horizontalGap = surfaceRect.width < 640 ? 8 : 12;
      const anchorX = (anchor.x / 100) * surfaceRect.width;
      const anchorY = (anchor.y / 100) * surfaceRect.height;
      const placeRight = anchor.x <= 70;
      const maxHeight = Math.max(surfaceRect.height - (padding * 2), 160);
      const popupHeight = Math.min(popupRect.height, maxHeight);
      const popupWidth = popupRect.width;
      const preferredTop = anchorY - (popupHeight * 0.45);
      const preferredLeft = placeRight
        ? anchorX + horizontalGap
        : anchorX - popupWidth - horizontalGap;

      setPopupLayout({
        left: clamp(preferredLeft, padding, Math.max(padding, surfaceRect.width - popupWidth - padding)),
        top: clamp(preferredTop, padding, Math.max(padding, surfaceRect.height - popupHeight - padding)),
        maxHeight,
        compact: maxHeight < 280,
      });
    };

    measurePopup();

    const popupElement = popupRef.current;
    const surfaceElement = popupElement?.closest('.scouting-court__surface');
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && surfaceElement instanceof HTMLElement
        ? new ResizeObserver(() => {
            measurePopup();
          })
        : null;

    if (resizeObserver && surfaceElement instanceof HTMLElement) {
      resizeObserver.observe(surfaceElement);
      resizeObserver.observe(popupElement);
    }

    window.addEventListener('resize', measurePopup);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measurePopup);
    };
  }, [
    anchor.x,
    anchor.y,
    skill,
    selectedEvaluation,
    teamLabel,
    playerLabel,
  ]);

  const popupStyle = {
    left: `${popupLayout.left}px`,
    top: `${popupLayout.top}px`,
    maxHeight: `${popupLayout.maxHeight}px`,
  };

  return (
    <section
      ref={popupRef}
      className={`ball-touch-popup${popupLayout.compact ? ' ball-touch-popup--compact' : ''}`}
      style={popupStyle}
    >
      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('team')}</span>
        <div className="ball-touch-popup__player ball-touch-popup__player--readonly">
          <div className="ball-touch-popup__player-display">
            <strong>{teamLabel}</strong>
          </div>
        </div>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('jerseyNumber')}</span>
        <div className="ball-touch-popup__player ball-touch-popup__player--readonly">
          <div className="ball-touch-popup__player-display">
            <strong className="ball-touch-popup__player-number">
              {playerLabel}
            </strong>
          </div>
        </div>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('skill')}</span>
        <div className="ball-touch-popup__player">
          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => onSkillChange(getNextItem(TOUCH_SKILLS, skill, -1))}
            disabled={!skillEditable}
            aria-label={t('previousSkill')}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="ball-touch-popup__player-display">
            <strong>{t(getSkillTranslationKey(skill))}</strong>
          </div>

          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => onSkillChange(getNextItem(TOUCH_SKILLS, skill, 1))}
            disabled={!skillEditable}
            aria-label={t('nextSkill')}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('evaluation')}</span>
        <div className="ball-touch-popup__evaluation-grid">
          {skillEvaluations.map((item) => (
            <button
              key={item}
              type="button"
              className={`ball-touch-popup__evaluation-option ${selectedEvaluation === item ? 'is-active' : ''}`}
              onClick={() => onEvaluationChange(item)}
              aria-pressed={selectedEvaluation === item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {!hideConfirm ? (
        <button type="button" className="ball-touch-popup__confirm" disabled>
          {t('confirm')}
        </button>
      ) : null}
    </section>
  );
}
