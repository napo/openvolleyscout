import { useEffect, useMemo, useState } from 'react';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { Player } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import {
  TOUCH_SKILLS,
  getEvaluationsForSkill,
  getDefaultEvaluationForSkill,
  getNextItem,
  suggestNextTouchSkill,
} from '../model';

interface BallTouchPopupProps {
  players: Player[];
  previousSkill?: SkillType;
  previousEvaluation?: SkillEvaluation;
  forceSkill?: SkillType;
  forcePlayerId?: string;
  teamLabel?: string;
  teamSide?: 'home' | 'away';
  teamOptions?: {
    teamSide: 'home' | 'away';
    label: string;
  }[];
  onTeamChange?: (teamSide: 'home' | 'away') => void;
  anchor: {
    x: number;
    y: number;
  };
  onConfirm: (input: {
    playerId?: string;
    teamSide?: 'home' | 'away';
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function BallTouchPopup({
  players,
  previousSkill,
  previousEvaluation,
  forceSkill,
  forcePlayerId,
  teamLabel,
  teamSide,
  teamOptions = [],
  onTeamChange,
  anchor,
  onConfirm,
}: BallTouchPopupProps) {
  const { t } = useTranslation();

  const initialSkill = forceSkill ?? suggestNextTouchSkill(previousSkill, previousEvaluation);

  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<SkillType>(initialSkill);
  const [selectedEvaluation, setSelectedEvaluation] = useState<SkillEvaluation>(
    getDefaultEvaluationForSkill(initialSkill),
  );

  useEffect(() => {
    if (!forcePlayerId) {
      setSelectedPlayerIndex(0);
      return;
    }

    const forcedIndex = players.findIndex((player) => player.id === forcePlayerId);
    setSelectedPlayerIndex(forcedIndex >= 0 ? forcedIndex : 0);
  }, [players, forcePlayerId]);

  useEffect(() => {
    const nextSkill = forceSkill ?? suggestNextTouchSkill(previousSkill, previousEvaluation);
    setSelectedSkill(nextSkill);
    setSelectedEvaluation(getDefaultEvaluationForSkill(nextSkill));
  }, [previousSkill, previousEvaluation, forceSkill, anchor.x, anchor.y]);

  useEffect(() => {
    setSelectedEvaluation(getDefaultEvaluationForSkill(selectedSkill));
  }, [selectedSkill]);

  const selectedPlayer = players[selectedPlayerIndex] ?? null;
  const canCyclePlayers = !forcePlayerId && players.length > 1;
  const hasPlayers = players.length > 0;
  const skillEvaluations = getEvaluationsForSkill(selectedSkill);

  const popupStyle = useMemo(() => {
    const placeRight = anchor.x <= 70;
    const estimatedPopupHeight = 34;
    const preferredTop = anchor.y - 14;

    return {
      left: `${clamp(placeRight ? anchor.x + 5.5 : anchor.x - 30, 2, 68)}%`,
      top: `${clamp(preferredTop, 2, 100 - estimatedPopupHeight)}%`,
    };
  }, [anchor.x, anchor.y]);

  return (
    <section className="ball-touch-popup" style={popupStyle}>
      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('team')}</span>
        <div className="ball-touch-popup__player">
          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => {
              if (!teamSide || teamOptions.length === 0) return;

              const currentIndex = teamOptions.findIndex((item) => item.teamSide === teamSide);
              const safeIndex = currentIndex >= 0 ? currentIndex : 0;
              const next = teamOptions[(safeIndex - 1 + teamOptions.length) % teamOptions.length];

              onTeamChange?.(next.teamSide);
            }}
            disabled={teamOptions.length <= 1 || Boolean(forcePlayerId)}
            aria-label={t('previousTeam')}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="ball-touch-popup__player-display">
            <strong>{teamLabel ?? t('notSpecified')}</strong>
          </div>

          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => {
              if (!teamSide || teamOptions.length === 0) return;

              const currentIndex = teamOptions.findIndex((item) => item.teamSide === teamSide);
              const safeIndex = currentIndex >= 0 ? currentIndex : 0;
              const next = teamOptions[(safeIndex + 1) % teamOptions.length];

              onTeamChange?.(next.teamSide);
            }}
            disabled={teamOptions.length <= 1 || Boolean(forcePlayerId)}
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
            onClick={() => {
              if (!hasPlayers) return;
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
              if (!hasPlayers) return;
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
        <div className="ball-touch-popup__player">
          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => setSelectedSkill((current) => getNextItem(TOUCH_SKILLS, current, -1))}
            disabled={Boolean(forceSkill)}
            aria-label={t('previousSkill')}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="ball-touch-popup__player-display">
            <strong>{t(getSkillTranslationKey(selectedSkill))}</strong>
          </div>

          <button
            type="button"
            className="ball-touch-popup__stepper"
            onClick={() => setSelectedSkill((current) => getNextItem(TOUCH_SKILLS, current, 1))}
            disabled={Boolean(forceSkill)}
            aria-label={t('nextSkill')}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div className="ball-touch-popup__section">
        <span className="ball-touch-popup__label">{t('evaluation')}</span>
        <div className="ball-touch-popup__evaluation-grid">
          {skillEvaluations.map((evaluation) => (
            <button
              key={evaluation}
              type="button"
              className={`ball-touch-popup__evaluation-option ${
                selectedEvaluation === evaluation ? 'is-active' : ''
              }`}
              onClick={() => setSelectedEvaluation(evaluation)}
              aria-pressed={selectedEvaluation === evaluation}
            >
              {evaluation}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn-primary ball-touch-popup__confirm"
          onClick={() =>
            onConfirm({
              playerId: selectedPlayer?.id,
              teamSide,
              skill: selectedSkill,
              evaluation: selectedEvaluation,
            })
          }
      >
        {t('confirmTouch')}
      </button>
    </section>
  );
}
