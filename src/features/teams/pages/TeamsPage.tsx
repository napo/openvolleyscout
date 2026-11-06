import { ActionIcon } from '@src/components/ActionIcon';
import { TeamLibraryTable } from './TeamLibraryTable';
import { useIsOpponentReportsEnabled } from '@src/app/store/experimental-features-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import {
  createArchivedPlayer,
  generatePlayerCode,
} from '@src/domain/team/factories';
import { teamRepository } from '@src/infrastructure/repositories';
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

type TeamFormData = {
  id: string | null;
  name: string;
  staff: {
    headCoach: string;
    assistantCoach: string;
  };
  players: ArchivedPlayer[];
  createdAt: number;
  updatedAt: number;
};

type TeamFieldError = Record<string, string>;
type PlayerField = 'jerseyNumber' | 'firstName' | 'lastName' | 'isLibero' | 'isCaptain';
const RANDOM_ROSTER_SIZE = 14;

const createEmptyTeamForm = (): TeamFormData => ({
  id: null,
  name: '',
  staff: { headCoach: '', assistantCoach: '' },
  players: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function TeamsPage() {
  const opponentReportsEnabled = useIsOpponentReportsEnabled();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<ArchivedTeam[]>([]);
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
  const editorRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handleSequentialEnter = useSequentialEnterNavigation();

  const loadTeams = useCallback(async () => {
    try {
      const archivedTeams = await teamRepository.list();
      setTeams(archivedTeams);
    } catch (error) {
      console.error('Error loading teams:', error);
      setStatusTone('error');
      setStatusMessage(t('teamLoadFailed'));
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

  const closeEditor = () => {
    if (saving || (dirty && !window.confirm(t('teamLibraryDiscard')))) return;
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

  const validateForm = (): TeamFieldError => {
    const validationErrors: TeamFieldError = {};

    if (!form.name.trim()) {
      validationErrors.teamName = t('teamNameRequired');
    }

    form.players.forEach((player, index) => {
      if (!player.jerseyNumber || player.jerseyNumber <= 0) {
        validationErrors[`player_${index}_jersey`] = t('jerseyNumberRequired');
      }
    });

    return validationErrors;
  };

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

  const handleDeleteTeam = useCallback(async (
    teamId: string,
    confirmationMessage: string,
  ) => {
    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) {
      return;
    }

    try {
      await teamRepository.delete(teamId);
      await loadTeams();

      if (form.id === teamId) {
        resetEditor();
        showList();
      }

      setStatusMessage(t('teamDeleted'));
      setStatusTone('success');
    } catch (error) {
      console.error('Error deleting team:', error);
      setStatusMessage(t('teamDeleteFailed'));
      setStatusTone('error');
    }
  }, [form.id, resetEditor, loadTeams, showList, t]);

  const handleDeleteSelectedTeam = useCallback(async () => {
    if (!form.id) {
      return;
    }

    await handleDeleteTeam(form.id, t('deleteTeamConfirmation'));
  }, [form.id, handleDeleteTeam, t]);

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
          <div className="teams-page__layout">
            <div ref={listRef} hidden={editing}>
            <TeamLibraryTable onNew={handleCreateNewTeam} teams={teams} selectedId={form.id} reportsEnabled={opponentReportsEnabled}
              onSelect={(team) => { void handleSelectTeam(team.id); }}
              onStudy={(team) => navigate('/team-analysis', { state: { teamId: team.id, teamName: team.name } })}
              onReport={(team) => navigate('/opponent-reports', { state: { opponent: { archivedTeamId: team.id, name: team.name } } })}
              onDelete={(team) => { void handleDeleteTeam(team.id, t('deleteTeamLibraryConfirmation')); }}
            />

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
                                  <button type="button" className="btn-secondary btn-small" onClick={() => handleRemovePlayer(player.id)}>
                                    {t('removePlayer')}
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
