import React, { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { useCompetitionSuggestions } from '../hooks/useCompetitionSuggestions';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';

interface CompetitionNameInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectSuggestion: (suggestion: CompetitionArchiveEntry) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
}

export function CompetitionNameInput({
  id,
  value,
  onChange,
  onSelectSuggestion,
  onKeyDown,
  placeholder,
  disabled,
}: CompetitionNameInputProps) {
  const { t } = useTranslation();
  const { suggestions } = useCompetitionSuggestions(value);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
  };

  const handleSelectSuggestion = (suggestion: CompetitionArchiveEntry) => {
    onChange(suggestion.name);
    onSelectSuggestion(suggestion);
    setShowSuggestions(false);
  };

  const handleFocus = () => {
    if (value.trim().length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    setTimeout(() => setShowSuggestions(false), 200);
  };

  return (
    <div className="team-name-input-container">
      <input
        id={id}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder || t('competitionNamePlaceholder')}
        disabled={disabled}
        className="form-input team-name-input"
        autoComplete="off"
      />

      {showSuggestions && suggestions.length > 0 && (
        <div className="team-suggestions-dropdown">
          {suggestions.map((competition) => (
            <button
              key={competition.id}
              type="button"
              onClick={() => handleSelectSuggestion(competition)}
              className="team-suggestion-item"
            >
              <span className="suggestion-name">{competition.name}</span>
              <span className="suggestion-meta">{t('existingCompetition')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
