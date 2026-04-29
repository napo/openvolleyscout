import type { MouseEvent } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchRosterSelectionPlayer } from '@src/domain/match/types';
import type { ArchivedTeam } from '@src/domain/team/types';
import { TeamNameInput } from './TeamNameInput';
import { useSequentialEnterNavigation } from '@src/lib/hooks/useSequentialEnterNavigation';

interface MatchTeamSelectionProps {
  teamType: 'home' | 'away';
  teamName: string;
  archivedTeam: ArchivedTeam | null;
  players: MatchRosterSelectionPlayer[];
  fieldErrors?: Record<string, string | undefined>;
  allPlayersSelected: boolean;
  onTeamNameChange: (name: string) => void;
  onSelectTeam: (team: ArchivedTeam) => void;
  onCreateNewTeam: () => void;
  onAddPlayer: () => void;
  onToggleSelectAll: () => void;
  onPlayerFieldChange: (
    index: number,
    field: 'firstName' | 'lastName' | 'jerseyNumber' | 'isLibero' | 'isCaptain',
    value: string | boolean,
  ) => void;
  onPlayerToggleSelected: (playerId: string) => void;
  onPlayerToggleLibero: (playerId: string) => void;
  onPlayerToggleCaptain: (playerId: string) => void;
  onPlayerRemove: (index: number) => void;
  rosterError?: string;
}

