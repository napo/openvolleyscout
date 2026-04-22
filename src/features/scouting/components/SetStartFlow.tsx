import { useMemo, useState } from 'react';
import type { TeamSide, CourtPosition } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import {
  COURT_POSITIONS,
  buildStartingLineup,
  createEmptySetStartSetupState,
  createSuggestedTeamSetSetup,
  validateSetStartSetup,
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

function getPlayerLabel(team: Team, playerId: string) {
  const player = team.players.find((item) => item.id === playerId);
  if (!player) {
    return '';
  }

  return `#${player.jerseyNumber} ${player.firstName} ${player.lastName}`;
}

function TeamSetSetupCard({
  team,
  teamSide,
  state,
  issues,
  onSlotChange,
  onSetterChange,
  onLiberoToggle,
  onAutoFill,
}: {
  team: Team;
  teamSide: TeamSide;
  state: TeamSetSetupState;
  issues: TranslationKey[];
  onSlotChange: (position: CourtPosition, playerId: string) => void;
  onSetterChange: (playerId: string) => void;
  onLiberoToggle: (playerId: string) => void;
  onAutoFill: () => void;
}) {
  const { t } = useTranslation();
  const selectedLineupPlayerIds = useMemo(
    () => COURT_POSITIONS.map((position) => state.slots[position]).filter(Boolean),
    [state.slots],
  );
  const lineupPlayers = team.players.filter((player) => selectedLineupPlayerIds.includes(player.id));

  return (
    <section className="set-start-card">
      <div className="set-start-card__header">
        <div>
          <h3 className="set-start-card__title">
            {team.name} · {t(teamSide)}
          </h3>
          <p className="set-start-card__subtitle">
            {t('setSetupTeamInstructions')}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onAutoFill}>
          {t('setSetupAutoFill')}
        </button>
      </div>

      <div className="set-start-grid">
        {COURT_POSITIONS.map((position) => (
          <label key={position} className="set-start-field">
            <span className="set-start-field__label">{t('setSetupCourtPosition', { position })}</span>
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

      <div className="set-start-meta">
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

        <fieldset className="set-start-fieldset">
          <legend className="set-start-field__label">{t('selectLiberos')}</legend>
          <div className="set-start-checkboxes">
            {lineupPlayers.length === 0 ? (
              <p className="set-start-hint">{t('setSetupSelectLineupFirst')}</p>
            ) : (
              lineupPlayers.map((player) => {
                const checked = state.liberoPlayerIds.includes(player.id);
                const disabled = !checked && state.liberoPlayerIds.length >= 2;

                return (
                  <label key={`libero-${player.id}`} className="set-start-checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onLiberoToggle(player.id)}
                    />
                    <span>{getPlayerLabel(team, player.id)}</span>
                  </label>
                );
              })
            )}
          </div>
        </fieldset>
      </div>

      {issues.length > 0 && (
          <ul className="set-start-errors" role="alert">
            {issues.map((issue) => (
            <li key={`${teamSide}-${issue}`}>{t(issue)}</li>
            ))}
          </ul>
      )}
    </section>
  );
}

export function SetStartFlow({ homeTeam, awayTeam, setNumber, onSetStarted }: SetStartFlowProps) {
  const { t } = useTranslation();
  const [setupState, setSetupState] = useState<SetStartSetupState>(() => createEmptySetStartSetupState());
  const [showValidation, setShowValidation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const validation = validateSetStartSetup(setupState);

  const updateTeamState = (
    teamSide: TeamSide,
    updater: (teamState: TeamSetSetupState) => TeamSetSetupState,
  ) => {
    setSetupState((current) => ({
      ...current,
      [teamSide]: updater(current[teamSide]),
    }));
  };

  const handleSlotChange = (teamSide: TeamSide, position: CourtPosition, playerId: string) => {
    updateTeamState(teamSide, (teamState) => {
      const liberoPlayerIds = teamState.liberoPlayerIds.filter((id) => id !== teamState.slots[position] || id === playerId);
      const setterPlayerId = teamState.setterPlayerId === teamState.slots[position] && teamState.slots[position] !== playerId
        ? ''
        : teamState.setterPlayerId;

      return {
        ...teamState,
        slots: {
          ...teamState.slots,
          [position]: playerId,
        },
        setterPlayerId,
        liberoPlayerIds,
      };
    });
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

  const handleServingTeamChange = (teamSide: TeamSide) => {
    setSetupState((current) => ({
      ...current,
      servingTeam: teamSide,
    }));
  };

  const handleAutoFill = (teamSide: TeamSide, team: Team) => {
    updateTeamState(teamSide, () => createSuggestedTeamSetSetup(team));
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

      <div className="set-start-panel__body">
        <TeamSetSetupCard
          team={homeTeam}
          teamSide="home"
          state={setupState.home}
          issues={showValidation ? validation.homeIssues : []}
          onSlotChange={(position, playerId) => handleSlotChange('home', position, playerId)}
          onSetterChange={(playerId) => handleSetterChange('home', playerId)}
          onLiberoToggle={(playerId) => handleLiberoToggle('home', playerId)}
          onAutoFill={() => handleAutoFill('home', homeTeam)}
        />

        <TeamSetSetupCard
          team={awayTeam}
          teamSide="away"
          state={setupState.away}
          issues={showValidation ? validation.awayIssues : []}
          onSlotChange={(position, playerId) => handleSlotChange('away', position, playerId)}
          onSetterChange={(playerId) => handleSetterChange('away', playerId)}
          onLiberoToggle={(playerId) => handleLiberoToggle('away', playerId)}
          onAutoFill={() => handleAutoFill('away', awayTeam)}
        />
      </div>

      <section className="set-start-card">
        <div className="set-start-card__header">
          <div>
            <h3 className="set-start-card__title">{t('selectServingTeam')}</h3>
            <p className="set-start-card__subtitle">{t('setSetupServingTeamDescription')}</p>
          </div>
        </div>

        <div className="set-start-serving">
          <button
            type="button"
            className={`set-start-serving__button ${setupState.servingTeam === 'home' ? 'is-active' : ''}`}
            onClick={() => handleServingTeamChange('home')}
          >
            {homeTeam.name}
          </button>
          <button
            type="button"
            className={`set-start-serving__button ${setupState.servingTeam === 'away' ? 'is-active' : ''}`}
            onClick={() => handleServingTeamChange('away')}
          >
            {awayTeam.name}
          </button>
        </div>

        {showValidation && validation.generalIssues.length > 0 && (
          <ul className="set-start-errors" role="alert">
            {validation.generalIssues.map((issue) => (
              <li key={issue}>{t(issue)}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="set-start-panel__footer">
        <button type="button" className="btn-primary" onClick={handleStartSet} disabled={isSubmitting}>
          {isSubmitting ? t('startingSet') : t('startSet')}
        </button>
      </div>
    </div>
  );
}
