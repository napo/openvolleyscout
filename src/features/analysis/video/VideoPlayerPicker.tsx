// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { readPlayerSort, savePlayerSort, sortPlayers, type PlayerSortKey, type SortablePlayer } from '@src/components/player-sort/player-sort';
import { PlayerSortChips, RallyCount } from '@src/components/player-sort/PlayerSortChips';
import { RoleChips, RoleTag } from '@src/components/player-role/RoleChips';
import type { RoleGroup } from '@src/components/player-role/player-role';
import '@src/features/analytics/dashboard/performance-dashboard.css';

export interface VideoPlayerPickOption extends SortablePlayer {
  value: string;
  label: string;
  /** Team name, to list the athletes in one column per team. */
  group?: string;
  roleGroup?: RoleGroup | null;
}

/**
 * Athlete picker of the video filters, the same as in the data study: a search box,
 * the list grouped by team with check boxes, the picked athletes as removable chips.
 * Nothing picked means every athlete.
 */
export function VideoPlayerPicker({ label, options, selected, onChange }: {
  label: string;
  options: readonly VideoPlayerPickOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<PlayerSortKey>(readPlayerSort);
  const changeSort = (next: PlayerSortKey) => { setSortKey(next); savePlayerSort(next); };
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = search.trim().toLowerCase();
  const sorted = sortPlayers(options, sortKey);
  const visible = query ? sorted.filter((option) => option.label.toLowerCase().includes(query)) : sorted;
  const picked = selected.map((id) => options.find((option) => option.value === id)).filter((option): option is VideoPlayerPickOption => Boolean(option));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  const groups: Array<{ name: string; items: VideoPlayerPickOption[] }> = [];
  visible.forEach((option) => {
    const name = option.group ?? '';
    const group = groups.find((item) => item.name === name);
    if (group) group.items.push(option);
    else groups.push({ name, items: [option] });
  });

  return (
    <div className="video-player-picker" ref={containerRef}>
      <span className="filter-chips__row-label">{label}</span>
      <div className="player-autocomplete player-autocomplete--multi">
        <div className="player-autocomplete__input-wrapper">
          <input
            type="text"
            className="player-autocomplete__input"
            placeholder={picked.length > 0 ? t('filterAthleteSearch') : `${t('setterViewReceptionAll')} - ${t('filterAthleteSearch')}`}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => { if (event.key === 'Escape') setIsOpen(false); }}
          />
          {picked.length > 0 ? (
            <button
              type="button"
              className="player-autocomplete__clear"
              onClick={() => { onChange([]); setSearch(''); setIsOpen(false); }}
              aria-label={t('filterAthleteClearSelection')}
            >
              ✕
            </button>
          ) : null}
        </div>

        {picked.length > 0 ? (
          <ul className="player-autocomplete__chips">
            {picked.map((option) => (
              <li key={option.value} className="player-autocomplete__chip">
                <span>{option.label}</span>
                <button type="button" onClick={() => toggle(option.value)} aria-label={`${t('filterAthleteClearSelection')}: ${option.label}`}>✕</button>
              </li>
            ))}
          </ul>
        ) : null}

        {isOpen ? (
          <div className="player-autocomplete__sort">
            <PlayerSortChips value={sortKey} onChange={changeSort} />
            <RoleChips players={options.map((o) => ({ id: o.value, roleGroup: o.roleGroup }))} selected={selected} onChange={onChange} />
          </div>
        ) : null}
        {isOpen ? (
          <div className="player-autocomplete__browse">
            {groups.length > 0 ? groups.map((group) => (
              <div key={group.name} className="player-autocomplete__browse-column">
                {group.name ? <div className="player-autocomplete__browse-header">{group.name}</div> : null}
                <ul className="player-autocomplete__browse-list">
                  {group.items.map((option) => {
                    const checked = selected.includes(option.value);
                    return (
                      <li key={option.value}>
                        <label className={`player-autocomplete__item ${checked ? 'is-selected' : ''}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggle(option.value)} />
                          <span className="player-autocomplete__item-player">{option.label} <RoleTag role={option.roleGroup} /> <RallyCount rallies={option.rallies} /></span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )) : <p className="player-autocomplete__no-results">{t('filterAthleteNoResults')}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
