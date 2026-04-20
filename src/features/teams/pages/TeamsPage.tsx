import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { AppNavigation } from '@src/app/components/AppNavigation';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import {
  createArchivedPlayer,
  createEmptyArchivedRoster,
  generatePlayerCode,
} from '@src/domain/team/factories';
import {
  deleteArchivedTeam,
  getAllArchivedTeams,
  getLatestRosterForTeam,
  saveArchivedRoster,
  saveArchivedTeam,
} from '@src/infrastructure/storage/archived-team-storage';

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

  const handlePlayerChange = (playerId: string, field: PlayerField, value: string | boolean) => {
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
    setForm((current) => ({
      ...current,
      players: [...current.players, createArchivedPlayer(0, '', '')],
    }));
  };

  const handleRemovePlayer = (playerId: string) => {
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

  const handleDeleteTeam = async () => {
    if (!form.id) {
      return;
    }

    const confirmed = window.confirm(t('deleteTeamConfirmation'));
    if (!confirmed) {
      return;
    }

    await deleteArchivedTeam(form.id);
    await loadTeams();
    handleCreateNewTeam();
    setStatusMessage(t('teamDeleted'));
  };

  const selectedTeamLabel = form.id ? t('editTeam') : t('newTeam');

  return (
    <>
      <AppNavigation />
      <main style={{ padding: 'var(--space-xl)', background: 'var(--color-background)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>
            {t('teams')}
          </h1>
          <p style={{ marginBottom: 'var(--space-lg)' }}>{t('teamsDescription')}</p>
          <div style={{ display: 'grid', gap: 'var(--space-xl)', gridTemplateColumns: '320px minmax(0, 1fr)' }}>
            <section style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', boxShadow: 'var(--shadow-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <h2 style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>{t('teamLibrary')}</h2>
                <button type="button" className="btn-primary btn-small" onClick={handleCreateNewTeam}>
                  {t('newTeam')}
                </button>
              </div>
              {teams.length === 0 ? (
                <p>{t('noArchivedTeams')}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-3xs)' }}>
                  {teams.map((team) => (
                    <li key={team.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectTeam(team.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: 'var(--space-3xs) var(--space-xs)',
                          background: team.id === form.id ? 'var(--color-primary)' : 'var(--color-background-muted)',
                          color: team.id === form.id ? 'white' : 'var(--color-text-primary)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2xs)' }}>
                          <span>{team.name}</span>
                          <span style={{ opacity: 0.7, fontSize: '0.95em' }}>{team.staff.headCoach || t('notSpecified')}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', boxShadow: 'var(--shadow-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                <div>
                  <h2 style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>{selectedTeamLabel}</h2>
                  <p style={{ margin: 'var(--space-2xs) 0 0', color: 'var(--color-text-secondary)' }}>{t('selectTeamForEdit')}</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                  {form.id ? (
                    <button type="button" className="btn-secondary btn-small" onClick={handleDeleteTeam}>
                      {t('deleteTeam')}
                    </button>
                  ) : null}
                  <button type="button" className="btn-primary" onClick={handleSaveTeam}>
                    {t('saveTeam')}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="form-label" htmlFor="team-name">
                  {t('teamName')}
                </label>
                <input
                  id="team-name"
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder={t('teamNamePlaceholder')}
                  className="form-input"
                />
                {errors.teamName && <p className="form-error">{errors.teamName}</p>}
              </div>

              <div style={{ display: 'grid', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <div>
                  <h3 className="section-title">{t('teamStaff')}</h3>
                  <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                    <label className="form-label" htmlFor="head-coach">
                      {t('headCoach')}
                    </label>
                    <input
                      id="head-coach"
                      type="text"
                      value={form.staff.headCoach}
                      onChange={(event) => setForm({ ...form, staff: { ...form.staff, headCoach: event.target.value } })}
                      placeholder={t('coachNamePlaceholder')}
                      className="form-input"
                    />
                    <label className="form-label" htmlFor="assistant-coach">
                      {t('assistantCoach')}
                    </label>
                    <input
                      id="assistant-coach"
                      type="text"
                      value={form.staff.assistantCoach}
                      onChange={(event) => setForm({ ...form, staff: { ...form.staff, assistantCoach: event.target.value } })}
                      placeholder={t('coachNamePlaceholder')}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                  <h3 className="section-title">{t('archivedRoster')}</h3>
                  <button type="button" className="btn-secondary btn-small" onClick={handleAddPlayer}>
                    {t('addPlayer')}
                  </button>
                </div>

                {form.players.length === 0 ? (
                  <p>{t('noPlayersAdded')}</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="roster-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                            <td style={{ whiteSpace: 'nowrap' }}>{player.playerCode}</td>
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

              {statusMessage ? <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-success)' }}>{statusMessage}</p> : null}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
