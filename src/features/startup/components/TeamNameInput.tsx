import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { useTeamSuggestions } from '../hooks/useTeamSuggestions';
import type { ArchivedTeam } from '@src/domain/team/types';

interface TeamNameInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectTeam: (team: ArchivedTeam) => void;
  onCreateNewTeam: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
}

export function TeamNameInput({
  value,
  onChange,
  onSelectTeam,
  onCreateNewTeam,
  onKeyDown,
  placeholder,
  disabled,
}: TeamNameInputProps) {
  const { t } = useTranslation();
  const { suggestions } = useTeamSuggestions(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
  };

  const handleSelectSuggestion = (team: ArchivedTeam) => {
    onChange(team.name);
    onSelectTeam(team);
    setShowSuggestions(false);
  };

  const handleFocus = () => {
    setShowSuggestions(true);
  };

  const handleBlur = () => {
    // Delay to allow suggestion click to register
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const hasExactMatch = suggestions.some(
    (team) => team.name.trim().toLowerCase() === value.trim().toLowerCase()
  );
  const showCreateButton = value.trim().length > 0 && !hasExactMatch;
  // Existing teams come first, so the default choice is never a duplicate.
  const optionCount = suggestions.length + (showCreateButton ? 1 : 0);
  const isOpen = showSuggestions && optionCount > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [value, suggestions.length]);

  const chooseActive = () => {
    if (activeIndex < suggestions.length) handleSelectSuggestion(suggestions[activeIndex]);
    else if (showCreateButton) { onCreateNewTeam(); setShowSuggestions(false); }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isOpen) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => (index + 1) % optionCount); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => (index - 1 + optionCount) % optionCount); return; }
      if (event.key === 'Escape') { event.preventDefault(); setShowSuggestions(false); return; }
      if (event.key === 'Enter') { event.preventDefault(); chooseActive(); return; }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="team-name-input-container">
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
        placeholder={placeholder || t('teamNamePlaceholder')}
        disabled={disabled}
        className="form-input team-name-input"
        autoComplete="off"
      />

      {isOpen && (
        <div className="team-suggestions-dropdown" role="listbox" id={listId}>
          {suggestions.map((team, index) => (
            <button
              key={team.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => handleSelectSuggestion(team)}
              className={`team-suggestion-item${index === activeIndex ? ' is-active' : ''}`}
            >
              <span className="suggestion-name">{team.name}</span>
              <span className="suggestion-meta">
                {team.rosterIds.length > 0
                  ? `${t('existingTeam')} (${team.rosterIds.length})`
                  : t('newTeam')}
              </span>
            </button>
          ))}

          {showCreateButton && (
            <button
              id={`${listId}-${suggestions.length}`}
              type="button"
              role="option"
              aria-selected={activeIndex === suggestions.length}
              onMouseEnter={() => setActiveIndex(suggestions.length)}
              onClick={onCreateNewTeam}
              className={`team-suggestion-create${activeIndex === suggestions.length ? ' is-active' : ''}`}
            >
              + {t('createNewTeamWith', { name: value })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
