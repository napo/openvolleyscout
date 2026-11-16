import { useEffect, useState } from 'react';
import type { CourtPosition } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { MatchTeamSelectionProps } from '@src/features/startup/components/MatchTeamSelection';
import { QuickMatchStart } from '@src/features/startup/components/QuickMatchStart';
import { ONBOARDING_SLIDES, type OnboardingSlideKind } from './onboarding-slides';
import {
  ONBOARDING_AWAY_ROSTER,
  ONBOARDING_AWAY_TEAM,
  ONBOARDING_COMPETITION_NAME,
  ONBOARDING_HOME_ROSTER,
  ONBOARDING_HOME_TEAM,
  ONBOARDING_VENUE,
} from './onboarding-fixture';

interface OnboardingTutorialSlideShowProps {
  open: boolean;
  onClose: () => void;
}

const NOOP = () => {};

/** Which step of the new-match page each slide shows. */
const QUICK_STEP: Partial<Record<OnboardingSlideKind, number>> = {
  quick_team: 1, quick_who: 2, quick_lineup: 3, quick_serve: 4, quick_level: 5, quick_start: 6,
};

// The six starters of the demo team, the setter in position 1.
const QUICK_LINEUP: Partial<Record<CourtPosition, string>> = Object.fromEntries(
  ONBOARDING_HOME_ROSTER.filter((player) => !player.isLibero).slice(0, 6).map((player, index) => [index + 1, String(player.jerseyNumber)]),
);
const QUICK_SETTER_POSITION: CourtPosition = 1;

function teamProps(side: 'home' | 'away'): MatchTeamSelectionProps {
  return {
    teamType: side,
    teamName: side === 'home' ? ONBOARDING_HOME_TEAM.name : ONBOARDING_AWAY_TEAM.name,
    archivedTeam: null,
    players: side === 'home' ? ONBOARDING_HOME_ROSTER : ONBOARDING_AWAY_ROSTER,
    allPlayersSelected: true,
    onTeamNameChange: NOOP,
    onSelectTeam: NOOP,
    onCreateNewTeam: NOOP,
    onAddPlayer: NOOP,
    onToggleSelectAll: NOOP,
    onPlayerFieldChange: NOOP,
    onPlayerToggleSelected: NOOP,
    onPlayerToggleLibero: NOOP,
    onPlayerToggleCaptain: NOOP,
    onPlayerRemove: NOOP,
  };
}

export function OnboardingTutorialSlideShow({ open, onClose }: OnboardingTutorialSlideShowProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const slide = ONBOARDING_SLIDES[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === ONBOARDING_SLIDES.length - 1;
  const matchSummary = `${ONBOARDING_HOME_TEAM.name} - ${ONBOARDING_AWAY_TEAM.name}`;

  const goPrevious = () => setCurrentIndex((index) => Math.max(0, index - 1));
  const goNext = () => {
    if (isLast) {
      onClose();
      return;
    }
    setCurrentIndex((index) => Math.min(ONBOARDING_SLIDES.length - 1, index + 1));
  };

  return (
    <div className="scouting-tutorial" role="dialog" aria-modal="true" aria-labelledby="onboarding-tutorial-title">
      <div className="scouting-tutorial__panel">
        <header className="scouting-tutorial__header">
          <div>
            <h2 id="onboarding-tutorial-title" className="scouting-tutorial__title">
              {t('tutorialOnboardingTitle')}
            </h2>
            <p className="scouting-tutorial__step-label">
              {t('tutorialStepOf', { current: slide.step, total: ONBOARDING_SLIDES.length })}
            </p>
          </div>
          <button type="button" className="scouting-tutorial__close" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <div className="scouting-tutorial__stage scouting-tutorial__stage--form">
          {slide.kind === 'intro' && (
            <div className="scouting-tutorial__intro-panel">
              <h3>{matchSummary}</h3>
              <p>{ONBOARDING_COMPETITION_NAME}</p>
              <p>{ONBOARDING_VENUE}</p>
            </div>
          )}

          {QUICK_STEP[slide.kind] ? (
            <QuickMatchStart
              key={slide.kind}
              previewStep={QUICK_STEP[slide.kind]}
              initial={{
                ownTeamOnly: true,
                lineup: QUICK_LINEUP,
                setterPosition: QUICK_SETTER_POSITION,
                servingTeam: slide.kind === 'quick_lineup' ? undefined : 'home',
                level: 'tag',
              }}
              homeTeamProps={teamProps('home')}
              awayTeamProps={teamProps('away')}
              homeName={ONBOARDING_HOME_TEAM.name}
              awayName={ONBOARDING_AWAY_TEAM.name}
              homePlayers={ONBOARDING_HOME_ROSTER}
              awayHasRoster={false}
              isSubmitting={false}
              onOpponentNameChange={NOOP}
              onOwnTeamOnly={NOOP}
              onAddLineupJersey={() => ({ added: [], skipped: [] })}
              onStart={NOOP}
              onFullSetup={NOOP}
            />
          ) : null}

          {slide.kind === 'outro' && (
            <div className="scouting-tutorial__intro-panel">
              <h3>{matchSummary}</h3>
              <p>Set 1 · 0-0</p>
            </div>
          )}
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
            {ONBOARDING_SLIDES.map((dotSlide) => (
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