export function MatchTeamSelection({
  teamType,
  teamName,
  archivedTeam,
  players,
  fieldErrors = {},
  allPlayersSelected,
  onTeamNameChange,
  onSelectTeam,
  onCreateNewTeam,
  onAddPlayer,
  onToggleSelectAll,
  onPlayerFieldChange,
  onPlayerToggleSelected,
  onPlayerToggleLibero,
  onPlayerToggleCaptain,
  onPlayerRemove,
  rosterError,
}: MatchTeamSelectionProps) {
  const { t } = useTranslation();
  const handleSequentialEnter = useSequentialEnterNavigation();
  const teamLabel = teamType === 'home' ? t('homeTeam') : t('awayTeam');
  const hasArchivedRoster = archivedTeam?.rosterIds.length ? true : false;
  const selectedPlayersCount = players.filter((player) => player.isSelectedForMatch).length;
  const rosterStatusTone = rosterError ? 'is-warning' : 'is-ready';
  const prefix = teamType === 'home' ? 'homeTeam' : 'awayTeam';
  const teamNameErrorKey = teamType === 'home' ? 'homeTeamName' : 'awayTeamName';
  const teamNameError = fieldErrors[teamNameErrorKey];

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, playerId: string) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, label')) {
      return;
    }

    onPlayerToggleSelected(playerId);
  };

  const getPlayerError = (index: number, field: 'jersey' | 'firstName' | 'lastName') =>
    fieldErrors[`${prefix}_player_${index}_${field}`];

  const isArchivedRow = (player: MatchRosterSelectionPlayer) => player.isFromArchive && archivedTeam !== null && hasArchivedRoster;

  return (
    <section className="match-team-selection" data-sequential-nav-root="true">
      <div className="team-selection-header">
        <div>
          <label className="team-label">{teamLabel}</label>
          <TeamNameInput
            value={teamName}
            onChange={onTeamNameChange}
            onSelectTeam={onSelectTeam}
            onCreateNewTeam={onCreateNewTeam}
            onKeyDown={handleSequentialEnter}
            placeholder={t('teamNamePlaceholder')}
          />
          {teamNameError ? <p className="form-error">{teamNameError}</p> : null}
        </div>
        {archivedTeam && (
          <div className="archived-team-summary">
            <span>{t('existingTeam')}</span>
            <span className="archived-team-meta">
              {archivedTeam.rosterIds.length} {t('archivedRoster')}
            </span>
          </div>
        )}
      </div>

      <div className="match-roster-section">
        <div className="match-roster-header">
          <div>
            <h4>{t('matchRosterSelection')}</h4>
            <p className="match-roster-helper">{t('matchRosterHelper')}</p>
          </div>
          <div className="match-roster-actions">
            <button type="button" className="btn-secondary btn-small" onClick={onToggleSelectAll}>
              {allPlayersSelected ? t('deselectAll') : t('selectAll')}
            </button>
            <button type="button" className="btn-secondary btn-small" onClick={onAddPlayer}>
              + {t('addPlayer')}
            </button>
          </div>
        </div>

        <div className="match-roster-toolbar">
          <div className="match-roster-stats">
            <span className="match-roster-stat">
              <span className="match-roster-stat__label">{t('players')}</span>
              <strong className="match-roster-stat__value">{players.length}</strong>
            </span>
            <span className="match-roster-stat">
              <span className="match-roster-stat__label">{t('selected')}</span>
              <strong className="match-roster-stat__value">{selectedPlayersCount}</strong>
            </span>
          </div>
          <span className={`match-roster-status ${rosterStatusTone}`}>
            {rosterError ? t('rosterNeedsAttention') : t('rosterReady')}
          </span>
        </div>

        {rosterError && (
          <div className="match-roster-validation" role="alert">
            {rosterError}
          </div>
        )}

        {players.length > 0 ? (
          <div className="match-roster-list">
            <div className="roster-table-container match-roster-list__desktop">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>{t('select')}</th>
                    <th>{t('jerseyNumber')}</th>
                    <th>{t('firstName')}</th>
                    <th>{t('lastName')}</th>
                    <th>{t('libero')}</th>
                    <th>{t('captain')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player, index) => {
                    const jerseyError = getPlayerError(index, 'jersey');
                    const firstNameError = getPlayerError(index, 'firstName');
                    const lastNameError = getPlayerError(index, 'lastName');
                    const archivedRow = isArchivedRow(player);

                    return (
                      <tr
                        key={player.id}
                        className={`match-roster-row ${player.isSelectedForMatch ? 'selected' : ''}`}
                        onClick={(event) => handleRowClick(event, player.id)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={player.isSelectedForMatch || false}
                            onChange={() => onPlayerToggleSelected(player.id)}
                            aria-label={t('select')}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={player.jerseyNumber || ''}
                            onChange={(event) => onPlayerFieldChange(index, 'jerseyNumber', event.target.value)}
                            onKeyDown={handleSequentialEnter}
                            className={`table-input ${jerseyError ? 'form-input-error' : ''}`}
                            readOnly={archivedRow}
                            aria-invalid={jerseyError ? 'true' : 'false'}
                          />
                          {jerseyError ? <p className="form-error">{jerseyError}</p> : null}
                        </td>
                        <td>
                          <input
                            type="text"
                            value={player.firstName}
                            onChange={(event) => onPlayerFieldChange(index, 'firstName', event.target.value)}
                            onKeyDown={handleSequentialEnter}
                            className={`table-input ${firstNameError ? 'form-input-error' : ''}`}
                            readOnly={archivedRow}
                            aria-invalid={firstNameError ? 'true' : 'false'}
                          />
                          {firstNameError ? <p className="form-error">{firstNameError}</p> : null}
                        </td>
                        <td>
                          <input
                            type="text"
                            value={player.lastName}
                            onChange={(event) => onPlayerFieldChange(index, 'lastName', event.target.value)}
                            onKeyDown={handleSequentialEnter}
                            className={`table-input ${lastNameError ? 'form-input-error' : ''}`}
                            readOnly={archivedRow}
                            aria-invalid={lastNameError ? 'true' : 'false'}
                          />
                          {lastNameError ? <p className="form-error">{lastNameError}</p> : null}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={player.isLibero || false}
                            onChange={() => onPlayerToggleLibero(player.id)}
                            disabled={!player.isSelectedForMatch}
                            aria-label={t('libero')}
                          />
                        </td>
                        <td>
                          <input
                            type="radio"
                            name={`${teamType}-captain`}
                            checked={player.isCaptain || false}
                            onChange={() => onPlayerToggleCaptain(player.id)}
                            disabled={!player.isSelectedForMatch}
                            aria-label={t('captain')}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="remove-btn"
                            onClick={() => onPlayerRemove(index)}
                            disabled={archivedRow}
                            aria-label={t('removePlayer')}
                            title={t('removePlayer')}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="match-roster-cards" aria-label={t('matchRosterSelection')}>
              {players.map((player, index) => {
                const jerseyError = getPlayerError(index, 'jersey');
                const firstNameError = getPlayerError(index, 'firstName');
                const lastNameError = getPlayerError(index, 'lastName');
                const archivedRow = isArchivedRow(player);

                return (
                  <article
                    key={`${player.id}-mobile`}
                    className={`match-roster-card ${player.isSelectedForMatch ? 'selected' : ''}`}
                  >
                    <div className="match-roster-card__header">
                      <label className="match-roster-card__toggle">
                        <span className="roster-mobile-label">{t('select')}</span>
                        <input
                          type="checkbox"
                          checked={player.isSelectedForMatch || false}
                          onChange={() => onPlayerToggleSelected(player.id)}
                          aria-label={t('select')}
                        />
                      </label>

                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => onPlayerRemove(index)}
                        disabled={archivedRow}
                        aria-label={t('removePlayer')}
                        title={t('removePlayer')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="match-roster-card__grid">
                      <label className="match-roster-card__field match-roster-card__field--jersey">
                        <span className="roster-mobile-label">{t('jerseyNumber')}</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={player.jerseyNumber || ''}
                          onChange={(event) => onPlayerFieldChange(index, 'jerseyNumber', event.target.value)}
                          onKeyDown={handleSequentialEnter}
                          className={`table-input ${jerseyError ? 'form-input-error' : ''}`}
                          readOnly={archivedRow}
                          aria-invalid={jerseyError ? 'true' : 'false'}
                        />
                        {jerseyError ? <span className="form-error">{jerseyError}</span> : null}
                      </label>

                      <label className="match-roster-card__field">
                        <span className="roster-mobile-label">{t('firstName')}</span>
                        <input
                          type="text"
                          value={player.firstName}
                          onChange={(event) => onPlayerFieldChange(index, 'firstName', event.target.value)}
                          onKeyDown={handleSequentialEnter}
                          className={`table-input ${firstNameError ? 'form-input-error' : ''}`}
                          readOnly={archivedRow}
                          aria-invalid={firstNameError ? 'true' : 'false'}
                        />
                        {firstNameError ? <span className="form-error">{firstNameError}</span> : null}
                      </label>

                      <label className="match-roster-card__field">
                        <span className="roster-mobile-label">{t('lastName')}</span>
                        <input
                          type="text"
                          value={player.lastName}
                          onChange={(event) => onPlayerFieldChange(index, 'lastName', event.target.value)}
                          onKeyDown={handleSequentialEnter}
                          className={`table-input ${lastNameError ? 'form-input-error' : ''}`}
                          readOnly={archivedRow}
                          aria-invalid={lastNameError ? 'true' : 'false'}
                        />
                        {lastNameError ? <span className="form-error">{lastNameError}</span> : null}
                      </label>
                    </div>

                    <div className="match-roster-card__controls">
                      <label className="match-roster-card__control">
                        <span className="roster-mobile-label">{t('libero')}</span>
                        <input
                          type="checkbox"
                          checked={player.isLibero || false}
                          onChange={() => onPlayerToggleLibero(player.id)}
                          disabled={!player.isSelectedForMatch}
                          aria-label={t('libero')}
                        />
                      </label>

                      <label className="match-roster-card__control">
                        <span className="roster-mobile-label">{t('captain')}</span>
                        <input
                          type="radio"
                          name={`${teamType}-captain-mobile`}
                          checked={player.isCaptain || false}
                          onChange={() => onPlayerToggleCaptain(player.id)}
                          disabled={!player.isSelectedForMatch}
                          aria-label={t('captain')}
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="empty-roster">{t(archivedTeam ? 'noPlayersInArchive' : 'noPlayersAdded')}</p>
        )}
      </div>
    </section>
  );
}
