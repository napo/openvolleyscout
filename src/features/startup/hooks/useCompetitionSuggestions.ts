import { useState, useEffect } from 'react';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import { competitionRepository } from '@src/infrastructure/repositories';

export function useCompetitionSuggestions(searchText: string) {
  const [suggestions, setSuggestions] = useState<CompetitionArchiveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSuggestions = async () => {
      if (searchText.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const matches = await competitionRepository.searchByName(searchText);
        setSuggestions(matches);
      } catch (error) {
        console.error('Error loading competition suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadSuggestions();
  }, [searchText]);

  return { suggestions, isLoading };
}
