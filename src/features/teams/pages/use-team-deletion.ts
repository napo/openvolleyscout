// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback } from 'react';
import { confirmAction } from '@src/components/confirm-dialog';
import type { TranslationKey } from '@src/i18n';
import type { ArchivedTeam } from '@src/domain/team/types';
import { matchRepository, teamRepository, type MatchSummaryRecord } from '@src/infrastructure/repositories';
import { findRelatedMatchIds } from '../model/team-matches';

interface UseTeamDeletionOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  teams: readonly ArchivedTeam[];
  /** Team currently open in the editor, if any. */
  form: { id: string | null; name: string };
  matchSummaries: readonly MatchSummaryRecord[];
  isLoadingCompetitions: boolean;
  loadTeams: () => Promise<void>;
  resetEditor: () => void;
  showList: () => void;
  setStatus: (message: string, tone: 'error' | 'success') => void;
}

/** Team deletion flows (single, from the editor, bulk), optionally removing the linked played matches. */
export function useTeamDeletion({
  t, teams, form, matchSummaries, isLoadingCompetitions, loadTeams, resetEditor, showList, setStatus,
}: UseTeamDeletionOptions) {
  const findRelatedMatchIdsFor = useCallback(async (
    targetTeams: ReadonlyArray<Pick<ArchivedTeam, 'id' | 'name'>>,
  ): Promise<string[]> => {
    const summaries = isLoadingCompetitions ? await matchRepository.listSummaries() : matchSummaries;
    return findRelatedMatchIds(summaries, targetTeams);
  }, [isLoadingCompetitions, matchSummaries]);

  const handleDeleteTeam = useCallback(async (
    teamId: string,
    confirmationMessage: string,
  ) => {
    const confirmed = await confirmAction(confirmationMessage);
    if (!confirmed) {
      return;
    }

    try {
      const targetTeam = teams.find((team) => team.id === teamId) ?? { id: teamId, name: form.id === teamId ? form.name : '' };
      const relatedMatchIds = await findRelatedMatchIdsFor([targetTeam]);
      const deleteMatches = relatedMatchIds.length > 0
        && await confirmAction(t('deleteTeamMatchesConfirmation', { count: relatedMatchIds.length }));

      // Matches first: if one fails the team is still there and the delete can be retried.
      if (deleteMatches) {
        for (const matchId of relatedMatchIds) {
          await matchRepository.delete(matchId);
        }
      }
      await teamRepository.delete(teamId);
      await loadTeams();

      if (form.id === teamId) {
        resetEditor();
        showList();
      }

      setStatus(
        deleteMatches
          ? t('teamDeletedWithMatches', { count: relatedMatchIds.length })
          : t('teamDeleted'),
        'success',
      );
    } catch (error) {
      console.error('Error deleting team:', error);
      setStatus(t('teamDeleteFailed'), 'error');
    }
  }, [findRelatedMatchIdsFor, form.id, form.name, loadTeams, resetEditor, showList, t, teams]);

  const handleDeleteSelectedTeam = useCallback(async () => {
    if (!form.id) {
      return;
    }

    await handleDeleteTeam(form.id, t('deleteTeamConfirmation'));
  }, [form.id, handleDeleteTeam, t]);

  const handleDeleteManyTeams = useCallback(async (selectedTeams: ArchivedTeam[]) => {
    if (selectedTeams.length === 0) return;
    if (!(await confirmAction(t('tableDeleteSelectedConfirm', { count: selectedTeams.length })))) return;
    try {
      const relatedMatchIds = await findRelatedMatchIdsFor(selectedTeams);
      const deleteMatches = relatedMatchIds.length > 0
        && await confirmAction(t('deleteTeamMatchesConfirmation', { count: relatedMatchIds.length }));

      // Matches first: if one fails the teams are still there and the delete can be retried.
      if (deleteMatches) {
        for (const matchId of relatedMatchIds) {
          await matchRepository.delete(matchId);
        }
      }
      for (const team of selectedTeams) {
        await teamRepository.delete(team.id);
        if (form.id === team.id) {
          resetEditor();
          showList();
        }
      }
      await loadTeams();
      setStatus(
        deleteMatches
          ? t('teamDeletedWithMatches', { count: relatedMatchIds.length })
          : t('teamDeleted'),
        'success',
      );
    } catch (error) {
      console.error('Error deleting selected teams:', error);
      setStatus(t('teamDeleteFailed'), 'error');
    }
  }, [findRelatedMatchIdsFor, form.id, loadTeams, resetEditor, showList, t]);

  return { handleDeleteTeam, handleDeleteSelectedTeam, handleDeleteManyTeams };
}
