import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { AppNavigation } from '@src/app/components/AppNavigation';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import {
  createArchivedPlayer,
  createEmptyArchivedRoster,
  generatePlayerCode,
} from '@src/domain/team/factories';
import {
  deleteTeam,
  getAllArchivedTeams,
  getLatestRosterForTeam,
  saveArchivedRoster,
  saveArchivedTeam,
} from '@src/infrastructure/storage/archived-team-storage';
import { DEFAULT_ROSTER } from '@src/lib/utils/player-code-generator';

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
  const editorRef = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadTeams = useCallback(async () => {
    const archivedTeams = await getAllArchivedTeams();
    setTeams(archivedTeams);
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === form.id) ?? null,
    [form.id, teams],
  );

  const setFormFromTeam = useCallback(
    async (team: ArchivedTeam) => {
      const latestRoster = await getLatestRosterForTeam(team.id);
      setForm({
        id: team.id,
        name: team.name,
        staff: team.staff,
        players: latestRoster?.players ?? [],
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      });
      setErrors({});
      setStatusMessage('');
    },
    [],
  );

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
  };

  const resetEditor = useCallback(() => {
    setForm(createEmptyTeamForm());
    setErrors({});
  }, []);

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
    setForm((current) => ({
      ...current,
      players: [...current.players, createArchivedPlayer(0, '', '')],
    }));
    // Scroll to bottom after adding player
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const handleRandomFill = () => {
    // Shuffle the default roster and select 8 random players
    const shuffled = [...DEFAULT_ROSTER].sort(() => Math.random() - 0.5);
    const selectedPlayers = shuffled.slice(0, 8);

    // Create archived players with new IDs and regenerated codes
    const randomPlayers: ArchivedPlayer[] = selectedPlayers.map((player) =>
      createArchivedPlayer(player.jerseyNumber, player.firstName, player.lastName, player.isLibero, player.isCaptain)
    );

    setStatusMessage('');
    setForm((current) => ({
      ...current,
      players: randomPlayers,
    }));

    // Scroll to bottom after filling roster
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const handleRemovePlayer = (playerId: string) => {
    setStatusMessage('');
    setForm((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== playerId),
    }));
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
      scrollToFirstError();
      return;
    }

    const now = Date.now();
    const teamId = form.id ?? crypto.randomUUID();
    const roster = createEmptyArchivedRoster(teamId);
    roster.players = form.players;

    await saveArchivedRoster(roster);

    const rosterIds = selectedTeam?.rosterIds ?? [];
    const updatedRosterIds = rosterIds.includes(roster.id) ? rosterIds : [...rosterIds, roster.id];

    const teamToSave: ArchivedTeam = {
      id: teamId,
      name: form.name.trim(),
      staff: form.staff,
      rosterIds: updatedRosterIds,
      createdAt: form.id ? form.createdAt : now,
      updatedAt: now,
    };

    await saveArchivedTeam(teamToSave);
    await loadTeams();

    setForm((current) => ({
      ...current,
      id: teamToSave.id,
      createdAt: teamToSave.createdAt,
      updatedAt: teamToSave.updatedAt,
    }));
    setErrors({});
    setStatusMessage(t('teamSaved'));
  };

  const handleDeleteTeam = useCallback(async (
    teamId: string,
    confirmationMessage: string,
  ) => {
    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) {
      return;
    }

    await deleteTeam(teamId);
    setTeams((currentTeams) => currentTeams.filter((team) => team.id !== teamId));

    if (form.id === teamId) {
      resetEditor();
    }

    setStatusMessage(t('teamDeleted'));
  }, [form.id, resetEditor, t]);

  const handleDeleteSelectedTeam = useCallback(async () => {
    if (!form.id) {
      return;
    }

    await handleDeleteTeam(form.id, t('deleteTeamConfirmation'));
  }, [form.id, handleDeleteTeam, t]);

  const selectedTeamLabel = form.id ? t('editTeam') : t('newTeam');

  return (
    <>
      <AppNavigation />
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
                <button type="button" className="btn-primary btn-small" onClick={handleCreateNewTeam}>
                  {t('newTeam')}
                </button>
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

            <section ref={editorRef} className="teams-editor">
              <div className="teams-editor__header">
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
              </div>

              <div className="teams-editor__section">
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
                    <div className="teams-roster__table-wrap">
                      <table className="roster-table teams-roster__table">
                        <thead>
                          <tr>
                            <th>{t('jerseyNumber')}</th>
                            <th>{t('firstName')}</th>
                            <th>{t('lastName')}</th>
                            <th>{t('playerCode')}</th>
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
                                  className={`table-input ${errors[`player_${index}_lastName`] ? 'form-input-error' : ''}`}
                                />
                                {errors[`player_${index}_lastName`] && (
                                  <p className="form-error">{errors[`player_${index}_lastName`]}</p>
                                )}
                              </td>
                              <td className="teams-roster__code-cell">{player.playerCode}</td>
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

              {statusMessage ? (
                <p className={`teams-status ${Object.keys(errors).length > 0 ? 'is-error' : 'is-success'}`}>
                  {statusMessage}
                </p>
              ) : null}

              <div className="teams-editor__footer">
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
              </div>

              <div ref={bottomRef} className="teams-editor__anchor" />
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
