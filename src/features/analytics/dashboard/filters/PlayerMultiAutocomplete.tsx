// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { togglePlayerId, type PlayerOption } from '../selectors/dashboard-selectors';
import { readPlayerSort, savePlayerSort, sortPlayers, type PlayerSortKey } from '@src/components/player-sort/player-sort';
import { PlayerSortChips, RallyCount } from '@src/components/player-sort/PlayerSortChips';
import '../performance-dashboard.css';

interface PlayerMultiAutocompleteProps {
  players: PlayerOption[];
  selectedPlayerIds: string[];
  onChange: (playerIds: string[]) => void;
  homeTeamName: string;
  awayTeamName: string;
}

/**
 * Pick one or more athletes: the picked ones show as removable chips and the list
 * stays open while ticking, so a whole group can be chosen in one go.
 */
export function PlayerMultiAutocomplete({
  players,
  selectedPlayerIds,
  onChange,
  homeTeamName,
  awayTeamName,
}: PlayerMultiAutocompleteProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<PlayerSortKey>(readPlayerSort);
  const changeSort = (next: PlayerSortKey) => { setSortKey(next); savePlayerSort(next); };
  const containerRef = useRef<HTMLDivElement>(null);

  const teamNameOf = (player: PlayerOption) => (player.teamSide === 'home' ? homeTeamName : awayTeamName);
  const selectedPlayers = selectedPlayerIds
    .map((id) => players.find((player) => player.playerId === id))
    .filter((player): player is PlayerOption => Boolean(player));

  const query = search.trim().toLowerCase();
  const isBrowsing = query === '';
  const matches = (player: PlayerOption) => (
    (player.playerName?.toLowerCase().includes(query) ?? false) || String(player.jerseyNumber).includes(query)
  );
  const sortedPlayers = sortPlayers(players, sortKey);
  const visiblePlayers = isBrowsing ? sortedPlayers : sortedPlayers.filter(matches);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (playerId: string) => onChange(togglePlayerId(selectedPlayerIds, playerId));

  const renderItem = (player: PlayerOption, showTeam: boolean) => {
    const checked = selectedPlayerIds.includes(player.playerId);
    return (
      <li key={player.playerId}>
        <label className={`player-autocomplete__item ${checked ? 'is-selected' : ''}`}>
          <input type="checkbox" checked={checked} onChange={() => toggle(player.playerId)} />
          <span className="player-autocomplete__item-player">#{player.jerseyNumber} {player.playerName} <RallyCount rallies={player.rallies} /></span>
          {showTeam ? <span className="player-autocomplete__item-team">{teamNameOf(player)}</span> : null}
        </label>
      </li>
    );
  };

  const columns = ([['home', homeTeamName], ['away', awayTeamName]] as const)
    .map(([teamSide, label]) => ({ teamSide, label, teamPlayers: sortedPlayers.filter((player) => player.teamSide === teamSide) }))
    .filter((column) => column.teamPlayers.length > 0);

  return (
    <div className="perf-dashboard__filter-group" ref={containerRef}>
      <label className="perf-dashboard__filter-label">{t('filterAthlete')}</label>
      <div className="player-autocomplete player-autocomplete--multi">
        <div className="player-autocomplete__input-wrapper">
          <input
            type="text"
            className="player-autocomplete__input"
            placeholder={t('filterAthleteSearch')}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => { if (event.key === 'Escape') setIsOpen(false); }}
          />
          {selectedPlayerIds.length > 0 && (
            <button
              type="button"
              className="player-autocomplete__clear"
              onClick={() => { onChange([]); setSearch(''); setIsOpen(false); }}
              aria-label={t('filterAthleteClearSelection')}
            >
              ✕
            </button>
          )}
        </div>

        {selectedPlayers.length > 0 && (
          <ul className="player-autocomplete__chips">
            {selectedPlayers.map((player) => (
              <li key={player.playerId} className="player-autocomplete__chip">
                <span>#{player.jerseyNumber} {player.playerName}</span>
                <button
                  type="button"
                  onClick={() => toggle(player.playerId)}
                  aria-label={`${t('filterAthleteClearSelection')}: ${player.playerName ?? player.jerseyNumber}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {isOpen ? <div className="player-autocomplete__sort"><PlayerSortChips value={sortKey} onChange={changeSort} /></div> : null}

        {isOpen && isBrowsing && (
          <div className="player-autocomplete__browse">
            {columns.length > 0 ? columns.map(({ teamSide, label, teamPlayers }) => (
              <div key={teamSide} className="player-autocomplete__browse-column">
                <div className="player-autocomplete__browse-header">{label}</div>
                <ul className="player-autocomplete__browse-list">
                  {teamPlayers.map((player) => renderItem(player, false))}
                </ul>
              </div>
            )) : <p className="player-autocomplete__no-results">{t('filterAthleteNoResults')}</p>}
          </div>
        )}

        {isOpen && !isBrowsing && (
          <ul className="player-autocomplete__list">
            {visiblePlayers.length > 0
              ? visiblePlayers.map((player) => renderItem(player, true))
              : <li className="player-autocomplete__no-results">{t('filterAthleteNoResults')}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
