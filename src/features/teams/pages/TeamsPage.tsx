import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import {
  createArchivedPlayer,
  generatePlayerCode,
} from '@src/domain/team/factories';
import { teamRepository } from '@src/infrastructure/repositories';
import { DEFAULT_ROSTER } from '@src/lib/utils/player-code-generator';
import { useSequentialEnterNavigation } from '@src/lib/hooks/useSequentialEnterNavigation';

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
  const { t } = useTranslation();
  const [teams, setTeams] = useState<ArchivedTeam[]>([]);
  const [form, setForm] = useState<TeamFormData>(createEmptyTeamForm());
  const [errors, setErrors] = useState<TeamFieldError>({});
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusTone, setStatusTone] = useState<'error' | 'success' | null>(null);
  const editorRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const applyTeamRecordToForm = useCallback((team: ArchivedTeam, players: ArchivedPlayer[]) => {
    setForm({
      id: team.id,
      name: team.name,
      staff: team.staff,
      players,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    });
    setErrors({});
    setStatusTone(null);
  }, []);

  const setFormFromTeam = useCallback(
    async (team: ArchivedTeam) => {
      const teamRecord = await teamRepository.getById(team.id);
      if (!teamRecord) {
        return;
      }

      applyTeamRecordToForm(teamRecord.team, teamRecord.roster.players);
      setStatusMessage('');
    },
    [applyTeamRecordToForm],
  );

  const resetEditor = useCallback(() => {
    setForm(createEmptyTeamForm());
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

  const handleSelectTeam = useCallback(
    async (teamId: string) => {
      const team = teams.find((entry) => entry.id === teamId);
      if (!team) {
        return;
      }
      await setFormFromTeam(team);
    },
    [teams, setFormFromTeam],
  );

  const handleCreateNewTeam = () => {
    setForm(createEmptyTeamForm());
    setErrors({});
    setStatusMessage('');
    setStatusTone(null);
  };

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
    const currentPlayer = form.players.find((player) => player.id === playerId);

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

    if (!form.id || !currentPlayer) {
      return;
    }

    let updates: Partial<ArchivedPlayer>;

    if (field === 'jerseyNumber') {
      updates = {
        jerseyNumber: parseInt(value as string, 10) || 0,
      };
    } else if (field === 'firstName') {
      updates = {
        firstName: value as string,
        playerCode: generatePlayerCode(value as string, currentPlayer.lastName),
      };
    } else if (field === 'lastName') {
      updates = {
        lastName: value as string,
        playerCode: generatePlayerCode(currentPlayer.firstName, value as string),
      };
    } else {
      updates = {
        [field]: value as boolean,
      };
    }

    void (async () => {
      try {
        await teamRepository.updatePlayer(form.id as string, playerId, updates);
      } catch (error) {
        console.error('Error updating player:', error);
        await refreshSelectedTeam(form.id as string);
      }
    })();
  };

  const handleAddPlayer = () => {
    setStatusMessage('');
    setStatusTone(null);
    const player = createArchivedPlayer(0, '', '');

    if (!form.id) {
      setForm((current) => ({
        ...current,
        players: [...current.players, player],
      }));
    } else {
      void (async () => {
        try {
          await teamRepository.addPlayer(form.id as string, player);
          await refreshSelectedTeam(form.id as string);
        } catch (error) {
          console.error('Error adding player to team:', error);
        }
      })();
    }

    // Scroll to bottom after adding player
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
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

    if (!form.id) {
      setForm((current) => ({
        ...current,
        players: randomPlayers,
      }));
    } else {
      void (async () => {
        try {
          await teamRepository.update(form.id as string, { players: randomPlayers });
          await refreshSelectedTeam(form.id as string);
        } catch (error) {
          console.error('Error generating random roster:', error);
        }
      })();
    }

    // Scroll to bottom after filling roster
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const handleRemovePlayer = (playerId: string) => {
    setStatusMessage('');
    setStatusTone(null);

    if (!form.id) {
      setForm((current) => ({
        ...current,
        players: current.players.filter((player) => player.id !== playerId),
      }));
      return;
    }

    void (async () => {
      try {
        const updatedRecord = await teamRepository.deletePlayer(form.id as string, playerId);
        await loadTeams();
        applyTeamRecordToForm(updatedRecord.team, updatedRecord.roster.players);
      } catch (error) {
        console.error('Error deleting player from team:', error);
        await refreshSelectedTeam(form.id as string);
      }
    })();
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
      if (!player.firstName.trim()) {
        validationErrors[`player_${index}_firstName`] = t('firstNameRequired');
      }
      if (!player.lastName.trim()) {
        validationErrors[`player_${index}_lastName`] = t('lastNameRequired');
      }
    });

    return validationErrors;
  };

  const handleSaveTeam = async () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setStatusMessage(t('teamSaveValidationFailed'));
      setStatusTone('error');
      scrollToFirstError();
      return;
    }

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
      } else {
        await teamRepository.update(form.id, {
          name: form.name.trim(),
          staff: form.staff,
          players: form.players,
        });
        await refreshSelectedTeam(form.id);
      }

      setStatusMessage(t('teamSaved'));
      setStatusTone('success');
    } catch (error) {
      console.error('Error saving team:', error);
      setStatusMessage(t('teamSaveFailed'));
      setStatusTone('error');
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
      }

      setStatusMessage(t('teamDeleted'));
      setStatusTone('success');
    } catch (error) {
      console.error('Error deleting team:', error);
      setStatusMessage(t('teamDeleteFailed'));
      setStatusTone('error');
    }
  }, [form.id, resetEditor, t]);

  const handleDeleteSelectedTeam = useCallback(async () => {
    if (!form.id) {
      return;
    }

    await handleDeleteTeam(form.id, t('deleteTeamConfirmation'));
  }, [form.id, handleDeleteTeam, t]);

  const selectedTeamLabel = form.id ? t('editTeam') : t('newTeam');

  return (
    <main className="teams-page">
      <div className="teams-page__container">
          <h1 className="teams-page__title">
            {t('teams')}
          </h1>
          <p className="teams-page__description">{t('teamsDescription')}</p>
          <div className="teams-page__layout">
            <aside className="teams-sidebar">
              <div className="teams-sidebar__header">
                <div>
                  <h2 className="teams-sidebar__title">{t('teamLibrary')}</h2>
                  <p className="teams-sidebar__meta">{teams.length} {t('teams')}</p>
                </div>
              </div>
              {teams.length === 0 ? (
                <p className="teams-sidebar__empty">{t('noArchivedTeams')}</p>
              ) : (
                <ul className="teams-sidebar__list">
                  {teams.map((team) => (
                    <li key={team.id} className="teams-sidebar__list-item">
                      <button
                        type="button"
                        onClick={() => handleSelectTeam(team.id)}
                        className={`teams-sidebar__item ${team.id === form.id ? 'is-active' : ''}`}
                      >
                        <div className="teams-sidebar__item-row">
                          <span className="teams-sidebar__item-name">{team.name}</span>
                          <span className="teams-sidebar__item-meta">{team.staff.headCoach || t('notSpecified')}</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="teams-sidebar__delete"
                        aria-label={t('deleteTeamAriaLabel', { name: team.name })}
                        onClick={() => handleDeleteTeam(team.id, t('deleteTeamLibraryConfirmation'))}
                      >
                        {t('deleteTeamFromLibrary')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <AppPageLayout
              layoutRef={editorRef}
              className="teams-editor"
              headerClassName="teams-editor__header"
              contentClassName="teams-editor__content"
              footerClassName="teams-editor__footer"
              header={(
                <>
                  <div className="teams-editor__header-copy">
                    <h2 className="teams-editor__title">{selectedTeamLabel}</h2>
                    <p className="teams-editor__subtitle">{t('selectTeamForEdit')}</p>
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
                    <button type="button" className="btn-secondary btn-small" onClick={handleDeleteSelectedTeam}>
                      {t('deleteTeam')}
                    </button>
                  ) : <span />}
                  <div className="teams-editor__footer-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={handleCreateNewTeam}>
                      {t('newTeam')}
                    </button>
                    <button type="button" className="btn-primary" onClick={handleSaveTeam}>
                      {t('saveTeam')}
                    </button>
                  </div>
                </>
              )}
            >
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
            </AppPageLayout>
          </div>
      </div>
    </main>
  );
}
