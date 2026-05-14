import { useLayoutEffect, useRef, useState } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import {
  TOUCH_SKILLS,
  getEvaluationsForSkill,
  getNextItem,
} from '../model';

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type PopupRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type LayoutCandidate = {
  left: number;
  top: number;
};

function createRect(left: number, top: number, width: number, height: number): PopupRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function doRectsOverlap(first: PopupRect, second: PopupRect, gap = 0): boolean {
  return !(
    first.right + gap <= second.left
    || first.left - gap >= second.right
    || first.bottom + gap <= second.top
    || first.top - gap >= second.bottom
  );
}

function getOverlapArea(first: PopupRect, second: PopupRect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

  return width * height;
}

function getBallRect(surfaceRect: DOMRect, anchor: { x: number; y: number }, surfaceElement: HTMLElement): PopupRect {
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

  return createRect(centerX - tokenSize / 2, centerY - tokenSize / 2, tokenSize, tokenSize);
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
  onTeamChange,
  onPlayerChange,
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
      const isShortLandscapeSurface = surfaceRect.height <= 320 && surfaceRect.width > surfaceRect.height;
      const padding = isShortLandscapeSurface ? 6 : surfaceRect.height < 360 ? 8 : 12;
      const horizontalGap = isShortLandscapeSurface ? 6 : surfaceRect.width < 640 ? 8 : 12;
      const anchorX = (anchor.x / 100) * surfaceRect.width;
      const anchorY = (anchor.y / 100) * surfaceRect.height;
      const availableHeight = Math.max(surfaceRect.height - (padding * 2), 0);
      const maxHeight = isShortLandscapeSurface
        ? Math.min(availableHeight, surfaceRect.height * 0.9)
        : availableHeight;
      const popupHeight = Math.min(popupRect.height, maxHeight);
      const popupWidth = popupRect.width;
      const leftBound = padding;
      const rightBound = Math.max(padding, surfaceRect.width - popupWidth - padding);
      const prefersRightHalf = teamSide === 'away' || anchor.x < 50;
      const preferredTop = anchorY - (popupHeight * 0.45);
      const preferredSideLeft = prefersRightHalf
        ? Math.max(surfaceRect.width * 0.58, anchorX + horizontalGap)
        : Math.min((surfaceRect.width * 0.42) - popupWidth, anchorX - popupWidth - horizontalGap);
      const oppositeSideLeft = prefersRightHalf
        ? anchorX - popupWidth - horizontalGap
        : anchorX + horizontalGap;
      const centeredLeft = anchorX - popupWidth / 2;
      const verticalGap = horizontalGap;
      const topBound = padding;
      const bottomBound = Math.max(padding, surfaceRect.height - popupHeight - padding);
      const ballAnchor = ballPosition ?? anchor;
      const ballRect = getBallRect(surfaceRect, ballAnchor, surfaceElement);
      const rawCandidates: LayoutCandidate[] = [
        { left: preferredSideLeft, top: preferredTop },
        { left: oppositeSideLeft, top: preferredTop },
        { left: centeredLeft, top: anchorY - popupHeight - verticalGap },
        { left: centeredLeft, top: anchorY + verticalGap },
      ];
      const candidates = rawCandidates.map((candidate) => ({
        left: clamp(candidate.left, leftBound, rightBound),
        top: clamp(candidate.top, topBound, bottomBound),
      }));
      const fallbackLeft = prefersRightHalf ? rightBound : leftBound;
      const fallbackCandidate = {
        left: fallbackLeft,
        top: clamp(preferredTop, topBound, bottomBound),
      };
      const bestCandidate = candidates.find((candidate) => (
        !doRectsOverlap(createRect(candidate.left, candidate.top, popupWidth, popupHeight), ballRect, 6)
      )) ?? [...candidates, fallbackCandidate]
        .sort((left, right) => (
          getOverlapArea(createRect(left.left, left.top, popupWidth, popupHeight), ballRect)
          - getOverlapArea(createRect(right.left, right.top, popupWidth, popupHeight), ballRect)
        ))[0] ?? fallbackCandidate;

      setPopupLayout({
        left: bestCandidate.left,
        top: bestCandidate.top,
        maxHeight,
        compact: isShortLandscapeSurface || maxHeight < 280,
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

      if (
        resizeObserver &&
        surfaceElement instanceof HTMLElement &&
        popupElement instanceof HTMLElement
      ) {
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
