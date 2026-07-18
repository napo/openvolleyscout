import { useState } from 'react';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import { getPlayerDisplayName } from '@src/domain/roster/helpers';
import { getRoleLabel, PlayerRole } from '@src/domain/systems';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import type { NextSetPrefillConfig } from '../model';
import { HalfCourtLineup } from './HalfCourtLineup';
import {
  COURT_POSITIONS,
  REQUIRED_TACTICAL_ROLES,
  applyDisplaySidePairing,
  buildStartingLineup,
  createEmptySetStartSetupState,
  createSuggestedTeamSetSetup,
  createTeamSetSetupFromStartingLineup,
  getDuplicateTacticalRoles,
  getEligibleLiberoPlayerIds,
  getSetterCourtPosition,
  isTacticalRoleUsedByOtherPosition,
  rotateTeamSetSetupClockwise,
  syncTeamSetSetupLiberos,
  validateSetStartSetup,
  type CourtDisplaySide,
  type SetStartSetupState,
  type TacticalRoleSelection,
  type TeamSetSetupState,
} from '../model/set-start';

interface SetStartFlowProps {
  matchSummary: string;
  setNumber: number;
  homeTeam: Team;
  awayTeam: Team;
  initialSetup?: NextSetPrefillConfig | null;
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

type SetStartStep = 'home' | 'away' | 'serving' | 'confirm';

function getPlayerLabel(team: Team, playerId: string) {
  const player = team.players.find((item) => item.id === playerId);
  if (!player) {
    return '';
  }

  return `#${player.jerseyNumber} ${getPlayerDisplayName(player)}`;
}

function getPlayerShortLabel(team: Team, playerId: string) {
  const player = team.players.find((item) => item.id === playerId);
  if (!player) {
    return '';
  }

  return getPlayerDisplayName(player);
}

function getPlayerById(team: Team, playerId: string) {
  return team.players.find((player) => player.id === playerId) ?? null;
}

function getPositionLabel(t: (key: TranslationKey, values?: Record<string, string | number>) => string, position: CourtPosition) {
  return t('setSetupPositionLabel', { position });
}

function getDisplaySideLabel(
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
  side: CourtDisplaySide,
) {
  return side === 'left' ? t('setSetupDisplaySideLeft') : t('setSetupDisplaySideRight');
}

function assignTacticalRole(
  teamState: TeamSetSetupState,
  position: CourtPosition,
  tacticalRole: TacticalRoleSelection,
): TeamSetSetupState {
  const nextTacticalRoles = { ...teamState.tacticalRoles };

  if (tacticalRole === PlayerRole.SETTER) {
    // Choosing the setter re-proposes the full rotation order (P, S1, C2, O, S2, C1)
    // starting from the setter's position; this is the only action that reshuffles roles.
    const startIndex = COURT_POSITIONS.indexOf(position);

    COURT_POSITIONS.forEach((courtPosition, offset) => {
      const sequenceIndex = (offset - startIndex + COURT_POSITIONS.length) % COURT_POSITIONS.length;
      nextTacticalRoles[courtPosition] = REQUIRED_TACTICAL_ROLES[sequenceIndex] ?? '';
    });
  } else {
    if (tacticalRole) {
      const duplicatePosition = COURT_POSITIONS.find((courtPosition) => (
        courtPosition !== position
        && teamState.slots[courtPosition]
        && teamState.tacticalRoles[courtPosition] === tacticalRole
      ));

      if (duplicatePosition) {
        nextTacticalRoles[duplicatePosition] = teamState.tacticalRoles[position];
      }
    }

    nextTacticalRoles[position] = tacticalRole;
  }

  const selectedPlayerId = teamState.slots[position];
  const setterPosition = COURT_POSITIONS.find((courtPosition) => (
    teamState.slots[courtPosition] && nextTacticalRoles[courtPosition] === PlayerRole.SETTER
  ));

  return {
    ...teamState,
    tacticalRoles: nextTacticalRoles,
    setterPlayerId: tacticalRole === PlayerRole.SETTER && selectedPlayerId
      ? selectedPlayerId
      : setterPosition
        ? teamState.slots[setterPosition]
        : '',
  };
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

export function TeamSetupScreen({
  team,
  teamSide,
  state,
  issues,
  notice,
  selectedPosition,
  onSelectedPositionChange,
  onSlotChange,
  onTacticalRoleChange,
  onSetterChange,
  onLiberoChange,
  onLiberoAutoMiddleReplacementChange,
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
  onTacticalRoleChange: (position: CourtPosition, tacticalRole: TacticalRoleSelection) => void;
  onSetterChange: (playerId: string) => void;
  onLiberoChange: (index: 0 | 1, playerId: string) => void;
  onLiberoAutoMiddleReplacementChange: (enabled: boolean) => void;
  onDisplaySideChange: (side: CourtDisplaySide) => void;
  onRotateClockwise: () => void;
  onAutoFill: () => void;
}) {
  const { t, locale } = useTranslation();
  const setterPosition = getSetterCourtPosition(state);
  const duplicateTacticalRoles = getDuplicateTacticalRoles(state);
  const lineupPlayerIds = new Set(COURT_POSITIONS.map((position) => state.slots[position]).filter(Boolean));
  const eligibleLiberoPlayerIds = getEligibleLiberoPlayerIds(team).filter((playerId) => !lineupPlayerIds.has(playerId));
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
                      <span role="columnheader">{t('tacticalRole')}</span>
                      <span role="columnheader">{t('setSetupLineupSetterColumn')}</span>
                    </div>

                    {COURT_POSITIONS.map((position) => {
                      const playerId = state.slots[position];
                      const tacticalRole = state.tacticalRoles[position];
                      const hasInvalidTacticalRole = Boolean(playerId) && (
                        !tacticalRole
                        || duplicateTacticalRoles.has(tacticalRole)
                      );

                      return (
                        <div
                          key={position}
                          className={`set-start-lineup-row ${selectedPosition === position ? 'is-selected' : ''}${
                            hasInvalidTacticalRole ? ' has-role-error' : ''
                          }`}
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
                            {team.players.filter((player) => !player.isLibero).map((player) => (
                              <option key={`${position}-${player.id}`} value={player.id}>
                                {getPlayerLabel(team, player.id)}
                              </option>
                            ))}
                          </select>
                          <select
                            className={`set-start-select set-start-role-select${hasInvalidTacticalRole ? ' is-invalid' : ''}`}
                            value={tacticalRole}
                            disabled={!playerId}
                            onChange={(event) => onTacticalRoleChange(position, event.target.value as TacticalRoleSelection)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`${t('tacticalRole')} ${getPositionLabel(t, position)}`}
                          >
                            <option value="">{t('selectTacticalRole')}</option>
                            {REQUIRED_TACTICAL_ROLES.map((role) => (
                              <option
                                key={role}
                                value={role}
                                disabled={isTacticalRoleUsedByOtherPosition(state, role, position)}
                              >
                                {getRoleLabel(role, locale)}
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

                <section className="set-start-libero-config" aria-label={t('selectLiberos')}>
                  <div className="set-start-libero-config__header">
                    <h4 className="set-start-libero-config__title">{t('selectLiberos')}</h4>
                    <p className="set-start-hint">{t('setSetupLiberoEligibilityHint')}</p>
                  </div>

                  {eligibleLiberoPlayerIds.length > 0 ? (
                    <div className="set-start-libero-config__grid">
                      <label className="set-start-field">
                        <span className="set-start-field__label">{t('libero')}</span>
                        <select
                          className="set-start-select"
                          value={state.liberoPlayerIds[0] ?? ''}
                          onChange={(event) => onLiberoChange(0, event.target.value)}
                        >
                          <option value="">{t('setSetupSelectPlayer')}</option>
                          {eligibleLiberoPlayerIds.map((playerId) => (
                            <option key={`libero-1-${playerId}`} value={playerId}>
                              {getPlayerLabel(team, playerId)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="set-start-field">
                        <span className="set-start-field__label">{t('secondLibero')}</span>
                        <select
                          className="set-start-select"
                          value={state.liberoPlayerIds[1] ?? ''}
                          onChange={(event) => onLiberoChange(1, event.target.value)}
                        >
                          <option value="">{t('optional')}</option>
                          {eligibleLiberoPlayerIds
                            .filter((playerId) => playerId !== state.liberoPlayerIds[0])
                            .map((playerId) => (
                              <option key={`libero-2-${playerId}`} value={playerId}>
                                {getPlayerLabel(team, playerId)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <p className="set-start-hint">{t('setSetupNoEligibleLiberos')}</p>
                  )}

                  <label className="set-start-checkbox">
                    <input
                      type="checkbox"
                      checked={state.liberoAutoMiddleReplacement}
                      onChange={(event) => onLiberoAutoMiddleReplacementChange(event.target.checked)}
                    />
                    <span>{t('liberoReplacesMiddlesByDefault')}</span>
                  </label>
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

export function ServingTeamScreen({
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
          aria-label={t('invertFields')}
          title={t('invertFields')}
        >
          <span aria-hidden="true">⇄</span>
        </button>
      </div>
    </section>

    <TeamIssues issues={issues} />
  </section>
);}

export function ConfirmNextSetSetupScreen({
  setNumber,
  homeTeam,
  awayTeam,
  state,
  isPrefilled,
}: {
  setNumber: number;
  homeTeam: Team;
  awayTeam: Team;
  state: SetStartSetupState;
  isPrefilled: boolean;
}) {
  const { t, locale } = useTranslation();
  const servingTeamName = state.servingTeam === 'home'
    ? homeTeam.name
    : state.servingTeam === 'away'
      ? awayTeam.name
      : t('notSpecified');

  const renderTeamSummary = (teamSide: TeamSide, team: Team, teamState: TeamSetSetupState) => (
    <article className="set-start-confirm-team" key={teamSide}>
      <header className="set-start-confirm-team__header">
        <div>
          <span className="scouting-config__section-kicker">{t(teamSide === 'home' ? 'home' : 'away')}</span>
          <h3 className="set-start-confirm-team__title">{team.name}</h3>
        </div>
        <span className="set-start-inline-tag">
          {getDisplaySideLabel(t, teamState.displaySide)}
        </span>
      </header>

      <div className="set-start-confirm-lineup" role="table" aria-label={t('selectStartingLineup')}>
        {COURT_POSITIONS.map((position) => {
          const playerId = teamState.slots[position];
          const player = getPlayerById(team, playerId);
          const tacticalRole = teamState.tacticalRoles[position];
          const isSetter = Boolean(playerId) && teamState.setterPlayerId === playerId;

          return (
            <div className="set-start-confirm-lineup__row" role="row" key={`${teamSide}-${position}`}>
              <span className="set-start-confirm-lineup__position" role="cell">
                {getPositionLabel(t, position)}
              </span>
              <span className="set-start-confirm-lineup__player" role="cell">
                {player ? `#${player.jerseyNumber} ${getPlayerShortLabel(team, player.id)}` : t('setSetupEmptySlot')}
              </span>
              <span className="set-start-confirm-lineup__role" role="cell">
                {tacticalRole ? getRoleLabel(tacticalRole, locale) : t('notSpecified')}
              </span>
              {isSetter ? (
                <span className="set-start-inline-tag" role="cell">{t('setSetupSetterBadge')}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="set-start-confirm-libero">
        <span className="set-start-review-item__label">{t('selectLiberos')}</span>
        <strong>
          {teamState.liberoPlayerIds.length > 0
            ? teamState.liberoPlayerIds.map((playerId) => getPlayerLabel(team, playerId)).join(' · ')
            : t('notSpecified')}
        </strong>
        <span className="set-start-inline-tag">
          {teamState.liberoAutoMiddleReplacement ? t('liberoReplacesMiddlesByDefault') : t('manualLiberoReplacement')}
        </span>
      </div>
    </article>
  );

  return (
    <section className="set-start-confirm-screen">
      <div className="set-start-team-screen__header">
        <div className="set-start-team-screen__heading">
          <span className="set-start-team-screen__kicker">{t('setSetupStepReview')}</span>
          <h2 className="set-start-team-screen__title">
            {isPrefilled ? t('confirmNextSetSetup') : t('setSetupReviewStepTitle')}
          </h2>
          {isPrefilled ? (
            <p className="set-start-serving-screen__question">{t('prefilledFromPreviousSet')}</p>
          ) : null}
        </div>
      </div>

      <div className="set-start-confirm-meta">
        <div className="set-start-review-item">
          <span className="set-start-review-item__label">{t('currentSet')}</span>
          <strong>{setNumber}</strong>
        </div>
        <div className="set-start-review-item">
          <span className="set-start-review-item__label">{t('servingTeam')}</span>
          <strong>{servingTeamName}</strong>
        </div>
        <div className="set-start-review-item">
          <span className="set-start-review-item__label">{t('setSetupDisplaySideLabel')}</span>
          <strong>
            {homeTeam.name}: {getDisplaySideLabel(t, state.home.displaySide)} ·{' '}
            {awayTeam.name}: {getDisplaySideLabel(t, state.away.displaySide)}
          </strong>
        </div>
      </div>

      {isPrefilled ? (
        <div className="set-setup-stage__badges set-start-confirm-badges">
          <span>{t('courtSidesInverted')}</span>
          <span>{t('servingTeamInverted')}</span>
        </div>
      ) : null}

      <div className="set-start-confirm-grid">
        {renderTeamSummary('home', homeTeam, state.home)}
        {renderTeamSummary('away', awayTeam, state.away)}
      </div>
    </section>
  );
}

function buildInitialSetupState(
  homeTeam: Team,
  awayTeam: Team,
  initialSetup?: NextSetPrefillConfig | null,
): SetStartSetupState {
  if (initialSetup) {
    return {
      home: syncTeamSetSetupLiberos(
        homeTeam,
        createTeamSetSetupFromStartingLineup(initialSetup.homeStartingLineup),
      ),
      away: syncTeamSetSetupLiberos(
        awayTeam,
        createTeamSetSetupFromStartingLineup(initialSetup.awayStartingLineup),
      ),
      servingTeam: initialSetup.servingTeam,
    };
  }

  const baseState = createEmptySetStartSetupState();

  return {
    ...baseState,
    home: syncTeamSetSetupLiberos(homeTeam, baseState.home),
    away: syncTeamSetSetupLiberos(awayTeam, baseState.away),
  };
}

export function SetStartFlow({
  matchSummary,
  setNumber,
  homeTeam,
  awayTeam,
  initialSetup,
  onBack,
  onSetStarted,
}: SetStartFlowProps) {
  const { t } = useTranslation();
  const [setupState, setSetupState] = useState<SetStartSetupState>(() => (
    buildInitialSetupState(homeTeam, awayTeam, initialSetup)
  ));
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
      const nextTacticalRoles = { ...teamState.tacticalRoles };

      if (playerId) {
        const previousPosition = COURT_POSITIONS.find(
          (courtPosition) => courtPosition !== position && teamState.slots[courtPosition] === playerId,
        );

        if (previousPosition) {
          const movedPlayerRole = teamState.tacticalRoles[previousPosition];
          nextSlots[previousPosition] = '';
          nextTacticalRoles[previousPosition] = teamState.tacticalRoles[position];
          nextTacticalRoles[position] = movedPlayerRole;
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
          tacticalRoles: nextTacticalRoles,
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
      ...assignTacticalRole(
        {
          ...teamState,
          setterPlayerId: playerId,
        },
        COURT_POSITIONS.find((position) => teamState.slots[position] === playerId) ?? 1,
        PlayerRole.SETTER,
      ),
    }));
  };

  const handleTacticalRoleChange = (
    teamSide: TeamSide,
    team: Team,
    position: CourtPosition,
    tacticalRole: TacticalRoleSelection,
  ) => {
    updateTeamState(teamSide, team, (teamState) => assignTacticalRole(teamState, position, tacticalRole));
  };

  const handleLiberoChange = (
    teamSide: TeamSide,
    team: Team,
    index: 0 | 1,
    playerId: string,
  ) => {
    updateTeamState(teamSide, team, (teamState) => {
      const nextLiberoPlayerIds = [...teamState.liberoPlayerIds];

      if (playerId) {
        nextLiberoPlayerIds[index] = playerId;
      } else {
        nextLiberoPlayerIds.splice(index, 1);
      }

      return {
        ...teamState,
        liberoPlayerIds: nextLiberoPlayerIds.filter((id, itemIndex, list) => id && list.indexOf(id) === itemIndex).slice(0, 2),
      };
    });
  };

  const handleLiberoAutoMiddleReplacementChange = (
    teamSide: TeamSide,
    team: Team,
    enabled: boolean,
  ) => {
    updateTeamState(teamSide, team, (teamState) => ({
      ...teamState,
      liberoAutoMiddleReplacement: enabled,
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

    if (currentStep === 'serving') {
      if (validation.generalIssues.length > 0 || !setupState.servingTeam) {
        return;
      }

      setCurrentStep('confirm');
      setShowValidation(false);
      return;
    }

    if (!validation.isValid || !setupState.servingTeam) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSetStarted({
        homeStartingLineup: buildStartingLineup('home', setupState.home, homeTeam),
        awayStartingLineup: buildStartingLineup('away', setupState.away, awayTeam),
        servingTeam: setupState.servingTeam,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentStep === 'confirm') {
      setCurrentStep('serving');
      setShowValidation(false);
      return;
    }

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
            onTacticalRoleChange={(position, tacticalRole) => handleTacticalRoleChange('home', homeTeam, position, tacticalRole)}
            onSetterChange={(playerId) => handleSetterChange('home', homeTeam, playerId)}
            onLiberoChange={(index, playerId) => handleLiberoChange('home', homeTeam, index, playerId)}
            onLiberoAutoMiddleReplacementChange={(enabled) => handleLiberoAutoMiddleReplacementChange('home', homeTeam, enabled)}
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
            onTacticalRoleChange={(position, tacticalRole) => handleTacticalRoleChange('away', awayTeam, position, tacticalRole)}
            onSetterChange={(playerId) => handleSetterChange('away', awayTeam, playerId)}
            onLiberoChange={(index, playerId) => handleLiberoChange('away', awayTeam, index, playerId)}
            onLiberoAutoMiddleReplacementChange={(enabled) => handleLiberoAutoMiddleReplacementChange('away', awayTeam, enabled)}
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

        {currentStep === 'confirm' && (
          <ConfirmNextSetSetupScreen
            setNumber={setNumber}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            state={setupState}
            isPrefilled={Boolean(initialSetup)}
          />
        )}
      </div>

      <div className="set-start-panel__footer">
        <button type="button" className="btn-secondary" onClick={handleBack} disabled={isSubmitting}>
          {t('back')}
        </button>

        <button type="button" className="btn-primary" onClick={() => void handleNext()} disabled={isSubmitting}>
          {isSubmitting ? t('startingSet') : currentStep === 'confirm' ? t('startSet') : t('next')}
        </button>
      </div>
    </div>
  );
}
