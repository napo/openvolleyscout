import { useEffect, useState } from 'react';
import type { CourtPosition } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import { CompetitionNameInput } from '@src/features/startup/components/CompetitionNameInput';
import { MatchTeamSelection } from '@src/features/startup/components/MatchTeamSelection';
import { PreMatchConfigStage } from '../../components/PreMatchConfigStage';
import { MatchReadinessSection } from '@src/features/startup/components/MatchReadinessSection';
import { TeamSetupScreen, ServingTeamScreen, ConfirmNextSetSetupScreen } from '../../components/SetStartFlow';
import { ONBOARDING_SLIDES } from './onboarding-slides';
import {
  ONBOARDING_AWAY_ROSTER,
  ONBOARDING_AWAY_TEAM,
  ONBOARDING_COMPETITION_NAME,
  ONBOARDING_HOME_ROSTER,
  ONBOARDING_HOME_TEAM,
  ONBOARDING_MATCH_DATE,
  ONBOARDING_READINESS_RESULT,
  ONBOARDING_SCOUTING_CONFIG,
  ONBOARDING_SET_START_STATE,
  ONBOARDING_START_TIME,
  ONBOARDING_VENUE,
} from './onboarding-fixture';

interface OnboardingTutorialSlideShowProps {
  open: boolean;
  onClose: () => void;
}

const NOOP = () => {};
const NOOP_ASYNC = async () => {};

export function OnboardingTutorialSlideShow({ open, onClose }: OnboardingTutorialSlideShowProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPosition, setSelectedPosition] = useState<Record<'home' | 'away', CourtPosition>>({
    home: 1,
    away: 1,
  });

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

          {slide.kind === 'match_info' && (
            <div className="match-setup-form-grid scouting-tutorial__form-preview">
              <div className="form-group">
                <label className="form-label">{t('competitionName')}</label>
                <CompetitionNameInput
                  value={ONBOARDING_COMPETITION_NAME}
                  onChange={NOOP}
                  onSelectSuggestion={NOOP}
                  disabled
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('matchDate')}</label>
                <input type="date" className="form-input" value={ONBOARDING_MATCH_DATE} disabled readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">{t('startTime')}</label>
                <input type="time" className="form-input" value={ONBOARDING_START_TIME} disabled readOnly />
              </div>
              <div className="form-group match-setup-form-grid__full">
                <label className="form-label">{t('venue')}</label>
                <input type="text" className="form-input" value={ONBOARDING_VENUE} disabled readOnly />
              </div>
            </div>
          )}

          {slide.kind === 'home_roster' && (
            <MatchTeamSelection
              teamType="home"
              teamName={ONBOARDING_HOME_TEAM.name}
              archivedTeam={null}
              players={ONBOARDING_HOME_ROSTER}
              allPlayersSelected
              onTeamNameChange={NOOP}
              onSelectTeam={NOOP}
              onCreateNewTeam={NOOP}
              onAddPlayer={NOOP}
              onToggleSelectAll={NOOP}
              onPlayerFieldChange={NOOP}
              onPlayerToggleSelected={NOOP}
              onPlayerToggleLibero={NOOP}
              onPlayerToggleCaptain={NOOP}
              onPlayerRemove={NOOP}
            />
          )}

          {slide.kind === 'away_roster' && (
            <MatchTeamSelection
              teamType="away"
              teamName={ONBOARDING_AWAY_TEAM.name}
              archivedTeam={null}
              players={ONBOARDING_AWAY_ROSTER}
              allPlayersSelected
              onTeamNameChange={NOOP}
              onSelectTeam={NOOP}
              onCreateNewTeam={NOOP}
              onAddPlayer={NOOP}
              onToggleSelectAll={NOOP}
              onPlayerFieldChange={NOOP}
              onPlayerToggleSelected={NOOP}
              onPlayerToggleLibero={NOOP}
              onPlayerToggleCaptain={NOOP}
              onPlayerRemove={NOOP}
            />
          )}

          {slide.kind === 'scoring_config' && (
            <PreMatchConfigStage initialConfig={ONBOARDING_SCOUTING_CONFIG} onSave={NOOP_ASYNC} />
          )}

          {slide.kind === 'readiness' && (
            <MatchReadinessSection readiness={ONBOARDING_READINESS_RESULT} />
          )}

          {slide.kind === 'lineup_home' && (
            <TeamSetupScreen
              team={ONBOARDING_HOME_TEAM}
              teamSide="home"
              state={ONBOARDING_SET_START_STATE.home}
              issues={[]}
              selectedPosition={selectedPosition.home}
              onSelectedPositionChange={(position) => setSelectedPosition((current) => ({ ...current, home: position }))}
              onSlotChange={NOOP}
              onTacticalRoleChange={NOOP}
              onSetterChange={NOOP}
              onLiberoChange={NOOP}
              onLiberoAutoMiddleReplacementChange={NOOP}
              onDisplaySideChange={NOOP}
              onRotateClockwise={NOOP}
              onAutoFill={NOOP}
            />
          )}

          {slide.kind === 'lineup_away' && (
            <TeamSetupScreen
              team={ONBOARDING_AWAY_TEAM}
              teamSide="away"
              state={ONBOARDING_SET_START_STATE.away}
              issues={[]}
              selectedPosition={selectedPosition.away}
              onSelectedPositionChange={(position) => setSelectedPosition((current) => ({ ...current, away: position }))}
              onSlotChange={NOOP}
              onTacticalRoleChange={NOOP}
              onSetterChange={NOOP}
              onLiberoChange={NOOP}
              onLiberoAutoMiddleReplacementChange={NOOP}
              onDisplaySideChange={NOOP}
              onRotateClockwise={NOOP}
              onAutoFill={NOOP}
            />
          )}

          {slide.kind === 'serving_team' && (
            <ServingTeamScreen
              matchSummary={matchSummary}
              homeTeamName={ONBOARDING_HOME_TEAM.name}
              awayTeamName={ONBOARDING_AWAY_TEAM.name}
              servingTeam={ONBOARDING_SET_START_STATE.servingTeam}
              homeDisplaySide={ONBOARDING_SET_START_STATE.home.displaySide}
              awayDisplaySide={ONBOARDING_SET_START_STATE.away.displaySide}
              issues={[]}
              onServingTeamChange={NOOP}
              onInvertFields={NOOP}
            />
          )}

          {slide.kind === 'confirm' && (
            <ConfirmNextSetSetupScreen
              setNumber={1}
              homeTeam={ONBOARDING_HOME_TEAM}
              awayTeam={ONBOARDING_AWAY_TEAM}
              state={ONBOARDING_SET_START_STATE}
              isPrefilled={false}
            />
          )}

          {slide.kind === 'outro' && (
            <div className="scouting-tutorial__intro-panel">
              <h3>{matchSummary}</h3>
              <p>{t('setSetupStageTitle', { setNumber: 1 })}</p>
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
