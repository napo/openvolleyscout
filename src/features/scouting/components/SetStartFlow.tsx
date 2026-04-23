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
  getEligibleLiberoPlayerIds,
  getSelectedLineupPlayerIds,
  getSetterCourtPosition,
  rotateTeamSetSetupClockwise,
  validateSetStartSetup,
  type CourtDisplaySide,
  type SetStartSetupState,
  type TeamSetSetupState,
} from '../model/set-start';

interface SetStartFlowProps {
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
  otherTeamName,
  state,
  issues,
  notice,
  selectedPosition,
  servingTeam,
  onSelectedPositionChange,
  onSlotChange,
  onSetterChange,
  onLiberoToggle,
  onDisplaySideChange,
  onServingTeamChange,
  onRotateClockwise,
  onAutoFill,
}: {
  team: Team;
  teamSide: TeamSide;
  otherTeamName: string;
  state: TeamSetSetupState;
  issues: TranslationKey[];
  notice?: TeamNotice;
  selectedPosition: CourtPosition;
  servingTeam: TeamSide | null;
  onSelectedPositionChange: (position: CourtPosition) => void;
  onSlotChange: (position: CourtPosition, playerId: string) => void;
  onSetterChange: (playerId: string) => void;
  onLiberoToggle: (playerId: string) => void;
  onDisplaySideChange: (side: CourtDisplaySide) => void;
  onServingTeamChange?: (teamSide: TeamSide) => void;
  onRotateClockwise: () => void;
  onAutoFill: () => void;
}) {
  const { t } = useTranslation();
  const isFinalTeam = teamSide === 'away';
  const lineupPlayerIds = getSelectedLineupPlayerIds(state);
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

            <div className="set-start-side-panel__body set-start-side-panel__body--stack">
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
                          <span>{t('selectSetter')}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="set-start-card set-start-card--compact">
                <div className="set-start-card__header">
                  <div>
                    <h3 className="set-start-card__title">{t('selectLiberos')}</h3>
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

              {isFinalTeam && onServingTeamChange && (
                <section className="set-start-card set-start-card--compact">
                  <div className="set-start-card__header">
                    <div>
                      <h3 className="set-start-card__title">{t('selectServingTeam')}</h3>
                    </div>
                  </div>

                  <div className="set-start-serving-stage__teams">
                    <button
                      type="button"
                      className={`set-start-serving__button ${servingTeam === 'home' ? 'is-active' : ''}`}
                      onClick={() => onServingTeamChange('home')}
                    >
                      <span>{teamSide === 'home' ? team.name : otherTeamName}</span>
                      <small>{t('home')}</small>
                    </button>
                    <button
                      type="button"
                      className={`set-start-serving__button ${servingTeam === 'away' ? 'is-active' : ''}`}
                      onClick={() => onServingTeamChange('away')}
                    >
                      <span>{teamSide === 'away' ? team.name : otherTeamName}</span>
                      <small>{t('away')}</small>
                    </button>
                  </div>
                </section>
              )}
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
                  <span className="set-start-setter-summary__label">{t('setSetupSelectedPositionLabel')}</span>
                  <strong className="set-start-setter-callout">{getPositionLabel(t, selectedPosition)}</strong>
                </div>
                <div className="set-start-setter-summary__item">
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
                <div className="set-start-setter-summary__item">
                  <span className="set-start-setter-summary__label">{t('setSetupSideSyncLabel')}</span>
                  <p className="set-start-setter-callout">
                    {t('setSetupSideSyncHint', {
                      team: otherTeamName,
                      side: state.displaySide === 'left' ? t('setSetupDisplaySideRight') : t('setSetupDisplaySideLeft'),
                    })}
                  </p>
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

export function SetStartFlow({ homeTeam, awayTeam, onBack, onSetStarted }: SetStartFlowProps) {
  const { t } = useTranslation();
  const [setupState, setSetupState] = useState<SetStartSetupState>(() => createEmptySetStartSetupState());
  const [currentTeamSide, setCurrentTeamSide] = useState<TeamSide>('home');
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
    updater: (teamState: TeamSetSetupState) => TeamSetSetupState,
  ) => {
    setSetupState((current) => ({
      ...current,
      [teamSide]: updater(current[teamSide]),
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
    setSetupState((current) => applyDisplaySidePairing(current, teamSide, displaySide));
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

  const handleRotateClockwise = (teamSide: TeamSide) => {
    updateTeamState(teamSide, (teamState) => rotateTeamSetSetupClockwise(teamState));
    setTeamNotices((current) => ({
      ...current,
      [teamSide]: {
        key: 'setSetupRotationApplied',
      },
    }));
  };

  const handleNext = async () => {
    setShowValidation(true);

    if (currentTeamSide === 'home') {
      if (validation.homeIssues.length > 0) {
        return;
      }

      setCurrentTeamSide('away');
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
    if (currentTeamSide === 'away') {
      setCurrentTeamSide('home');
      setShowValidation(false);
      return;
    }

    onBack();
  };

  const currentTeam = currentTeamSide === 'home' ? homeTeam : awayTeam;
  const otherTeamName = currentTeamSide === 'home' ? awayTeam.name : homeTeam.name;
  const currentState = setupState[currentTeamSide];
  const currentIssues = showValidation
    ? currentTeamSide === 'home'
      ? validation.homeIssues
      : [...validation.awayIssues, ...validation.generalIssues]
    : [];

  return (
    <div className="set-start-panel">
      <div className="set-start-panel__stage">
        <TeamSetupScreen
          team={currentTeam}
          teamSide={currentTeamSide}
          otherTeamName={otherTeamName}
          state={currentState}
          issues={currentIssues}
          notice={teamNotices[currentTeamSide]}
          selectedPosition={selectedPositions[currentTeamSide]}
          servingTeam={setupState.servingTeam}
          onSelectedPositionChange={(position) => setSelectedPositions((current) => ({ ...current, [currentTeamSide]: position }))}
          onSlotChange={(position, playerId) => handleSlotChange(currentTeamSide, currentTeam, position, playerId)}
          onSetterChange={(playerId) => handleSetterChange(currentTeamSide, playerId)}
          onLiberoToggle={(playerId) => handleLiberoToggle(currentTeamSide, playerId)}
          onDisplaySideChange={(side) => handleDisplaySideChange(currentTeamSide, side)}
          onServingTeamChange={currentTeamSide === 'away' ? handleServingTeamChange : undefined}
          onRotateClockwise={() => handleRotateClockwise(currentTeamSide)}
          onAutoFill={() => handleAutoFill(currentTeamSide, currentTeam)}
        />
      </div>

      <div className="set-start-panel__footer">
        <button type="button" className="btn-secondary" onClick={handleBack} disabled={isSubmitting}>
          {t('back')}
        </button>

        <button type="button" className="btn-primary" onClick={() => void handleNext()} disabled={isSubmitting}>
          {isSubmitting ? t('startingSet') : t('next')}
        </button>
      </div>
    </div>
  );
}
