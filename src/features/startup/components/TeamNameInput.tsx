import React, { useState } from 'react';
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

  return (
    <div className="team-name-input-container">
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        placeholder={placeholder || t('teamNamePlaceholder')}
        disabled={disabled}
        className="form-input team-name-input"
        autoComplete="off"
      />

      {showSuggestions && (suggestions.length > 0 || showCreateButton) && (
        <div className="team-suggestions-dropdown">
          {suggestions.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => handleSelectSuggestion(team)}
              className="team-suggestion-item"
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
              type="button"
              onClick={onCreateNewTeam}
              className="team-suggestion-create"
            >
              + {t('createNewTeamWith', { name: value })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
