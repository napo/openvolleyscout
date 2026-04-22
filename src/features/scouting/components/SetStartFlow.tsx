import { useState } from 'react';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { HalfCourtLineup } from './HalfCourtLineup';
import {
  COURT_POSITIONS,
  buildStartingLineup,
  createEmptySetStartSetupState,
  createSuggestedTeamSetSetup,
  getEligibleLiberoPlayerIds,
  getSelectedLineupPlayerIds,
  getSetterCourtPosition,
  validateSetStartSetup,
  type CourtDisplaySide,
  type SetStartSetupState,
  type TeamSetSetupState,
} from '../model/set-start';

interface SetStartFlowProps {
  homeTeam: Team;
  awayTeam: Team;
  setNumber: number;
  onSetStarted: (input: {
    homeStartingLineup: ReturnType<typeof buildStartingLineup>;
    awayStartingLineup: ReturnType<typeof buildStartingLineup>;
    servingTeam: TeamSide;
  }) => void | Promise<void>;
}

type SetSetupStepId = 'home' | 'away' | 'serving' | 'review';

type TeamNotice = {
  key: TranslationKey;
  values: Record<string, string | number>;
};

const SETUP_STEP_ORDER: SetSetupStepId[] = ['home', 'away', 'serving', 'review'];

function getPlayerLabel(team: Team, playerId: string) {
  const player = team.players.find((item) => item.id === playerId);
  if (!player) {
    return '';
  }

  return `#${player.jerseyNumber} ${player.firstName} ${player.lastName}`;
}

function getPlayerShortLabel(team: Team, playerId: string) {
  const player = team.players.find((item) => item.id === playerId);
  if (!player) {
    return '';
  }

  return `${player.firstName} ${player.lastName}`;
}

function getPlayerById(team: Team, playerId: string) {
  return team.players.find((player) => player.id === playerId) ?? null;
}

function getPositionLabel(t: (key: TranslationKey, values?: Record<string, string | number>) => string, position: CourtPosition) {
  return t('setSetupPositionLabel', { position });
}

function getTeamStepIssues(issues: TranslationKey[]) {
  return issues;
}

function TeamIssues({ issues }: { issues: TranslationKey[] }) {
  const { t } = useTranslation();

  if (issues.length === 0) {
    return null;
  }

  return (
    <ul className="set-start-errors" role="alert">
      {issues.map((issue) => (
        <li key={issue}>{t(issue)}</li>
      ))}
    </ul>
  );
}

