import { useState, useRef, useEffect } from 'react';
import type { PlayerStats } from '@src/features/scouting/model/match-stats';
import '../performance-dashboard.css';

interface PlayerAutocompleteProps {
  players: PlayerStats[];
  selectedPlayerId: string;
  onChange: (playerId: string) => void;
  homeTeamName: string;
  awayTeamName: string;
}

export function PlayerAutocomplete({
  players,
  selectedPlayerId,
  onChange,
  homeTeamName,
  awayTeamName,
}: PlayerAutocompleteProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedPlayer = players.find((p) => p.playerId === selectedPlayerId);
  const teamName = selectedPlayer?.teamSide === 'home' ? homeTeamName : awayTeamName;

  const filteredPlayers = search.trim() === ''
    ? players
    : players.filter((p) => {
        const searchLower = search.toLowerCase();
        const playerNameMatch = p.playerName?.toLowerCase().includes(searchLower) ?? false;
        const jerseyMatch = p.jerseyNumber.toString().includes(search);
        return playerNameMatch || jerseyMatch;
      });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (playerId: string) => {
    onChange(playerId);
    setSearch('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange('all');
    setSearch('');
    setIsOpen(false);
  };

  return (
    <div className="perf-dashboard__filter-group" ref={containerRef}>
      <label className="perf-dashboard__filter-label">
        Atleta
      </label>
      <div className="player-autocomplete">
        <div className="player-autocomplete__input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="player-autocomplete__input"
            placeholder="Cerca atleta..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => search && setIsOpen(true)}
          />
          {selectedPlayerId !== 'all' && (
            <button
              type="button"
              className="player-autocomplete__clear"
              onClick={handleClear}
              aria-label="Cancella selezione"
            >
              ✕
            </button>
          )}
        </div>

        {/* Selected player badge */}
        {selectedPlayerId !== 'all' && selectedPlayer && (
          <div className="player-autocomplete__selected">
            <span className="player-autocomplete__player-info">
              #{selectedPlayer.jerseyNumber} {selectedPlayer.playerName}
            </span>
            <span className="player-autocomplete__team-badge">
              {teamName}
            </span>
          </div>
        )}

        {/* Dropdown list */}
        {isOpen && search.trim() !== '' && (
          <ul className="player-autocomplete__list">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player) => {
                const pTeamName = player.teamSide === 'home' ? homeTeamName : awayTeamName;
                return (
                  <li
                    key={player.playerId}
                    className={`player-autocomplete__item ${selectedPlayerId === player.playerId ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(player.playerId)}
                  >
                    <span className="player-autocomplete__item-player">
                      #{player.jerseyNumber} {player.playerName}
                    </span>
                    <span className="player-autocomplete__item-team">
                      {pTeamName}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="player-autocomplete__no-results">
                Nessun atleta trovato
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
