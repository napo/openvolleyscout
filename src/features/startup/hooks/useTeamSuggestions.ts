import { useState, useCallback, useEffect } from 'react';
import type { ArchivedTeam } from '@src/domain/team/types';
import { teamRepository } from '@src/infrastructure/repositories';

/**
 * Team suggestion hook
 * Provides filtered suggestions based on user text input
 */
export function useTeamSuggestions(searchText: string) {
  const [suggestions, setSuggestions] = useState<ArchivedTeam[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSuggestions = async () => {
      if (searchText.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const matches = await teamRepository.searchByName(searchText);
        setSuggestions(matches);
      } catch (error) {
        console.error('Error loading team suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadSuggestions();
  }, [searchText]);

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