function TeamSetupScreen({
  team,
  teamSide,
  state,
  issues,
  notice,
  onSlotChange,
  onSetterChange,
  onLiberoToggle,
  onDisplaySideChange,
  onAutoFill,
}: {
  team: Team;
  teamSide: TeamSide;
  state: TeamSetSetupState;
  issues: TranslationKey[];
  notice?: TeamNotice;
  onSlotChange: (position: CourtPosition, playerId: string) => void;
  onSetterChange: (playerId: string) => void;
  onLiberoToggle: (playerId: string) => void;
  onDisplaySideChange: (side: CourtDisplaySide) => void;
  onAutoFill: () => void;
}) {
  const { t } = useTranslation();
  const lineupPlayerIds = getSelectedLineupPlayerIds(state);
  const lineupPlayers = lineupPlayerIds
    .map((playerId) => getPlayerById(team, playerId))
    .filter((player): player is NonNullable<typeof player> => Boolean(player));
  const eligibleLiberoIds = new Set(getEligibleLiberoPlayerIds(team));
  const selectedLineupIds = new Set(lineupPlayerIds);
  const eligibleLiberos = team.players.filter((player) => eligibleLiberoIds.has(player.id) && !selectedLineupIds.has(player.id));
  const setterPosition = getSetterCourtPosition(state);
  const halfCourtPlayers = COURT_POSITIONS.map((position) => {
    const player = getPlayerById(team, state.slots[position]);

    return {
      position,
      label: getPositionLabel(t, position),
      playerName: player ? getPlayerShortLabel(team, player.id) : undefined,
      jerseyNumber: player?.jerseyNumber,
      isSetter: state.setterPlayerId === player?.id,
    };
  });

  return (
    <div className="set-start-team-screen">
      <section className="set-start-team-screen__main">
        <div className="set-start-team-screen__header">
          <div>
            <span className="set-start-team-screen__kicker">{t(teamSide)}</span>
            <h3 className="set-start-team-screen__title">{team.name}</h3>
            <p className="set-start-team-screen__subtitle">{t('setSetupSingleTeamDescription')}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onAutoFill}>
            {t('setSetupAutoFill')}
          </button>
        </div>

        {notice && (
          <p className="set-start-notice" role="status">
            {t(notice.key, notice.values)}
          </p>
        )}

        <div className="set-start-team-screen__layout">
          <div className="set-start-team-screen__court">
            <div className="set-start-court-panel">
              <div className="set-start-side-selector">
                <div className="set-start-side-selector__copy">
                  <span className="set-start-side-selector__label">{t('setSetupDisplaySideLabel')}</span>
                  <p className="set-start-side-selector__hint">
                    {t('setSetupDisplaySideHint', {
                      side: state.displaySide === 'left' ? t('setSetupDisplaySideLeft') : t('setSetupDisplaySideRight'),
                    })}
                  </p>
                </div>
                <div className="set-start-side-selector__buttons">
                  <button
                    type="button"
                    className={`set-start-side-selector__button ${state.displaySide === 'left' ? 'is-active' : ''}`}
                    onClick={() => onDisplaySideChange('left')}
                  >
                    {t('setSetupDisplaySideLeft')}
                  </button>
                  <button
                    type="button"
                    className={`set-start-side-selector__button ${state.displaySide === 'right' ? 'is-active' : ''}`}
                    onClick={() => onDisplaySideChange('right')}
                  >
                    {t('setSetupDisplaySideRight')}
                  </button>
                </div>
              </div>

              <HalfCourtLineup side={state.displaySide} players={halfCourtPlayers} />

              <div className="set-start-setter-summary">
                <span className="set-start-setter-summary__label">{t('setSetupSetterPreviewLabel')}</span>
                <p className="set-start-setter-callout">
                  {setterPosition
                    ? t('setSetupSetterPattern', {
                        setterCode: t('setSetupSetterCode', { position: setterPosition }),
                        position: setterPosition,
                      })
                    : t('setSetupSetterPatternPending')}
                </p>
              </div>
            </div>
          </div>

          <div className="set-start-team-screen__controls">
            <section className="set-start-card set-start-card--compact">
              <div className="set-start-card__header">
                <div>
                  <h4 className="set-start-card__title">{t('selectStartingLineup')}</h4>
                  <p className="set-start-card__subtitle">{t('setSetupLineupCardDescription')}</p>
                </div>
              </div>

              <div className="set-start-grid">
                {COURT_POSITIONS.map((position) => (
                  <label key={position} className="set-start-field">
                    <span className="set-start-field__label">{getPositionLabel(t, position)}</span>
                    <select
                      className="set-start-select"
                      value={state.slots[position]}
                      onChange={(event) => onSlotChange(position, event.target.value)}
                    >
                      <option value="">{t('setSetupSelectPlayer')}</option>
                      {team.players.map((player) => (
                        <option key={`${position}-${player.id}`} value={player.id}>
                          {getPlayerLabel(team, player.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="set-start-card set-start-card--compact">
              <div className="set-start-card__header">
                <div>
                  <h4 className="set-start-card__title">{t('selectSetter')}</h4>
                  <p className="set-start-card__subtitle">{t('setSetupSetterCardDescription')}</p>
                </div>
              </div>

              <label className="set-start-field">
                <span className="set-start-field__label">{t('selectSetter')}</span>
                <select
                  className="set-start-select"
                  value={state.setterPlayerId}
                  onChange={(event) => onSetterChange(event.target.value)}
                >
                  <option value="">{t('setSetupSelectSetter')}</option>
                  {lineupPlayers.map((player) => (
                    <option key={`setter-${player.id}`} value={player.id}>
                      {getPlayerLabel(team, player.id)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="set-start-card set-start-card--compact">
              <div className="set-start-card__header">
                <div>
                  <h4 className="set-start-card__title">{t('selectLiberos')}</h4>
                  <p className="set-start-card__subtitle">{t('setSetupLiberoCardDescription')}</p>
                </div>
              </div>

              <fieldset className="set-start-fieldset">
                <legend className="set-start-field__label">{t('selectLiberos')}</legend>
                <div className="set-start-checkboxes">
                  {eligibleLiberos.length === 0 ? (
                    <p className="set-start-hint">{t('setSetupNoEligibleLiberos')}</p>
                  ) : (
                    eligibleLiberos.map((player) => {
                      const checked = state.liberoPlayerIds.includes(player.id);
                      const atLimit = !checked && state.liberoPlayerIds.length >= 2;

                      return (
                        <label key={`libero-${player.id}`} className="set-start-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={atLimit}
                            onChange={() => onLiberoToggle(player.id)}
                          />
                          <span>{getPlayerLabel(team, player.id)}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </fieldset>

              <p className="set-start-hint">{t('setSetupLiberoEligibilityHint')}</p>
            </section>
          </div>
        </div>

        <TeamIssues issues={issues} />
      </section>
    </div>
  );
}

function TeamReviewCard({
  team,
  teamSide,
  state,
  servingTeam,
  issues,
}: {
  team: Team;
  teamSide: TeamSide;
  state: TeamSetSetupState;
  servingTeam: TeamSide | null;
  issues: TranslationKey[];
}) {
  const { t } = useTranslation();
  const setterPosition = getSetterCourtPosition(state);

  return (
    <section className="set-start-card">
      <div className="set-start-card__header">
        <div>
          <h3 className="set-start-card__title">
            {team.name} · {t(teamSide)}
          </h3>
          <p className="set-start-card__subtitle">{t('setSetupReviewCardDescription')}</p>
        </div>
      </div>

      <div className="set-start-review-grid">
        {COURT_POSITIONS.map((position) => (
          <div key={position} className="set-start-review-item">
            <span className="set-start-review-item__label">{getPositionLabel(t, position)}</span>
            <strong>{getPlayerLabel(team, state.slots[position]) || t('notSpecified')}</strong>
          </div>
        ))}
      </div>

      <div className="set-start-review-meta">
        <div className="set-start-review-item">
          <span className="set-start-review-item__label">{t('selectSetter')}</span>
          <strong>{state.setterPlayerId ? getPlayerLabel(team, state.setterPlayerId) : t('notSpecified')}</strong>
        </div>
        <div className="set-start-review-item">
          <span className="set-start-review-item__label">{t('selectLiberos')}</span>
          <strong>
            {state.liberoPlayerIds.length > 0
              ? state.liberoPlayerIds.map((playerId) => getPlayerLabel(team, playerId)).join(', ')
              : t('notSpecified')}
          </strong>
        </div>
        <div className="set-start-review-item">
          <span className="set-start-review-item__label">{t('setSetupDisplaySideLabel')}</span>
          <strong>{state.displaySide === 'left' ? t('setSetupDisplaySideLeft') : t('setSetupDisplaySideRight')}</strong>
        </div>
        <div className="set-start-review-item">
          <span className="set-start-review-item__label">{t('setSetupSetterPreviewLabel')}</span>
          <strong>
            {setterPosition
              ? t('setSetupSetterPattern', {
                  setterCode: t('setSetupSetterCode', { position: setterPosition }),
                  position: setterPosition,
                })
              : t('notSpecified')}
          </strong>
        </div>
      </div>

      <p className="set-start-review-serving">
        {servingTeam === teamSide ? t('setSetupServingTeamReview', { team: team.name }) : t('setSetupReceivingTeamReview')}
      </p>

      <TeamIssues issues={issues} />
    </section>
  );
}

export function SetStartFlow({ homeTeam, awayTeam, setNumber, onSetStarted }: SetStartFlowProps) {
  const { t } = useTranslation();
  const [setupState, setSetupState] = useState<SetStartSetupState>(() => createEmptySetStartSetupState());
  const [currentStep, setCurrentStep] = useState<SetSetupStepId>('home');
  const [showValidation, setShowValidation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamNotices, setTeamNotices] = useState<Partial<Record<TeamSide, TeamNotice>>>({});
  const validation = validateSetStartSetup(setupState, { home: homeTeam, away: awayTeam });
  const stepIndex = SETUP_STEP_ORDER.indexOf(currentStep);

  const updateTeamState = (
    teamSide: TeamSide,
    updater: (teamState: TeamSetSetupState) => TeamSetSetupState,
  ) => {
    setSetupState((current) => ({
      ...current,
      [teamSide]: updater(current[teamSide]),
    }));
  };

  const getStepIssues = (step: SetSetupStepId) => {
    switch (step) {
      case 'home':
        return getTeamStepIssues(validation.homeIssues);
      case 'away':
        return getTeamStepIssues(validation.awayIssues);
      case 'serving':
        return validation.generalIssues;
      case 'review':
        return [...validation.homeIssues, ...validation.awayIssues, ...validation.generalIssues];
    }
  };

  const isStepComplete = (step: SetSetupStepId) => getStepIssues(step).length === 0;

  const handleSlotChange = (teamSide: TeamSide, team: Team, position: CourtPosition, playerId: string) => {
    let nextNotice: TeamNotice | undefined;

    setSetupState((current) => {
      const teamState = current[teamSide];
      const nextSlots = { ...teamState.slots };

      if (playerId) {
        const previousPosition = COURT_POSITIONS.find(
          (courtPosition) => courtPosition !== position && teamState.slots[courtPosition] === playerId,
        );

        if (previousPosition) {
          nextSlots[previousPosition] = '';
          nextNotice = {
            key: 'setSetupPlayerMoved',
            values: {
              player: getPlayerLabel(team, playerId),
              fromPosition: getPositionLabel(t, previousPosition),
              toPosition: getPositionLabel(t, position),
            },
          };
        }
      }

      nextSlots[position] = playerId;

      const selectedPlayerIds = new Set(COURT_POSITIONS.map((courtPosition) => nextSlots[courtPosition]).filter(Boolean));
      const nextSetterPlayerId = teamState.setterPlayerId && selectedPlayerIds.has(teamState.setterPlayerId)
        ? teamState.setterPlayerId
        : '';
      const nextLiberoPlayerIds = teamState.liberoPlayerIds.filter((id) => !selectedPlayerIds.has(id));

      if (!nextNotice && playerId && teamState.liberoPlayerIds.includes(playerId)) {
        nextNotice = {
          key: 'setSetupLiberoRemovedFromCourt',
          values: {
            player: getPlayerLabel(team, playerId),
            position: getPositionLabel(t, position),
          },
        };
      }

      return {
        ...current,
        [teamSide]: {
          ...teamState,
          slots: nextSlots,
          setterPlayerId: nextSetterPlayerId,
          liberoPlayerIds: nextLiberoPlayerIds,
        },
      };
    });

    setTeamNotices((current) => ({
      ...current,
      [teamSide]: nextNotice,
    }));
  };

  const handleSetterChange = (teamSide: TeamSide, playerId: string) => {
    updateTeamState(teamSide, (teamState) => ({
      ...teamState,
      setterPlayerId: playerId,
    }));
  };

  const handleLiberoToggle = (teamSide: TeamSide, playerId: string) => {
    updateTeamState(teamSide, (teamState) => ({
      ...teamState,
      liberoPlayerIds: teamState.liberoPlayerIds.includes(playerId)
        ? teamState.liberoPlayerIds.filter((id) => id !== playerId)
        : [...teamState.liberoPlayerIds, playerId].slice(0, 2),
    }));
  };

  const handleDisplaySideChange = (teamSide: TeamSide, displaySide: CourtDisplaySide) => {
    updateTeamState(teamSide, (teamState) => ({
      ...teamState,
      displaySide,
    }));
  };

  const handleServingTeamChange = (teamSide: TeamSide) => {
    setSetupState((current) => ({
      ...current,
      servingTeam: teamSide,
    }));
  };

  const handleAutoFill = (teamSide: TeamSide, team: Team) => {
    updateTeamState(teamSide, (teamState) => ({
      ...createSuggestedTeamSetSetup(team),
      displaySide: teamState.displaySide,
    }));
    setTeamNotices((current) => ({
      ...current,
      [teamSide]: undefined,
    }));
  };

  const handleNextStep = () => {
    setShowValidation(true);

    if (!isStepComplete(currentStep)) {
      return;
    }

    const nextStep = SETUP_STEP_ORDER[stepIndex + 1];
    if (nextStep) {
      setCurrentStep(nextStep);
    }
  };

  const handlePreviousStep = () => {
    const previousStep = SETUP_STEP_ORDER[stepIndex - 1];
    if (previousStep) {
      setCurrentStep(previousStep);
    }
  };

  const handleStartSet = async () => {
    setShowValidation(true);
    if (!validation.isValid || !setupState.servingTeam) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSetStarted({
        homeStartingLineup: buildStartingLineup('home', setupState.home),
        awayStartingLineup: buildStartingLineup('away', setupState.away),
        servingTeam: setupState.servingTeam,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="set-start-panel">
      <div className="set-start-panel__header">
        <div>
          <h2 className="set-start-panel__title">{t('setSetupTitle', { setNumber })}</h2>
          <p className="set-start-panel__subtitle">{t('setSetupDescription')}</p>
        </div>
      </div>

      <nav className="set-start-steps" aria-label={t('setStartFlow')}>
        {SETUP_STEP_ORDER.map((step, index) => {
          const isActive = step === currentStep;
          const isCompleted = isStepComplete(step);
          const isReachable = index <= stepIndex;

          return (
            <button
              key={step}
              type="button"
              className={`set-start-step${isActive ? ' is-active' : ''}${isCompleted ? ' is-complete' : ''}`}
              onClick={() => {
                if (isReachable) {
                  setCurrentStep(step);
                }
              }}
              disabled={!isReachable}
            >
              <span className="set-start-step__index">{index + 1}</span>
              <span className="set-start-step__content">
                <strong>{t(`setSetupStep${step.charAt(0).toUpperCase()}${step.slice(1)}` as TranslationKey)}</strong>
                <small>{t(isCompleted ? 'ready' : 'required')}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="set-start-panel__stage">
        {currentStep === 'home' && (
          <TeamSetupScreen
            team={homeTeam}
            teamSide="home"
            state={setupState.home}
            issues={showValidation ? validation.homeIssues : []}
            notice={teamNotices.home}
            onSlotChange={(position, playerId) => handleSlotChange('home', homeTeam, position, playerId)}
            onSetterChange={(playerId) => handleSetterChange('home', playerId)}
            onLiberoToggle={(playerId) => handleLiberoToggle('home', playerId)}
            onDisplaySideChange={(side) => handleDisplaySideChange('home', side)}
            onAutoFill={() => handleAutoFill('home', homeTeam)}
          />
        )}

        {currentStep === 'away' && (
          <TeamSetupScreen
            team={awayTeam}
            teamSide="away"
            state={setupState.away}
            issues={showValidation ? validation.awayIssues : []}
            notice={teamNotices.away}
            onSlotChange={(position, playerId) => handleSlotChange('away', awayTeam, position, playerId)}
            onSetterChange={(playerId) => handleSetterChange('away', playerId)}
            onLiberoToggle={(playerId) => handleLiberoToggle('away', playerId)}
            onDisplaySideChange={(side) => handleDisplaySideChange('away', side)}
            onAutoFill={() => handleAutoFill('away', awayTeam)}
          />
        )}

        {currentStep === 'serving' && (
          <section className="set-start-card set-start-serving-stage">
            <div className="set-start-card__header">
              <div>
                <h3 className="set-start-card__title">{t('selectServingTeam')}</h3>
                <p className="set-start-card__subtitle">{t('setSetupServingStageDescription')}</p>
              </div>
            </div>

            <div className="set-start-serving-stage__teams">
              <button
                type="button"
                className={`set-start-serving__button ${setupState.servingTeam === 'home' ? 'is-active' : ''}`}
                onClick={() => handleServingTeamChange('home')}
              >
                <span>{homeTeam.name}</span>
                <small>{t('home')}</small>
              </button>
              <button
                type="button"
                className={`set-start-serving__button ${setupState.servingTeam === 'away' ? 'is-active' : ''}`}
                onClick={() => handleServingTeamChange('away')}
              >
                <span>{awayTeam.name}</span>
                <small>{t('away')}</small>
              </button>
            </div>

            {showValidation && <TeamIssues issues={validation.generalIssues} />}
          </section>
        )}

        {currentStep === 'review' && (
          <div className="set-start-review-stage">
            <TeamReviewCard
              team={homeTeam}
              teamSide="home"
              state={setupState.home}
              servingTeam={setupState.servingTeam}
              issues={showValidation ? validation.homeIssues : []}
            />
            <TeamReviewCard
              team={awayTeam}
              teamSide="away"
              state={setupState.away}
              servingTeam={setupState.servingTeam}
              issues={showValidation ? validation.awayIssues : []}
            />
          </div>
        )}
      </div>

      <div className="set-start-panel__footer">
        {stepIndex > 0 && (
          <button type="button" className="btn-secondary" onClick={handlePreviousStep} disabled={isSubmitting}>
            {t('back')}
          </button>
        )}

        {currentStep !== 'review' ? (
          <button type="button" className="btn-primary" onClick={handleNextStep} disabled={isSubmitting}>
            {t('continueSetup')}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={handleStartSet} disabled={isSubmitting}>
            {isSubmitting ? t('startingSet') : t('startSet')}
          </button>
        )}
      </div>
    </div>
  );
}
