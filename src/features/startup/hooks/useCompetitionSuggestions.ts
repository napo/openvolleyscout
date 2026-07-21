import { useState, useCallback, useEffect } from 'react';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import { competitionRepository } from '@src/infrastructure/repositories';

/**
 * Competition suggestion hook
 * Loads the archived competitions once and filters them client-side as the user types.
 * With an empty search text it returns the full list, so the field can be browsed
 * like a dropdown before narrowing down by name.
 */
export function useCompetitionSuggestions(searchText: string) {
  const { competitions, isLoading } = useAllCompetitions();

  const search = searchText.trim().toLowerCase();
  const suggestions =
    search.length === 0
      ? competitions
      : competitions.filter((competition) => competition.name.toLowerCase().includes(search));

  return { suggestions, isLoading };
}

/**
 * Get all archived competitions (for browsing/defaults)
 */
export function useAllCompetitions() {
  const [competitions, setCompetitions] = useState<CompetitionArchiveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadCompetitions = useCallback(async () => {
    setIsLoading(true);
    try {
      const allCompetitions = await competitionRepository.list();
      setCompetitions(allCompetitions);
    } catch (error) {
      console.error('Error loading archived competitions:', error);
      setCompetitions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompetitions();
  }, [loadCompetitions]);

  return { competitions, isLoading, reload: loadCompetitions };
}
