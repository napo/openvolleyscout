import { ActionIcon } from '@src/components/ActionIcon';
import type { PlayerRole } from '@src/domain/common/enums';
import { ROLE_GROUP_NAME_KEYS, ROLE_GROUP_SHORT_KEYS, type RoleGroup } from '@src/components/player-role/player-role';
import { LoadingProgressBanner, type LoadProgressState } from '@src/components/LoadingProgressBanner';
import { TeamLibraryTable } from './TeamLibraryTable';
import { countMatchesByTeamId, groupMatchesByTeamId } from '../model/team-matches';
import { TeamMergePanel } from './TeamMergePanel';
import { useTeamDeletion } from './use-team-deletion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import {
  createArchivedPlayer,
  generatePlayerCode,
} from '@src/domain/team/factories';
import { matchRepository, teamRepository, type MatchSummaryRecord } from '@src/infrastructure/repositories';
import {
  buildCompetitionsByTeamIdFromSummaries,
  compareTeamsForMerge,
  executeTeamMerge,
  findSimilarTeamGroups,
  type TeamMergeComparison,
} from '../model/team-merge';
import { useAppStore } from '@src/app/store/app-store';
import { QuickJerseyEntry, type QuickJerseyEntryOutcome } from '@src/components/roster/QuickJerseyEntry';
import type { QuickEntryPlayer } from '@src/domain/roster/quick-entry';
import { syncArchivedTeamNamesToMatches } from '@src/features/teams/model/sync-roster-names';
import { DEFAULT_ROSTER } from '@src/lib/utils/player-code-generator';
import { useSequentialEnterNavigation } from '@src/lib/hooks/useSequentialEnterNavigation';
import {
  exportRosterPayload,
  getDefaultRosterExportFileName,
  mapTeamRecordsToRosterExportPayload,
  RosterExportPanel,
} from '@src/features/export/rosters';
import type { RosterExportFormat } from '@src/features/export/rosters';
import { RosterImportModal } from '@src/features/import/rosters/ui/RosterImportModal';
import type { RosterImportFormat, RosterImportPayload } from '@src/features/import/rosters';
import { confirmAction } from '@src/components/confirm-dialog';
import { createEmptyTeamForm, validateTeamForm, type TeamFieldError, type TeamFormData } from '../model/team-form';

/** Roles offered in the team list (the filter letters: P, S, O, C, L in Italian). */
const TEAM_ROLE_OPTIONS: ReadonlyArray<[PlayerRole, RoleGroup]> = [
  ['setter', 'setter'], ['outside_hitter', 'outside'], ['opposite', 'opposite'], ['middle_blocker', 'middle'], ['libero', 'libero'],
];

type PlayerField = 'jerseyNumber' | 'firstName' | 'lastName' | 'role' | 'isLibero' | 'isCaptain';
const RANDOM_ROSTER_SIZE = 14;

