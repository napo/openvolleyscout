import { useLayoutEffect, useRef, useState } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import {
  TOUCH_SKILLS,
  getEvaluationsForSkill,
  getNextItem,
} from '../model';
import {
  computeBallTouchPopupLayout,
  createPopupPlacementRect,
  type PopupPlacementRect,
} from '../model/popup-placement';

interface BallTouchPopupProps {
  teamSide: TeamSide;
  teamOptions: Array<{
    teamSide: TeamSide;
    label: string;
  }>;
  playerId: string;
  playerOptions: Array<{
    playerId: string;
    label: string;
  }>;
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
  ballPosition?: {
    x: number;
    y: number;
  };
  avoidPoints?: Array<{
    x: number;
    y: number;
  }>;
  onTeamChange: (teamSide: TeamSide) => void;
  onPlayerChange: (playerId: string) => void;
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

function getBallRect(surfaceRect: DOMRect, anchor: { x: number; y: number }, surfaceElement: HTMLElement): PopupPlacementRect {
  const ballElement = surfaceElement.querySelector('.scouting-court__ball-token');
  if (ballElement instanceof HTMLElement) {
    const ballRect = ballElement.getBoundingClientRect();

    return {
      left: ballRect.left - surfaceRect.left,
      top: ballRect.top - surfaceRect.top,
      right: ballRect.right - surfaceRect.left,
      bottom: ballRect.bottom - surfaceRect.top,
    };
  }

  const tokenSize = Math.max(28, Math.min(surfaceRect.width, surfaceRect.height) * 0.1);
  const centerX = (anchor.x / 100) * surfaceRect.width;
  const centerY = (anchor.y / 100) * surfaceRect.height;

  return createPopupPlacementRect(centerX - tokenSize / 2, centerY - tokenSize / 2, tokenSize, tokenSize);
}

export function BallTouchPopup({
  teamSide,
  teamOptions,
  playerId,
  playerOptions,
  playerLabel,
  teamLabel,
  skill,
  selectedEvaluation,
  skillEditable = true,
  hideConfirm = false,
  anchor,
  ballPosition,
  avoidPoints = [],
  onTeamChange,
  onPlayerChange,
  onSkillChange,
  onEvaluationChange,
}: BallTouchPopupProps) {
  const { t } = useTranslation();
  const popupRef = useRef<HTMLElement>(null);
  const skillEvaluations = getEvaluationsForSkill(skill);
  const avoidPointsKey = avoidPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join('|');
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
      const ballAnchor = ballPosition ?? anchor;
      const ballRect = getBallRect(surfaceRect, ballAnchor, surfaceElement);

      setPopupLayout(computeBallTouchPopupLayout({
        surfaceWidth: surfaceRect.width,
        surfaceHeight: surfaceRect.height,
        popupWidth: popupRect.width,
        popupHeight: popupRect.height,
        teamSide,
        anchor,
        ballPosition: ballAnchor,
        ballRect,
        avoidPoints,
      }));
    };

    let animationFrameId: number | null = null;
    const scheduleMeasurePopup = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        measurePopup();
      });
    };

    measurePopup();

    const popupElement = popupRef.current;
    const surfaceElement = popupElement?.closest('.scouting-court__surface');
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && surfaceElement instanceof HTMLElement
        ? new ResizeObserver(scheduleMeasurePopup)
        : null;

      if (
        resizeObserver &&
        surfaceElement instanceof HTMLElement &&
        popupElement instanceof HTMLElement
      ) {
        resizeObserver.observe(surfaceElement);
        resizeObserver.observe(popupElement);
      }
    window.addEventListener('resize', scheduleMeasurePopup);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasurePopup);
    };
  }, [
    anchor.x,
    anchor.y,
    avoidPointsKey,
    ballPosition?.x,
    ballPosition?.y,
    teamSide,
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
        <div className="ball-touch-popup__player">
          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => onTeamChange(getNextItem(teamOptions, teamOptions.find((option) => option.teamSide === teamSide) ?? teamOptions[0], -1).teamSide)}
            aria-label={t('previousTeam')}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="ball-touch-popup__player-display">
            <strong>{teamLabel}</strong>
          </div>

          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => onTeamChange(getNextItem(teamOptions, teamOptions.find((option) => option.teamSide === teamSide) ?? teamOptions[0], 1).teamSide)}
            aria-label={t('nextTeam')}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('jerseyNumber')}</span>
        <div className="ball-touch-popup__player">
          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => onPlayerChange(getNextItem(playerOptions, playerOptions.find((option) => option.playerId === playerId) ?? playerOptions[0], -1).playerId)}
            disabled={playerOptions.length <= 1}
            aria-label={t('previousPlayer')}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="ball-touch-popup__player-display">
            <strong className="ball-touch-popup__player-number">
              {playerLabel}
            </strong>
          </div>

          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => onPlayerChange(getNextItem(playerOptions, playerOptions.find((option) => option.playerId === playerId) ?? playerOptions[0], 1).playerId)}
            disabled={playerOptions.length <= 1}
            aria-label={t('nextPlayer')}
          >
            <span aria-hidden="true">›</span>
          </button>
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
