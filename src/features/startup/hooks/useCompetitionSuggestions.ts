import { useState, useEffect } from 'react';
import type { ArchivedCompetitionName } from '@src/domain/archive/types';
import { findCompetitionNamesByText } from '@src/infrastructure/storage/archived-competition-storage';

export function useCompetitionSuggestions(searchText: string) {
  const [suggestions, setSuggestions] = useState<ArchivedCompetitionName[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSuggestions = async () => {
      if (searchText.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const matches = await findCompetitionNamesByText(searchText);
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
