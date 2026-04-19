import React from 'react';
import { useTranslation } from '@src/i18n';
import { getRosterStats } from '@src/lib/validation/roster-validation';
import type { MatchPlayer } from '@src/domain/team/types';

interface MatchRosterTableProps {
  players: MatchPlayer[];
  onToggleSelect: (playerId: string) => void;
  onToggleLibero: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  disabled?: boolean;
}

export function MatchRosterTable({
  players,
  onToggleSelect,
  onToggleLibero,
  onToggleCaptain,
  disabled,
}: MatchRosterTableProps) {
  const { t } = useTranslation();

  if (players.length === 0) {
    return <p className="roster-empty-state">{t('noPlayersInArchive')}</p>;
  }

  const selectedPlayers = players.filter((p) => p.isSelectedForMatch);
  const stats = getRosterStats(selectedPlayers);

  return (
    <div className="match-roster-container">
      <div className="roster-stats">
        <div className="stat-item">
          <span className="stat-label">{t('selected')}:</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('regulars')}:</span>
          <span className="stat-value">{stats.regular}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('liberos')}:</span>
          <span className="stat-value">{stats.liberos}</span>
        </div>
      </div>

      <div className="roster-table-wrapper">
        <table className="roster-table">
          <thead>
            <tr>
              <th>{t('select')}</th>
              <th>{t('jerserNumber')}</th>
              <th>{t('playerName')}</th>
              <th>{t('code')}</th>
              <th>{t('libero')}</th>
              <th>{t('captain')}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr
                key={player.id}
                className={`roster-row ${player.isSelectedForMatch ? 'selected' : ''}`}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={player.isSelectedForMatch || false}
                    onChange={() => onToggleSelect(player.id)}
                    disabled={disabled}
                    aria-label={`Select ${player.firstName} ${player.lastName}`}
                  />
                </td>
                <td className="jersey-number">{player.jerseyNumber}</td>
                <td className="player-name">
                  {player.firstName} {player.lastName}
                </td>
                <td className="player-code">{player.playerCode}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={player.isLibero || false}
                    onChange={() => onToggleLibero(player.id)}
                    disabled={disabled || !player.isSelectedForMatch}
                    aria-label={`Mark ${player.firstName} as libero`}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={player.isCaptain || false}
                    onChange={() => onToggleCaptain(player.id)}
                    disabled={disabled || !player.isSelectedForMatch}
                    aria-label={`Mark ${player.firstName} as captain`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