export function TeamsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<ArchivedTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [teamLoadProgress, setTeamLoadProgress] = useState<LoadProgressState | null>(null);
  const [isLoadingCompetitions, setIsLoadingCompetitions] = useState(false);
  const [matchLoadProgress, setMatchLoadProgress] = useState<LoadProgressState | null>(null);
  const [form, setForm] = useState<TeamFormData>(createEmptyTeamForm());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedFormRef = useRef(JSON.stringify(form));
  const listRef = useRef<HTMLDivElement>(null);
  const listPositionRef = useRef({ page: 0, top: 0, left: 0 });
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dirty = editing && JSON.stringify(form) !== savedFormRef.current;
  const [errors, setErrors] = useState<TeamFieldError>({});
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusTone, setStatusTone] = useState<'error' | 'success' | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [matchSummaries, setMatchSummaries] = useState<MatchSummaryRecord[]>([]);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeComparison, setMergeComparison] = useState<TeamMergeComparison | null>(null);
  const [isMergingTeams, setIsMergingTeams] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handleSequentialEnter = useSequentialEnterNavigation();

  const similarGroups = useMemo(() => findSimilarTeamGroups(teams), [teams]);
  const competitionsByTeamId = useMemo(
    () => buildCompetitionsByTeamIdFromSummaries(matchSummaries),
    [matchSummaries],
  );
  const matchCountByTeamId = useMemo(() => countMatchesByTeamId(matchSummaries), [matchSummaries]);
  const matchesByTeamId = useMemo(() => groupMatchesByTeamId(matchSummaries), [matchSummaries]);

  const loadTeams = useCallback(async () => {
    setIsLoadingTeams(true);
    try {
      const archivedTeams = await teamRepository.listWithProgress(setTeamLoadProgress);
      setTeams(archivedTeams);
    } catch (error) {
      console.error('Error loading teams:', error);
      setStatusTone('error');
      setStatusMessage(t('teamLoadFailed'));
      return;
    } finally {
      setIsLoadingTeams(false);
      setTeamLoadProgress(null);
    }

    setIsLoadingCompetitions(true);
    try {
      const summaries = await matchRepository.listSummaries(setMatchLoadProgress);
      setMatchSummaries(summaries);
    } catch (error) {
      console.error('Error loading matches for team competitions:', error);
    } finally {
      setIsLoadingCompetitions(false);
      setMatchLoadProgress(null);
    }
  }, [t]);

  const handleExportRoster = useCallback(
    async (format: RosterExportFormat, scope: 'single' | 'all', teamId: string | undefined) => {
      try {
        let records: Awaited<ReturnType<typeof teamRepository.getAllRecords>> = [];

        if (scope === 'all') {
          records = await teamRepository.getAllRecords();
        } else if (teamId) {
          const teamRecord = await teamRepository.getById(teamId);
          if (teamRecord) {
            records = [teamRecord];
          }
        }

        if (records.length === 0) {
          setStatusTone('error');
          setStatusMessage(t('rosterExportNoTeams'));
          return;
        }

        const payload = mapTeamRecordsToRosterExportPayload(records);
        const exportName = scope === 'all'
          ? 'OpenVolleyScout'
          : (records[0]?.team.name ?? 'roster');
        const fileName = getDefaultRosterExportFileName(exportName, format, scope === 'all');

        const { diagnostics } = exportRosterPayload(payload, format, fileName);
        const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
        const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

        if (errorCount > 0) {
          setStatusTone('error');
          setStatusMessage(t('rosterExportCompletedWithErrors', { errors: errorCount }));
        } else if (warningCount > 0) {
          setStatusTone('success');
          setStatusMessage(t('rosterExportCompletedWithWarnings', { warnings: warningCount }));
        } else {
          setStatusTone('success');
          setStatusMessage(t('rosterExportCompleted'));
        }
      } catch (error) {
        console.error('Roster export failed:', error);
        setStatusTone('error');
        setStatusMessage(t('rosterExportFailed'));
      } finally {
        setShowExportModal(false);
      }
    },
    [t],
  );

  const handleImportRoster = useCallback(
    async (payload: RosterImportPayload, _format: RosterImportFormat) => {
      try {
        let savedCount = 0;

        for (const importTeam of payload.teams) {
          const players: ArchivedPlayer[] = importTeam.players.map((p) =>
            createArchivedPlayer(p.jerseyNumber, p.firstName, p.lastName, p.isLibero ?? false, p.isCaptain ?? false),
          );

          // Try to find existing team by name and update, or create new
          const existing = await teamRepository.getByName(importTeam.teamName);
          if (existing) {
            await teamRepository.update(existing.team.id, {
              players,
            });
          } else {
            await teamRepository.create({
              name: importTeam.teamName,
              staff: { headCoach: '', assistantCoach: '' },
              players,
            });
          }
          savedCount += 1;
        }

        await loadTeams();
        setStatusTone('success');
        setStatusMessage(t('importRosterCompleted', { teams: savedCount }));
      } catch (error) {
        console.error('Roster import failed:', error);
        setStatusTone('error');
        setStatusMessage(t('importRosterFailed'));
      } finally {
        setShowImportModal(false);
      }
    },
    [loadTeams, t],
  );

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const applyTeamRecordToForm = useCallback((team: ArchivedTeam, players: ArchivedPlayer[]) => {
    const next = {
      id: team.id,
      name: team.name,
      staff: team.staff,
      players,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
    savedFormRef.current = JSON.stringify(next);
    setForm(next);
    setErrors({});
    setStatusTone(null);
  }, []);

  const setFormFromTeam = useCallback(
    async (team: ArchivedTeam) => {
      const teamRecord = await teamRepository.getById(team.id);
      if (!teamRecord) {
        return false;
      }

      applyTeamRecordToForm(teamRecord.team, teamRecord.roster.players);
      setStatusMessage('');
      return true;
    },
    [applyTeamRecordToForm],
  );

  const resetEditor = useCallback(() => {
    const next = createEmptyTeamForm();
    savedFormRef.current = JSON.stringify(next);
    setForm(next);
    setErrors({});
    setStatusTone(null);
  }, []);

  const refreshSelectedTeam = useCallback(async (teamId: string) => {
    await loadTeams();
    const updatedTeam = await teamRepository.getById(teamId);
    if (!updatedTeam) {
      resetEditor();
      return;
    }

    applyTeamRecordToForm(updatedTeam.team, updatedTeam.roster.players);
  }, [applyTeamRecordToForm, loadTeams, resetEditor]);

  const rememberList = () => {
    const scroll = listRef.current?.querySelector('.teams-library__scroll');
    listPositionRef.current = { page: window.scrollY, top: scroll?.scrollTop ?? 0, left: scroll?.scrollLeft ?? 0 };
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const showList = useCallback(() => {
    setEditing(false);
    requestAnimationFrame(() => {
      const scroll = listRef.current?.querySelector('.teams-library__scroll');
      if (scroll) { scroll.scrollTop = listPositionRef.current.top; scroll.scrollLeft = listPositionRef.current.left; }
      window.scrollTo({ top: listPositionRef.current.page });
      const target = returnFocusRef.current?.isConnected ? returnFocusRef.current : listRef.current?.querySelector<HTMLButtonElement>('.teams-library__new');
      target?.focus({ preventScroll: true });
    });
  }, []);

  const closeEditor = async () => {
    if (saving || (dirty && !(await confirmAction(t('teamLibraryDiscard'))))) return;
    resetEditor();
    setStatusMessage('');
    showList();
  };

  const focusEditor = () => requestAnimationFrame(() => {
    editorRef.current?.scrollIntoView({ block: 'start' });
    editorRef.current?.querySelector<HTMLInputElement>('#team-name')?.focus({ preventScroll: true });
  });

  const handleSelectTeam = async (teamId: string) => {
    const team = teams.find((entry) => entry.id === teamId);
    if (!team) return;
    rememberList();
    try {
      if (!await setFormFromTeam(team)) {
        setStatusMessage(t('teamLoadFailed'));
        setStatusTone('error');
        return;
      }
      setEditing(true);
      focusEditor();
    } catch (error) {
      console.error('Error opening team:', error);
      setStatusMessage(t('teamLoadFailed'));
      setStatusTone('error');
    }
  };

  const handleCreateNewTeam = () => {
    rememberList();
    resetEditor();
    setStatusMessage('');
    setEditing(true);
    focusEditor();
  };

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const scrollToFirstError = useCallback(() => {
    requestAnimationFrame(() => {
      const firstError = editorRef.current?.querySelector('.form-input-error, .form-error');
      if (firstError instanceof HTMLElement) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (firstError instanceof HTMLInputElement) {
          firstError.focus();
        }
      }
    });
  }, []);

  const handlePlayerChange = (playerId: string, field: PlayerField, value: string | boolean) => {
    setStatusMessage('');
    setStatusTone(null);

    setForm((current) => ({
      ...current,
      players: current.players.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        const updatedPlayer = { ...player } as ArchivedPlayer;

        if (field === 'jerseyNumber') {
          updatedPlayer.jerseyNumber = parseInt(value as string, 10) || 0;
        } else if (field === 'firstName' || field === 'lastName') {
          updatedPlayer[field] = value as string;
          updatedPlayer.playerCode = generatePlayerCode(
            field === 'firstName' ? (value as string) : updatedPlayer.firstName,
            field === 'lastName' ? (value as string) : updatedPlayer.lastName,
          );
        } else if (field === 'role') {
          updatedPlayer.role = (value as string) ? value as PlayerRole : undefined;
        } else if (field === 'isLibero' || field === 'isCaptain') {
          updatedPlayer[field] = value as boolean;
        }

        return updatedPlayer;
      }),
    }));


  };

  const handleAddPlayer = () => {
    setStatusMessage('');
    setStatusTone(null);
    const player = createArchivedPlayer(0, '', '');

    setForm((current) => ({ ...current, players: [...current.players, player] }));

    // Scroll to bottom after adding player
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const handleQuickAddPlayers = async (entries: QuickEntryPlayer[]): Promise<QuickJerseyEntryOutcome> => {
    setStatusMessage('');
    setStatusTone(null);
    const existingJerseys = new Set(form.players.map((player) => player.jerseyNumber));
    const toAdd = entries.filter((entry) => !existingJerseys.has(entry.jerseyNumber));
    const newPlayers = toAdd.map((entry) => ({
      ...createArchivedPlayer(entry.jerseyNumber, '', '', entry.isLibero),
      playerCode: `#${entry.jerseyNumber}`,
    }));

    if (newPlayers.length > 0) {
      setForm((current) => ({ ...current, players: [...current.players, ...newPlayers] }));
    }

    return {
      added: toAdd.map((entry) => entry.jerseyNumber),
      skipped: entries.filter((entry) => existingJerseys.has(entry.jerseyNumber)).map((entry) => entry.jerseyNumber),
    };
  };

  // Names entered here flow into saved matches where the player was scouted by number only.
  const syncNamesToMatches = async (teamId: string): Promise<number> => {
    try {
      const updatedMatches = await syncArchivedTeamNamesToMatches(teamId);
      const { activeProject, setActiveProject } = useAppStore.getState();
      const updatedActive = updatedMatches.find((project) => project.metadata.id === activeProject?.metadata.id);
      if (updatedActive) {
        setActiveProject(updatedActive);
      }
      return updatedMatches.length;
    } catch (error) {
      console.error('Error syncing player names to matches:', error);
      return 0;
    }
  };

  const handleRandomFill = () => {
    // Shuffle the default roster and select a full test roster without duplicates
    const shuffled = [...DEFAULT_ROSTER].sort(() => Math.random() - 0.5);
    const selectedPlayers = shuffled.slice(0, RANDOM_ROSTER_SIZE);

    // Create archived players with new IDs and regenerated codes
    const randomPlayers: ArchivedPlayer[] = selectedPlayers.map((player) =>
      createArchivedPlayer(player.jerseyNumber, player.firstName, player.lastName, player.isLibero, player.isCaptain)
    );

    setStatusMessage('');
    setStatusTone(null);

    setForm((current) => ({ ...current, players: randomPlayers }));

    // Scroll to bottom after filling roster
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const handleRemovePlayer = (playerId: string) => {
    setStatusMessage('');
    setStatusTone(null);

    setForm((current) => ({ ...current, players: current.players.filter((player) => player.id !== playerId) }));
  };

  const validateForm = (): TeamFieldError => validateTeamForm(form, t);

  const handleSaveTeam = async () => {
    if (saving) return;
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setStatusMessage(t('teamSaveValidationFailed'));
      setStatusTone('error');
      scrollToFirstError();
      return;
    }

    setSaving(true);
    let syncedMatchCount = 0;
    try {
      if (!form.id) {
        const createdTeam = await teamRepository.create({
          name: form.name.trim(),
          staff: form.staff,
          players: form.players,
          createdAt: form.createdAt,
          updatedAt: form.updatedAt,
        });
        await refreshSelectedTeam(createdTeam.team.id);
        syncedMatchCount = await syncNamesToMatches(createdTeam.team.id);
      } else {
        await teamRepository.update(form.id, {
          name: form.name.trim(),
          staff: form.staff,
          players: form.players,
        });
        await refreshSelectedTeam(form.id);
        syncedMatchCount = await syncNamesToMatches(form.id);
      }

      setStatusMessage(syncedMatchCount > 0
        ? `${t('teamSaved')} ${t('teamNamesSyncedToMatches', { count: syncedMatchCount })}`
        : t('teamSaved'));
      setStatusTone('success');
      showList();
    } catch (error) {
      console.error('Error saving team:', error);
      setStatusMessage(t('teamSaveFailed'));
      setStatusTone('error');
    } finally {
      setSaving(false);
    }
  };

  const { handleDeleteSelectedTeam, handleDeleteTeam, handleDeleteManyTeams } = useTeamDeletion({
    t,
    teams,
    form,
    matchSummaries,
    isLoadingCompetitions,
    loadTeams,
    resetEditor,
    showList,
    setStatus: (message, tone) => { setStatusMessage(message); setStatusTone(tone); },
  });

  const handleCompareTeams = useCallback(async (teamA: ArchivedTeam, teamB: ArchivedTeam) => {
    try {
      setIsMergingTeams(true);
      const [aggA, aggB, allMatches] = await Promise.all([
        teamRepository.getById(teamA.id),
        teamRepository.getById(teamB.id),
        matchRepository.list(),
      ]);
      if (!aggA || !aggB) return;
      setMergeComparison(compareTeamsForMerge(aggA.team, aggA.roster.players, aggB.team, aggB.roster.players, allMatches));
      setShowMergePanel(true);
    } finally {
      setIsMergingTeams(false);
    }
  }, []);

  const handleExecuteTeamMerge = useCallback(async (keepId: string, discardId: string) => {
    try {
      setIsMergingTeams(true);
      const res = await executeTeamMerge(keepId, discardId, {
        getTeamAggregate: (id) => teamRepository.getById(id),
        updateTeam: (id, updates) => teamRepository.update(id, updates),
        deleteTeam: (id) => teamRepository.delete(id),
        listMatches: () => matchRepository.list(),
        updateMatch: (project) => matchRepository.update(project),
      });
      if (form.id === discardId) {
        resetEditor();
        showList();
      }
      setShowMergePanel(false);
      setMergeComparison(null);
      await loadTeams();
      setStatusTone('success');
      setStatusMessage(t('teamMergeDone', { matches: res.updatedMatches, players: res.mergedPlayers }));
    } catch (error) {
      console.error('Error merging teams:', error);
      setStatusTone('error');
      setStatusMessage(t('teamSaveFailed'));
    } finally {
      setIsMergingTeams(false);
    }
  }, [form.id, resetEditor, showList, loadTeams, t]);

  const handleSaveTeamDistinction = useCallback(async (updates: Array<{ id: string; name: string; club: string }>) => {
    try {
      setIsMergingTeams(true);
      for (const u of updates) {
        await teamRepository.update(u.id, { name: u.name });
      }
      setShowMergePanel(false);
      setMergeComparison(null);
      await loadTeams();
      setStatusTone('success');
      setStatusMessage(t('teamSaved'));
    } catch (error) {
      console.error('Error updating team distinction:', error);
      setStatusTone('error');
      setStatusMessage(t('teamSaveFailed'));
    } finally {
      setIsMergingTeams(false);
    }
  }, [loadTeams, t]);

  const selectedTeamLabel = form.id ? t('editTeam') : t('newTeam');

  const exportTeamList = teams.map((team) => ({ id: team.id, name: team.name }));

  return (
    <main className="teams-page">
      <div className="teams-page__container">
          <h1 className="teams-page__title">
            {t('teams')}
          </h1>
          <p className="teams-page__description">{t('teamsDescription')}</p>
          {!editing ? <div className="teams-page__actions">
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setShowImportModal(true)}
            >
              {t('importRoster')}
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setShowExportModal(true)}
              disabled={teams.length === 0}
            >
              {t('exportRoster')}
            </button>
          </div> : null}
          {!editing && statusMessage ? <p role="status" className={`teams-status ${statusTone === 'error' ? 'is-error' : 'is-success'}`}>{statusMessage}</p> : null}
          {!editing && showMergePanel ? (
            <TeamMergePanel
              similarGroups={similarGroups}
              competitionsByTeamId={competitionsByTeamId}
              matchesByTeamId={matchesByTeamId}
              comparison={mergeComparison}
              isBusy={isMergingTeams}
              onComparePair={(teamA, teamB) => { void handleCompareTeams(teamA, teamB); }}
              onBackToGroups={() => setMergeComparison(null)}
              onMerge={(keepId, discardId) => { void handleExecuteTeamMerge(keepId, discardId); }}
              onSaveDistinction={(updates) => { void handleSaveTeamDistinction(updates); }}
              onClose={() => { setShowMergePanel(false); setMergeComparison(null); }}
            />
          ) : null}
          <div className="teams-page__layout">
            <div ref={listRef} hidden={editing}>
            {isLoadingTeams ? (
              <LoadingProgressBanner progress={teamLoadProgress} />
            ) : (
            <>
            {isLoadingCompetitions && matchLoadProgress && matchLoadProgress.total > 0 ? (
              <LoadingProgressBanner progress={matchLoadProgress} prefix={t('competition')} marginBottom="0.75rem" />
            ) : null}
            <TeamLibraryTable
              onNew={handleCreateNewTeam}
              teams={teams}
              selectedId={form.id}
              competitionsByTeamId={competitionsByTeamId}
              matchCountByTeamId={matchCountByTeamId}
              isLoadingCompetitions={isLoadingCompetitions}
              similarCount={similarGroups.length}
              onFindSimilar={() => { setMergeComparison(null); setShowMergePanel(true); }}
              onCompareSelected={(selected) => {
                if (selected.length === 2) void handleCompareTeams(selected[0], selected[1]);
              }}
              onSelect={(team) => { void handleSelectTeam(team.id); }}
              onStudy={(team) => navigate('/team-analysis', { state: { teamId: team.id, teamName: team.name } })}
              onReport={(team) => navigate('/opponent-reports', { state: { opponent: { archivedTeamId: team.id, name: team.name } } })}
              onDelete={(team) => { void handleDeleteTeam(team.id, t('deleteTeamLibraryConfirmation')); }}
              onDeleteMany={(selectedTeams) => { void handleDeleteManyTeams(selectedTeams); }}
            />
            </>
            )}

            </div>
            {editing ? <AppPageLayout
              layoutRef={editorRef}
              className="teams-editor"
              headerClassName="teams-editor__header"
              contentClassName="teams-editor__content"
              footerClassName="teams-editor__footer"
              header={(
                <>
                  <div className="teams-editor__header-copy">
                    <h2 className="teams-editor__title">{selectedTeamLabel}</h2>
                    <button type="button" className="btn-secondary btn-small" onClick={closeEditor} disabled={saving}><ActionIcon name="undo" />{t('teamLibraryBack')}</button>
                  </div>
                  <div className="teams-editor__summary">
                    <div className="teams-summary-chip">
                      <span className="teams-summary-chip__label">{t('players')}</span>
                      <strong className="teams-summary-chip__value">{form.players.length}</strong>
                    </div>
                  </div>
                </>
              )}
              footer={(
                <>
                  {statusMessage ? (
                    <p className={`teams-status ${statusTone === 'error' ? 'is-error' : 'is-success'}`}>
                      {statusMessage}
                    </p>
                  ) : <span />}
                  {form.id ? (
                    <button type="button" className="btn-secondary btn-small" disabled={saving} onClick={handleDeleteSelectedTeam}>
                      {t('deleteTeam')}
                    </button>
                  ) : <span />}
                  <div className="teams-editor__footer-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={closeEditor} disabled={saving}>
                      {t('cancel')}
                    </button>
                    <button type="button" className="btn-primary" onClick={handleSaveTeam} disabled={saving}>
                      {t('saveTeam')}
                    </button>
                  </div>
                </>
              )}
            >
              <fieldset disabled={saving} className="teams-editor__fields">
                <div className="teams-editor__section" data-sequential-nav-root="true">
                  <label className="form-label" htmlFor="team-name">
                    {t('teamName')}
                  </label>
                  <input
                    id="team-name"
                    type="text"
                    value={form.name}
                    onChange={(event) => {
                      setStatusMessage('');
                      setForm({ ...form, name: event.target.value });
                    }}
                    onKeyDown={handleSequentialEnter}
                    placeholder={t('teamNamePlaceholder')}
                    className="form-input"
                  />
                  {errors.teamName && <p className="form-error">{errors.teamName}</p>}
                </div>

                <div className="teams-editor__section">
                  <div className="teams-editor__section-heading">
                    <h3 className="section-title">{t('teamStaff')}</h3>
                  </div>
                  <div className="teams-form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="head-coach">
                        {t('headCoach')}
                      </label>
                      <input
                        id="head-coach"
                        type="text"
                        value={form.staff.headCoach}
                        onChange={(event) => {
                          setStatusMessage('');
                          setForm({ ...form, staff: { ...form.staff, headCoach: event.target.value } });
                        }}
                        onKeyDown={handleSequentialEnter}
                        placeholder={t('coachNamePlaceholder')}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="assistant-coach">
                        {t('assistantCoach')}
                      </label>
                      <input
                        id="assistant-coach"
                        type="text"
                        value={form.staff.assistantCoach}
                        onChange={(event) => {
                          setStatusMessage('');
                          setForm({ ...form, staff: { ...form.staff, assistantCoach: event.target.value } });
                        }}
                        onKeyDown={handleSequentialEnter}
                        placeholder={t('coachNamePlaceholder')}
                        className="form-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="teams-editor__section">
                  <div className="teams-roster__header">
                    <div>
                      <h3 className="section-title">{t('archivedRoster')}</h3>
                      <p className="teams-roster__meta">{form.players.length} {t('players')}</p>
                    </div>
                    <div className="teams-roster__actions">
                      <button type="button" className="btn-secondary btn-small" onClick={handleAddPlayer}>
                        {t('addPlayer')}
                      </button>
                      <button type="button" className="btn-secondary btn-small" onClick={handleRandomFill}>
                        {t('randomFill')}
                      </button>
                    </div>
                  </div>

                  <QuickJerseyEntry onAdd={handleQuickAddPlayers} />

                  <div className="teams-roster__body">
                    {form.players.length === 0 ? (
                      <p className="teams-roster__empty">{t('noPlayersAdded')}</p>
                    ) : (
                      <div className="teams-roster__table-wrap" data-sequential-nav-root="true">
                        <table className="roster-table teams-roster__table">
                          <thead>
                            <tr>
                              <th>{t('jerseyNumber')}</th>
                              <th>{t('firstName')}</th>
                              <th>{t('lastName')}</th>
                              <th>{t('tacticalRole')}</th>
                              <th>{t('libero')}</th>
                              <th>{t('captain')}</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {form.players.map((player, index) => (
                              <tr key={player.id}>
                                <td>
                                  <input
                                    type="number"
                                    min="1"
                                    value={player.jerseyNumber || ''}
                                    onChange={(event) => handlePlayerChange(player.id, 'jerseyNumber', event.target.value)}
                                    onKeyDown={handleSequentialEnter}
                                    className={`table-input ${errors[`player_${index}_jersey`] ? 'form-input-error' : ''}`}
                                  />
                                  {errors[`player_${index}_jersey`] && (
                                    <p className="form-error">{errors[`player_${index}_jersey`]}</p>
                                  )}
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    value={player.firstName}
                                    onChange={(event) => handlePlayerChange(player.id, 'firstName', event.target.value)}
                                    onKeyDown={handleSequentialEnter}
                                    className={`table-input ${errors[`player_${index}_firstName`] ? 'form-input-error' : ''}`}
                                  />
                                  {errors[`player_${index}_firstName`] && (
                                    <p className="form-error">{errors[`player_${index}_firstName`]}</p>
                                  )}
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    value={player.lastName}
                                    onChange={(event) => handlePlayerChange(player.id, 'lastName', event.target.value)}
                                    onKeyDown={handleSequentialEnter}
                                    className={`table-input ${errors[`player_${index}_lastName`] ? 'form-input-error' : ''}`}
                                  />
                                  {errors[`player_${index}_lastName`] && (
                                    <p className="form-error">{errors[`player_${index}_lastName`]}</p>
                                  )}
                                </td>
                                <td>
                                  <select
                                    className="table-input"
                                    value={player.role ?? ''}
                                    onChange={(event) => handlePlayerChange(player.id, 'role', event.target.value)}
                                    aria-label={t('tacticalRole')}
                                  >
                                    <option value="">{t('roleNotSet')}</option>
                                    {TEAM_ROLE_OPTIONS.map(([role, group]) => (
                                      <option key={role} value={role}>{t(ROLE_GROUP_SHORT_KEYS[group])} - {t(ROLE_GROUP_NAME_KEYS[group])}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={player.isLibero || false}
                                    onChange={(event) => handlePlayerChange(player.id, 'isLibero', event.target.checked)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={player.isCaptain || false}
                                    onChange={(event) => handlePlayerChange(player.id, 'isCaptain', event.target.checked)}
                                  />
                                </td>
                                <td>
                                  <button type="button" className="btn-secondary btn-small remove-btn" onClick={() => handleRemovePlayer(player.id)} aria-label={t('removePlayer')} title={t('removePlayer')}>
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div ref={bottomRef} className="teams-editor__anchor" />
              </fieldset>
            </AppPageLayout> : null}
          </div>

          {showExportModal && (
            <RosterExportPanel
              teams={exportTeamList}
              defaultTeamId={form.id ?? undefined}
              onClose={() => setShowExportModal(false)}
              onExport={handleExportRoster}
            />
          )}

          {showImportModal && (
            <RosterImportModal
              onClose={() => setShowImportModal(false)}
              onImport={handleImportRoster}
            />
          )}
      </div>
    </main>
  );
}
