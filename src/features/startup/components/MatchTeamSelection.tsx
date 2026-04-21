import type { MouseEvent } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchRosterSelectionPlayer } from '@src/domain/match/types';
import type { ArchivedTeam } from '@src/domain/team/types';
import { TeamNameInput } from './TeamNameInput';

interface MatchTeamSelectionProps {
  teamType: 'home' | 'away';
  teamName: string;
  archivedTeam: ArchivedTeam | null;
  players: MatchRosterSelectionPlayer[];
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
  const teamLabel = teamType === 'home' ? t('homeTeam') : t('awayTeam');
  const hasArchivedRoster = archivedTeam?.rosterIds.length ? true : false;
  const selectedPlayersCount = players.filter((player) => player.isSelectedForMatch).length;
  const rosterStatusTone = rosterError ? 'is-warning' : 'is-ready';

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, playerId: string) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, label')) {
      return;
    }

    onPlayerToggleSelected(playerId);
  };

  return (
    <section className="match-team-selection">
      <div className="team-selection-header">
        <div>
          <label className="team-label">{teamLabel}</label>
          <TeamNameInput
            value={teamName}
            onChange={onTeamNameChange}
            onSelectTeam={onSelectTeam}
            onCreateNewTeam={onCreateNewTeam}
            placeholder={t('teamNamePlaceholder')}
          />
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
          <div className="roster-table-container">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>{t('select')}</th>
                  <th>{t('jerseyNumber')}</th>
                  <th>{t('firstName')}</th>
                  <th>{t('lastName')}</th>
                  <th>{t('playerCode')}</th>
                  <th>{t('libero')}</th>
                  <th>{t('captain')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, index) => (
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
                    {(() => {
                      const isArchivedRow = player.isFromArchive && archivedTeam !== null && hasArchivedRoster;
                      return (
                        <>
                          <td>
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={player.jerseyNumber || ''}
                              onChange={(event) => onPlayerFieldChange(index, 'jerseyNumber', event.target.value)}
                              className="table-input"
                              readOnly={isArchivedRow}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={player.firstName}
                              onChange={(event) => onPlayerFieldChange(index, 'firstName', event.target.value)}
                              className="table-input"
                              readOnly={isArchivedRow}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={player.lastName}
                              onChange={(event) => onPlayerFieldChange(index, 'lastName', event.target.value)}
                              className="table-input"
                              readOnly={isArchivedRow}
                            />
                          </td>
                        </>
                      );
                    })()}
                    <td className="player-code-cell">{player.playerCode}</td>
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
                        disabled={player.isFromArchive && archivedTeam !== null && hasArchivedRoster}
                        aria-label={t('removePlayer')}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-roster">{t(archivedTeam ? 'noPlayersInArchive' : 'noPlayersAdded')}</p>
        )}
      </div>
    </section>
  );
}
