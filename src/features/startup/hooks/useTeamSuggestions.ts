import { useState, useCallback, useEffect } from 'react';
import type { ArchivedTeam } from '@src/domain/team/types';
import { teamRepository } from '@src/infrastructure/repositories';

/**
 * Team suggestion hook
 * Loads the archived teams once and filters them client-side as the user types.
 * With an empty search text it returns the full list, so the field can be browsed
 * like a dropdown before narrowing down by name.
 */
export function useTeamSuggestions(searchText: string) {
  const { teams, isLoading } = useAllArchivedTeams();

  const search = searchText.trim().toLowerCase();
  const suggestions =
    search.length === 0 ? teams : teams.filter((team) => team.name.toLowerCase().includes(search));

  return { suggestions, isLoading };
}

/**
 * Get all archival teams (for populating defaults, etc.)
 */
export function useAllArchivedTeams() {
  const [teams, setTeams] = useState<ArchivedTeam[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadTeams = useCallback(async () => {
    setIsLoading(true);
    try {
      const allTeams = await teamRepository.list();
      setTeams(allTeams);
    } catch (error) {
      console.error('Error loading archived teams:', error);
      setTeams([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  return { teams, isLoading, reload: loadTeams };
}
