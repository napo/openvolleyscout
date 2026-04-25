import { useState } from 'react';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { HalfCourtLineup } from './HalfCourtLineup';
import {
  COURT_POSITIONS,
  applyDisplaySidePairing,
  buildStartingLineup,
  createEmptySetStartSetupState,
  createSuggestedTeamSetSetup,
  getSetterCourtPosition,
  rotateTeamSetSetupClockwise,
  syncTeamSetSetupLiberos,
  validateSetStartSetup,
  type CourtDisplaySide,
  type SetStartSetupState,
  type TeamSetSetupState,
} from '../model/set-start';

interface SetStartFlowProps {
  matchSummary: string;
  homeTeam: Team;
  awayTeam: Team;
  onBack: () => void;
  onSetStarted: (input: {
    homeStartingLineup: ReturnType<typeof buildStartingLineup>;
    awayStartingLineup: ReturnType<typeof buildStartingLineup>;
    servingTeam: TeamSide;
  }) => void | Promise<void>;
}

type TeamNotice = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

type SetStartStep = 'home' | 'away' | 'serving';

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
  selectedPosition,
  onSelectedPositionChange,
  onSlotChange,
  onSetterChange,
  onDisplaySideChange,
  onRotateClockwise,
  onAutoFill,
}: {
  team: Team;
  teamSide: TeamSide;
  state: TeamSetSetupState;
  issues: TranslationKey[];
  notice?: TeamNotice;
  selectedPosition: CourtPosition;
  onSelectedPositionChange: (position: CourtPosition) => void;
  onSlotChange: (position: CourtPosition, playerId: string) => void;
  onSetterChange: (playerId: string) => void;
  onDisplaySideChange: (side: CourtDisplaySide) => void;
  onRotateClockwise: () => void;
  onAutoFill: () => void;
}) {
  const { t } = useTranslation();
  const setterPosition = getSetterCourtPosition(state);
  const halfCourtPlayers = COURT_POSITIONS.map((position) => {
    const player = getPlayerById(team, state.slots[position]);

    return {
      position,
      label: getPositionLabel(t, position),
      playerName: player ? getPlayerShortLabel(team, player.id) : undefined,
      jerseyNumber: player?.jerseyNumber,
      isSetter: state.setterPlayerId === player?.id,
      isSelected: position === selectedPosition,
    };
  });

  return (
    <div className="set-start-team-screen">
      <section className="set-start-team-screen__main">
        <div className="set-start-team-screen__header">
          <div className="set-start-team-screen__heading">
            <span className="set-start-team-screen__kicker">{t(teamSide === 'home' ? 'setSetupStepHome' : 'setSetupStepAway')}</span>
            <h2 className="set-start-team-screen__title">{team.name}</h2>
          </div>
        </div>

        {notice && (
          <p className="set-start-notice" role="status">
            {t(notice.key, notice.values)}
          </p>
        )}

        <div className="set-start-team-screen__layout-scroll">
          <div className="set-start-team-screen__layout">
            <section className="set-start-side-panel set-start-side-panel--text">
              <div className="set-start-side-panel__header">
                <h3 className="set-start-side-panel__title">{t('selectStartingLineup')}</h3>
                <button type="button" className="btn-secondary btn-small" onClick={onAutoFill}>
                  {t('setSetupAutoFill')}
                </button>
              </div>

              <div className="set-start-side-panel__body">
                <section className="set-start-card set-start-card--compact">
                  <div className="set-start-lineup-table" role="table" aria-label={t('selectStartingLineup')}>
                    <div className="set-start-lineup-table__header" role="row">
                      <span role="columnheader">{t('setSetupLineupPositionColumn')}</span>
                      <span role="columnheader">{t('setSetupLineupPlayerColumn')}</span>
                      <span role="columnheader">{t('setSetupLineupSetterColumn')}</span>
                    </div>

                    {COURT_POSITIONS.map((position) => {
                      const playerId = state.slots[position];

                      return (
                        <div
                          key={position}
                          className={`set-start-lineup-row ${selectedPosition === position ? 'is-selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectedPositionChange(position)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelectedPositionChange(position);
                            }
                          }}
                        >
                          <span className="set-start-lineup-row__position">{getPositionLabel(t, position)}</span>
                          <select
                            className="set-start-select"
                            value={playerId}
                            onChange={(event) => onSlotChange(position, event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <option value="">{t('setSetupSelectPlayer')}</option>
                            {team.players.map((player) => (
                              <option key={`${position}-${player.id}`} value={player.id}>
                                {getPlayerLabel(team, player.id)}
                              </option>
                            ))}
                          </select>
                          <label className="set-start-lineup-row__setter" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="radio"
                              name={`setter-${teamSide}`}
                              checked={state.setterPlayerId === playerId && Boolean(playerId)}
                              disabled={!playerId}
                              onChange={() => onSetterChange(playerId)}
                            />
                            <span>{t('setSetupLineupSetterColumn')}</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </section>

            <section className="set-start-side-panel set-start-side-panel--court">
              <div className="set-start-side-panel__header">
                <h3 className="set-start-side-panel__title">{team.name}</h3>
              </div>

              <div className="set-start-side-panel__body">
                <section className="set-start-court-shell">
                  <div className="set-start-court-shell__toolbar">
                    <div className="set-start-side-selector">
                      <span className="set-start-side-selector__label">{t('setSetupDisplaySideLabel')}</span>
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

                    <button
                      type="button"
                      className="set-start-rotate-button"
                      onClick={onRotateClockwise}
                      aria-label={t('setSetupRotateClockwise')}
                      title={t('setSetupRotateClockwise')}
                    >
                      <span aria-hidden="true">↻</span>
                    </button>
                  </div>

                  <HalfCourtLineup
                    side={state.displaySide}
                    players={halfCourtPlayers}
                    selectedPosition={selectedPosition}
                    onPositionSelect={onSelectedPositionChange}
                  />

                  <div className="set-start-setter-summary">
                    <div className="set-start-setter-summary__item">
                      <span className="set-start-setter-summary__label">{t('setSetupSetterPreviewLabel')}</span>
                      <strong className="set-start-setter-callout">
                        {setterPosition ? t('setSetupSetterCode', { position: setterPosition }) : t('notSpecified')}
                      </strong>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </div>

        <TeamIssues issues={issues} />
      </section>
    </div>
  );
}

function ServingTeamScreen({
  matchSummary,
  homeTeamName,
  awayTeamName,
  servingTeam,
  homeDisplaySide,
  awayDisplaySide,
  issues,
  onServingTeamChange,
  onInvertFields,
}: {
  matchSummary: string;
  homeTeamName: string;
  awayTeamName: string;
  servingTeam: TeamSide | null;
  homeDisplaySide: CourtDisplaySide;
  awayDisplaySide: CourtDisplaySide;
  issues: TranslationKey[];
  onServingTeamChange: (teamSide: TeamSide) => void;
  onInvertFields: () => void;
}) {
  const { t } = useTranslation();
  const servingOptions = [
    {
      teamSide: 'home' as TeamSide,
      side: homeDisplaySide,
      meta: t('home'),
      name: homeTeamName,
    },
    {
      teamSide: 'away' as TeamSide,
      side: awayDisplaySide,
      meta: t('away'),
      name: awayTeamName,
    },
  ].sort((a, b) => {
    if (a.side === b.side) return 0;
    return a.side === 'left' ? -1 : 1;
  });


return (
  <section className="set-start-serving-screen">
    <p className="scouting-screen__pre-match-summary set-start-serving-screen__summary">
      <span className="scouting-screen__pre-match-summary-label">{t('match')}:</span>{' '}
      {matchSummary}
    </p>

    <div className="set-start-team-screen__header set-start-serving-screen__header">
      <div className="set-start-team-screen__heading">
        <span className="set-start-team-screen__kicker">{t('setSetupStepServing')}</span>
        <h2 className="set-start-team-screen__title">{t('selectServingTeam')}</h2>
        <p className="set-start-serving-screen__question">{t('setSetupServingQuestion')}</p>
      </div>
    </div>

    <section className="set-start-card set-start-card--compact set-start-serving-card">
      <div
        className="set-start-serving-options"
        role="radiogroup"
        aria-label={t('selectServingTeam')}
      >
        {servingOptions.map((option) => (
          <button
            key={option.teamSide}
            type="button"
            className={`set-start-serving-option ${
              servingTeam === option.teamSide ? 'is-active' : ''
            }`}
            onClick={() => onServingTeamChange(option.teamSide)}
            aria-pressed={servingTeam === option.teamSide}
          >
            <small className="set-start-serving-option__meta">
              {option.meta} ·{' '}
              {option.side === 'left'
                ? t('setSetupDisplaySideLeft')
                : t('setSetupDisplaySideRight')}
            </small>
            <span className="set-start-serving-option__name">{option.name}</span>
          </button>
        ))}
      </div>

      <div className="set-start-serving-actions">
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={onInvertFields}
        >
          <span aria-hidden="true">⇄</span> {t('invertFields')}
        </button>
      </div>
    </section>

    <TeamIssues issues={issues} />
  </section>
);}

function buildInitialSetupState(homeTeam: Team, awayTeam: Team): SetStartSetupState {
  const baseState = createEmptySetStartSetupState();

  return {
    ...baseState,
    home: syncTeamSetSetupLiberos(homeTeam, baseState.home),
    away: syncTeamSetSetupLiberos(awayTeam, baseState.away),
  };
}

export function SetStartFlow({ matchSummary, homeTeam, awayTeam, onBack, onSetStarted }: SetStartFlowProps) {
  const { t } = useTranslation();
  const [setupState, setSetupState] = useState<SetStartSetupState>(() => buildInitialSetupState(homeTeam, awayTeam));
  const [currentStep, setCurrentStep] = useState<SetStartStep>('home');
  const [showValidation, setShowValidation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamNotices, setTeamNotices] = useState<Partial<Record<TeamSide, TeamNotice>>>({});
  const [selectedPositions, setSelectedPositions] = useState<Record<TeamSide, CourtPosition>>({
    home: 1,
    away: 1,
  });
  const validation = validateSetStartSetup(setupState, { home: homeTeam, away: awayTeam });

  const updateTeamState = (
    teamSide: TeamSide,
    team: Team,
    updater: (teamState: TeamSetSetupState) => TeamSetSetupState,
  ) => {
    setSetupState((current) => ({
      ...current,
      [teamSide]: syncTeamSetSetupLiberos(team, updater(current[teamSide])),
    }));
  };

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

      return {
        ...current,
        [teamSide]: syncTeamSetSetupLiberos(team, {
          ...teamState,
          slots: nextSlots,
          setterPlayerId: nextSetterPlayerId,
        }),
      };
    });

    setTeamNotices((current) => ({
      ...current,
      [teamSide]: nextNotice,
    }));
  };

  const handleSetterChange = (teamSide: TeamSide, team: Team, playerId: string) => {
    updateTeamState(teamSide, team, (teamState) => ({
      ...teamState,
      setterPlayerId: playerId,
    }));
  };

  const handleDisplaySideChange = (teamSide: TeamSide, displaySide: CourtDisplaySide) => {
    setSetupState((current) => {
      const pairedState = applyDisplaySidePairing(current, teamSide, displaySide);

      return {
        ...pairedState,
        home: syncTeamSetSetupLiberos(homeTeam, pairedState.home),
        away: syncTeamSetSetupLiberos(awayTeam, pairedState.away),
      };
    });
  };

  const handleServingTeamChange = (teamSide: TeamSide) => {
    setSetupState((current) => ({
      ...current,
      servingTeam: teamSide,
    }));
  };

  const handleInvertFields = () => {
    setSetupState((current) => ({
      ...current,
      home: syncTeamSetSetupLiberos(homeTeam, {
        ...current.home,
        displaySide: current.away.displaySide,
      }),
      away: syncTeamSetSetupLiberos(awayTeam, {
        ...current.away,
        displaySide: current.home.displaySide,
      }),
    }));
  };

  

  const handleAutoFill = (teamSide: TeamSide, team: Team) => {
    updateTeamState(teamSide, team, (teamState) => ({
      ...createSuggestedTeamSetSetup(team),
      displaySide: teamState.displaySide,
    }));
    setTeamNotices((current) => ({
      ...current,
      [teamSide]: undefined,
    }));
  };

  const handleRotateClockwise = (teamSide: TeamSide, team: Team) => {
    updateTeamState(teamSide, team, (teamState) => rotateTeamSetSetupClockwise(teamState));
    setTeamNotices((current) => ({
      ...current,
      [teamSide]: {
        key: 'setSetupRotationApplied',
      },
    }));
  };

  const handleNext = async () => {
    setShowValidation(true);

    if (currentStep === 'home') {
      if (validation.homeIssues.length > 0) {
        return;
      }

      setCurrentStep('away');
      setShowValidation(false);
      return;
    }

    if (currentStep === 'away') {
      if (validation.awayIssues.length > 0) {
        return;
      }

      setCurrentStep('serving');
      setShowValidation(false);
      return;
    }

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

  const handleBack = () => {
    if (currentStep === 'serving') {
      setCurrentStep('away');
      setShowValidation(false);
      return;
    }

    if (currentStep === 'away') {
      setCurrentStep('home');
      setShowValidation(false);
      return;
    }

    onBack();
  };

  return (
    <div className="set-start-panel">
      <div className="set-start-panel__stage">
        {currentStep === 'home' && (
          <TeamSetupScreen
            team={homeTeam}
            teamSide="home"
            state={setupState.home}
            issues={showValidation ? validation.homeIssues : []}
            notice={teamNotices.home}
            selectedPosition={selectedPositions.home}
            onSelectedPositionChange={(position) => setSelectedPositions((current) => ({ ...current, home: position }))}
            onSlotChange={(position, playerId) => handleSlotChange('home', homeTeam, position, playerId)}
            onSetterChange={(playerId) => handleSetterChange('home', homeTeam, playerId)}
            onDisplaySideChange={(side) => handleDisplaySideChange('home', side)}
            onRotateClockwise={() => handleRotateClockwise('home', homeTeam)}
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
            selectedPosition={selectedPositions.away}
            onSelectedPositionChange={(position) => setSelectedPositions((current) => ({ ...current, away: position }))}
            onSlotChange={(position, playerId) => handleSlotChange('away', awayTeam, position, playerId)}
            onSetterChange={(playerId) => handleSetterChange('away', awayTeam, playerId)}
            onDisplaySideChange={(side) => handleDisplaySideChange('away', side)}
            onRotateClockwise={() => handleRotateClockwise('away', awayTeam)}
            onAutoFill={() => handleAutoFill('away', awayTeam)}
          />
        )}

        {currentStep === 'serving' && (
          <ServingTeamScreen
            matchSummary={matchSummary}
            homeTeamName={homeTeam.name}
            awayTeamName={awayTeam.name}
            servingTeam={setupState.servingTeam}
            homeDisplaySide={setupState.home.displaySide}
            awayDisplaySide={setupState.away.displaySide}
            issues={showValidation ? validation.generalIssues : []}
            onServingTeamChange={handleServingTeamChange}
            onInvertFields={handleInvertFields}
          />
        )}
      </div>

      <div className="set-start-panel__footer">
        <button type="button" className="btn-secondary" onClick={handleBack} disabled={isSubmitting}>
          {t('back')}
        </button>

        <button type="button" className="btn-primary" onClick={() => void handleNext()} disabled={isSubmitting}>
          {isSubmitting ? t('startingSet') : currentStep === 'serving' ? t('startSet') : t('next')}
        </button>
      </div>
    </div>
  );
}
