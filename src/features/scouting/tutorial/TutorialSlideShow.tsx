import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { ScoutingCourt } from '../components/ScoutingCourt';
import { LiveScoutingToolbar } from '../components/LiveScoutingToolbar';
import type { LiveInputState } from '../live/stores/live-touch-flow-store';
import type { LiveToolbarPlayerSummary } from '../live/rally/live-toolbar-state';
import { getTutorialRallySlides, type RingColor } from './rally-slides';

interface TutorialSlideShowProps {
  open: boolean;
  onClose: () => void;
}

const NOOP = () => {};

const RING_COLOR_MAP: Record<RingColor, string> = {
  viola: '#8b5cf6',
  verde: '#16a34a',
  arancione: '#ea580c',
  rosso: '#dc2626',
  rosa: '#ec4899',
};

const KEYFRAME_STEP_MS = 650;

export function TutorialSlideShow({ open, onClose }: TutorialSlideShowProps) {
  const { t } = useTranslation();
  const slides = useMemo(() => getTutorialRallySlides(), []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [keyframeIndex, setKeyframeIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
    }
  }, [open]);

  const slide = slides[currentIndex];

  useEffect(() => {
    setKeyframeIndex(0);
    if (!slide?.keyframes?.length) {
      return;
    }

    const stepMs = slide.keyframeStepMs ?? KEYFRAME_STEP_MS;
    const timers = slide.keyframes.map((_, index) => (
      setTimeout(() => setKeyframeIndex(index + 1), (index + 1) * stepMs)
    ));

    return () => timers.forEach(clearTimeout);
  }, [slide]);

  if (!open || !slide) {
    return null;
  }

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === slides.length - 1;
  const activeKeyframe = slide.keyframes && keyframeIndex < slide.keyframes.length
    ? slide.keyframes[keyframeIndex]
    : null;

  const goPrevious = () => setCurrentIndex((index) => Math.max(0, index - 1));
  const goNext = () => {
    if (isLast) {
      onClose();
      return;
    }
    setCurrentIndex((index) => Math.min(slides.length - 1, index + 1));
  };

  const ballPosition = activeKeyframe?.ballPosition ?? slide.ballPosition;
  const trajectory = activeKeyframe && 'trajectory' in activeKeyframe ? activeKeyframe.trajectory ?? null : slide.trajectory;
  const evaluation = activeKeyframe && 'evaluation' in activeKeyframe ? activeKeyframe.evaluation ?? null : slide.evaluation;
  const awayPlayers = activeKeyframe?.awayPlayers ?? slide.awayPlayers;
  const homePlayers = activeKeyframe?.homePlayers ?? slide.homePlayers;

  // Use the jersey number from the actual court marker so the toolbar always
  // matches what the player circle shows, even if the slide definition and the
  // tactical resolver ended up with different orderings.
  const courtPlayers = [...awayPlayers, ...homePlayers];
  const courtPlayer = courtPlayers.find((p) => p.playerId === slide.player.playerId);

  const selectedPlayer: LiveToolbarPlayerSummary = {
    jerseyNumber: (typeof courtPlayer?.jerseyNumber === 'number' ? courtPlayer.jerseyNumber : null) ?? slide.player.jerseyNumber,
    name: slide.player.name,
    teamLabel: slide.teamName,
    isLibero: courtPlayer?.isLibero ?? slide.player.isLibero,
  };

  const inputState: LiveInputState = {
    selectedPlayerId: slide.player.playerId,
    selectedTeamSide: slide.teamSide,
    pendingBallPosition: null,
    selectedSkill: slide.skill,
    selectedEvaluation: evaluation,
    pendingTouch: null,
    requiredExplicitInput: { player: false, ballTarget: false, skill: false, evaluation: false },
    inferredCandidate: false,
    pendingInference: false,
    currentInputPhase: 'completed_touch',
  };

  const ringColorStyle = slide.ringColor
    ? ({ '--live-ring-color': RING_COLOR_MAP[slide.ringColor] } as React.CSSProperties)
    : undefined;

  const overlayMessage = slide.overlayMessageKey ? t(slide.overlayMessageKey) : null;
  const overlayActionLabel = slide.overlayActionLabelKey ? t(slide.overlayActionLabelKey) : null;

  return (
    <div className="scouting-tutorial" role="dialog" aria-modal="true" aria-labelledby="scouting-tutorial-title">
      <div className="scouting-tutorial__panel">
        <header className="scouting-tutorial__header">
          <div>
            <h2 id="scouting-tutorial-title" className="scouting-tutorial__title">
              {t('tutorialTitle')}
            </h2>
            <p className="scouting-tutorial__step-label">
              {t('tutorialStepOf', { current: slide.step, total: slides.length })}
            </p>
          </div>
          <button type="button" className="scouting-tutorial__close" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <div className="scouting-tutorial__stage">
          <div className="scouting-stage__body--live-rally">
            <div className="live-rally-stage" style={ringColorStyle}>
              <ScoutingCourt
                awayPlayers={awayPlayers}
                homePlayers={homePlayers}
                allowedZones={[]}
                selectedZone={null}
                initialBallPosition={ballPosition}
                selectedPlayerId={slide.awaitingSelectionPlayerKeys.length > 0 ? null : slide.player.playerId}
                selectedTeamSide={slide.teamSide}
                disabledPlayerTeamSides={['home', 'away']}
                awaitingSelectionPlayerKeys={slide.awaitingSelectionPlayerKeys}
                touchPopup={null}
                trajectories={[]}
                pendingTrajectory={trajectory}
                isBallDraggable={false}
                isRallyActive
                forceNetHighlight={slide.netHighlight}
                overlayMessage={overlayMessage}
                overlayActionLabel={overlayActionLabel}
                onOverlayAction={NOOP}
                onZoneSnap={NOOP}
                onPlayerSelect={NOOP}
              />
              <LiveScoutingToolbar
                inputState={inputState}
                selectedPlayer={selectedPlayer}
                controlsDisabled
                skillEditable={false}
                canUndo={false}
                canOpenEvents={false}
                selectedCombinationCode={slide.combinationCode ?? null}
                onCombinationCodeChange={slide.combinationCode ? NOOP : undefined}
                selectedBallTypeCode={slide.ballTypeCode ?? null}
                onBallTypeCodeChange={slide.ballTypeCode ? NOOP : undefined}
                onSkillChange={NOOP}
                onEvaluationChange={NOOP}
                onUndo={NOOP}
                onOpenEvents={NOOP}
              />
            </div>
          </div>
        </div>

        <p className="scouting-tutorial__caption">{t(slide.captionKey)}</p>

        <div className="scouting-tutorial__nav">
          <button
            type="button"
            className="btn-secondary btn-small scouting-tutorial__nav-button"
            onClick={goPrevious}
            disabled={isFirst}
          >
            {t('tutorialPrevious')}
          </button>
          <div className="scouting-tutorial__dots" aria-hidden="true">
            {slides.map((dotSlide) => (
              <span
                key={dotSlide.step}
                className={`scouting-tutorial__dot${dotSlide.step === slide.step ? ' is-active' : ''}`}
              />
            ))}
          </div>
          <button type="button" className="btn-primary btn-small scouting-tutorial__nav-button" onClick={goNext}>
            {t(isLast ? 'tutorialFinish' : 'tutorialNext')}
          </button>
        </div>
      </div>
    </div>
  );
}
