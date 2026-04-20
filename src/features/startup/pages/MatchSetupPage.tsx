import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '../../../app/store/app-store';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { saveMatchProject } from '@src/infrastructure/storage/match-project-storage';
import {
  saveArchivedTeam,
  saveArchivedRoster,
  getArchivedTeamByName,
  getLatestRosterForTeam,
} from '@src/infrastructure/storage/archived-team-storage';
import { saveCompetitionName } from '@src/infrastructure/storage/archived-competition-storage';
import { CompetitionNameInput } from '../components/CompetitionNameInput';
import { MatchTeamSelection } from '../components/MatchTeamSelection';
import {
  createEmptyArchivedRoster,
  createEmptyArchivedTeam,
  createMatchPlayersFromArchived,
  generatePlayerCode,
} from '@src/domain/team/factories';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedTeam, MatchPlayer } from '@src/domain/team/types';
import { validateMatchRoster } from '@src/lib/validation/roster-validation';

interface TeamSelectionState {
  teamName: string;
  archivedTeam: ArchivedTeam | null;
  players: MatchPlayer[];
}

interface MatchSetupData {
  competitionName: string;
  matchDate: string;
  startTime: string;
  venue: string;
  homeTeam: TeamSelectionState;
  awayTeam: TeamSelectionState;
}

const initialTeamSelection: TeamSelectionState = {
  teamName: '',
  archivedTeam: null,
  players: [],
};

const createEmptyMatchPlayer = (): MatchPlayer => ({
  id: crypto.randomUUID(),
  jerseyNumber: 0,
  firstName: '',
  lastName: '',
  shortName: '',
  playerCode: '---',
  isLibero: false,
  isCaptain: false,
  isSelectedForMatch: false,
});

export function MatchSetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setActiveProject = useAppStore((state) => state.setActiveProject);

  const [formData, setFormData] = useState<MatchSetupData>({
    competitionName: '',
    matchDate: '',
    startTime: '',
    venue: '',
    homeTeam: initialTeamSelection,
    awayTeam: initialTeamSelection,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [createdProject, setCreatedProject] = useState<MatchProject | null>(null);

  useEffect(() => {
    const now = new Date();
    setFormData((prev) => ({
      ...prev,
      matchDate: now.toISOString().split('T')[0],
      startTime: now.toTimeString().slice(0, 5),
    }));
  }, []);

  const getTeamKey = (teamType: 'home' | 'away') =>
    teamType === 'home' ? 'homeTeam' : 'awayTeam';

  const updateTeamState = (
    teamType: 'home' | 'away',
    updater: (team: TeamSelectionState) => TeamSelectionState,
  ) => {
    const key = getTeamKey(teamType);
    setFormData((prev) => ({
      ...prev,
      [key]: updater(prev[key as keyof MatchSetupData] as TeamSelectionState),
    } as MatchSetupData));
  };

  const loadArchivedRoster = async (teamId: string) => {
    const archivedRoster = await getLatestRosterForTeam(teamId);
    if (!archivedRoster) {
      return [] as MatchPlayer[];
    }

    return createMatchPlayersFromArchived(archivedRoster.players).map((player) => ({
      ...player,
      isSelectedForMatch: false,
      shortName: `${player.firstName.charAt(0)}. ${player.lastName}`,
      isFromArchive: true,
    }));
  };

  const handleInputChange = (field: keyof MatchSetupData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value } as MatchSetupData));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleTeamNameChange = (teamType: 'home' | 'away', name: string) => {
    updateTeamState(teamType, (team) => ({
      ...team,
      teamName: name,
      archivedTeam: null,
    }));

    const errorKey = teamType === 'home' ? 'homeTeamName' : 'awayTeamName';
    if (errors[errorKey]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
  };

  const handleSelectArchivedTeam = async (teamType: 'home' | 'away', team: ArchivedTeam) => {
    const rosterPlayers = await loadArchivedRoster(team.id);
    updateTeamState(teamType, () => ({
      teamName: team.name,
      archivedTeam: team,
      players: rosterPlayers,
    }));
  };

  const handleCreateNewTeam = async (teamType: 'home' | 'away') => {
    const teamName = formData[getTeamKey(teamType)].teamName.trim();
    if (!teamName) {
      return;
    }

    const existingArchive = await getArchivedTeamByName(teamName);
    if (existingArchive) {
      await handleSelectArchivedTeam(teamType, existingArchive);
      return;
    }

    const newTeam = createEmptyArchivedTeam(teamName);
    await saveArchivedTeam(newTeam);
    updateTeamState(teamType, (team) => ({
      ...team,
      archivedTeam: newTeam,
    }));
  };

  const handleAddPlayer = (teamType: 'home' | 'away') => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: [...team.players, createEmptyMatchPlayer()],
    }));
  };

  const handlePlayerFieldChange = (
    teamType: 'home' | 'away',
    index: number,
    field: 'firstName' | 'lastName' | 'jerseyNumber' | 'isLibero' | 'isCaptain',
    value: string | boolean,
  ) => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: team.players.map((player, playerIndex) => {
        if (playerIndex !== index) return player;

        const updatedPlayer = { ...player };
        if (field === 'firstName' || field === 'lastName') {
          updatedPlayer[field] = value as string;
          updatedPlayer.playerCode = generatePlayerCode(
            field === 'firstName' ? (value as string) : updatedPlayer.firstName,
            field === 'lastName' ? (value as string) : updatedPlayer.lastName,
          );
        } else if (field === 'jerseyNumber') {
          updatedPlayer.jerseyNumber = parseInt(value as string, 10) || 0;
        } else {
          updatedPlayer[field] = value as boolean;
        }

        return updatedPlayer;
      }),
    }));
  };

  const handleTogglePlayerSelected = (teamType: 'home' | 'away', playerId: string) => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: team.players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              isSelectedForMatch: !player.isSelectedForMatch,
              isLibero: player.isSelectedForMatch ? false : player.isLibero,
              isCaptain: player.isSelectedForMatch ? false : player.isCaptain,
            }
          : player,
      ),
    }));
  };

  const handleTogglePlayerLibero = (teamType: 'home' | 'away', playerId: string) => {
    updateTeamState(teamType, (team) => {
      const selectedLiberos = team.players.filter((player) => player.isSelectedForMatch && player.isLibero).length;
      return {
        ...team,
        players: team.players.map((player) => {
          if (player.id !== playerId) return player;
          const isLibero = !player.isLibero && selectedLiberos < 2;
          return {
            ...player,
            isLibero,
          };
        }),
      };
    });
  };

  const handleTogglePlayerCaptain = (teamType: 'home' | 'away', playerId: string) => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: team.players.map((player) => ({
        ...player,
        isCaptain: player.id === playerId,
      })),
    }));
  };

  const handleRemovePlayer = (teamType: 'home' | 'away', index: number) => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: team.players.filter((_, playerIndex) => playerIndex !== index),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.matchDate) {
      newErrors.matchDate = t('matchDateRequired');
    }

    if (!formData.startTime) {
      newErrors.startTime = t('startTimeRequired');
    }

    if (!formData.homeTeam.teamName.trim()) {
      newErrors.homeTeamName = t('homeTeamNameRequired');
    }

    if (!formData.awayTeam.teamName.trim()) {
      newErrors.awayTeamName = t('awayTeamNameRequired');
    }

    const validateTeam = (team: TeamSelectionState, prefix: 'home' | 'away') => {
      team.players.forEach((player, index) => {
        if (!player.isSelectedForMatch) return;
        if (!player.jerseyNumber) {
          newErrors[`${prefix}Team_player_${index}_jersey`] = t('jerseyNumberRequired');
        }
        if (!player.firstName.trim()) {
          newErrors[`${prefix}Team_player_${index}_firstName`] = t('firstNameRequired');
        }
        if (!player.lastName.trim()) {
          newErrors[`${prefix}Team_player_${index}_lastName`] = t('lastNameRequired');
        }
      });

      const selectedPlayers = team.players.filter((player) => player.isSelectedForMatch);
      const validation = validateMatchRoster(selectedPlayers);
      if (!validation.isValid) {
        newErrors[`${prefix}Team_roster`] = validation.errors.map((key) => t(key as any)).join(', ');
      }
    };

    validateTeam(formData.homeTeam, 'home');
    validateTeam(formData.awayTeam, 'away');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const normalizeArchiveId = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `archive-${Date.now()}`;

  const saveTeamArchiveIfNeeded = async (team: TeamSelectionState) => {
    const teamName = team.teamName.trim();
    if (!teamName) {
      return;
    }

    let archivedTeam = team.archivedTeam;
    if (!archivedTeam) {
      archivedTeam = await getArchivedTeamByName(teamName);
      if (!archivedTeam) {
        archivedTeam = createEmptyArchivedTeam(teamName);
        await saveArchivedTeam(archivedTeam);
      }
    }

    if (archivedTeam.rosterIds.length === 0 && team.players.length > 0) {
      const newRoster = createEmptyArchivedRoster(archivedTeam.id);
      newRoster.players = team.players.map((player) => ({
        id: player.id,
        jerseyNumber: player.jerseyNumber,
        firstName: player.firstName,
        lastName: player.lastName,
        playerCode: player.playerCode,
        isLibero: player.isLibero,
        isCaptain: player.isCaptain,
      }));

      await saveArchivedRoster(newRoster);
      await saveArchivedTeam({
        ...archivedTeam,
        rosterIds: [newRoster.id],
        updatedAt: Date.now(),
      });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const project = createEmptyMatchProject();
      const playedAt = new Date(`${formData.matchDate}T${formData.startTime}:00`).toISOString();

      project.metadata.competition = formData.competitionName.trim() || undefined;
      project.metadata.venue = formData.venue.trim() || undefined;
      project.metadata.playedAt = playedAt;
      project.updatedAt = Date.now();

      project.homeTeam.name = formData.homeTeam.teamName.trim();
      project.homeTeam.staff = formData.homeTeam.archivedTeam?.staff ?? { headCoach: '', assistantCoach: '' };
      project.homeTeam.players = formData.homeTeam.players
        .filter((player) => player.isSelectedForMatch)
        .map((player) => ({
          ...player,
          shortName: `${player.firstName.charAt(0)}. ${player.lastName}`,
          role: player.isLibero ? 'libero' : undefined,
        }));

      project.awayTeam.name = formData.awayTeam.teamName.trim();
      project.awayTeam.staff = formData.awayTeam.archivedTeam?.staff ?? { headCoach: '', assistantCoach: '' };
      project.awayTeam.players = formData.awayTeam.players
        .filter((player) => player.isSelectedForMatch)
        .map((player) => ({
          ...player,
          shortName: `${player.firstName.charAt(0)}. ${player.lastName}`,
          role: player.isLibero ? 'libero' : undefined,
        }));

      await saveMatchProject(project);
      const competitionName = formData.competitionName.trim();
      if (competitionName) {
        await saveCompetitionName({
          id: normalizeArchiveId(competitionName),
          name: competitionName,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      await Promise.all([
        saveTeamArchiveIfNeeded(formData.homeTeam),
        saveTeamArchiveIfNeeded(formData.awayTeam),
      ]);

      setActiveProject(project);
      setCreatedProject(project);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error creating match project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToScouting = () => {
    navigate('/scouting');
  };

  const handleBackToSetup = () => {
    setShowConfirmation(false);
    setCreatedProject(null);
  };

  if (showConfirmation && createdProject) {
    return (
      <div className="match-setup-page">
        <div className="match-setup-container">
          <header className="match-setup-header">
            <h1 className="match-setup-title">{t('matchCreated')}</h1>
            <p className="match-setup-subtitle">{t('reviewMatchDetails')}</p>
          </header>

          <div className="confirmation-content">
            <div className="match-details-card">
              <h3 className="section-title">{t('matchDetails')}</h3>
              <div className="detail-row">
                <span className="detail-label">{t('competitionName')}:</span>
                <span className="detail-value">{createdProject.metadata.competition || t('notSpecified')}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t('matchDate')}:</span>
                <span className="detail-value">
                  {createdProject.metadata.playedAt
                    ? `${new Date(createdProject.metadata.playedAt).toLocaleDateString()} ${new Date(createdProject.metadata.playedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : t('notSpecified')}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t('venue')}:</span>
                <span className="detail-value">{createdProject.metadata.venue || t('notSpecified')}</span>
              </div>
            </div>

            <div className="teams-summary">
              <div className="team-summary-card">
                <h4 className="team-name">{createdProject.homeTeam.name}</h4>
                <div className="team-details">
                  <div className="detail-row">
                    <span className="detail-label">{t('players')}:</span>
                    <span className="detail-value">{createdProject.homeTeam.players.length}</span>
                  </div>
                </div>
              </div>

              <div className="vs-divider">VS</div>

              <div className="team-summary-card">
                <h4 className="team-name">{createdProject.awayTeam.name}</h4>
                <div className="team-details">
                  <div className="detail-row">
                    <span className="detail-label">{t('players')}:</span>
                    <span className="detail-value">{createdProject.awayTeam.players.length}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="confirmation-actions">
              <button type="button" onClick={handleBackToSetup} className="btn-secondary">
                {t('back')}
              </button>
              <button type="button" onClick={handleProceedToScouting} className="btn-primary">
                {t('startScouting')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="match-setup-page">
      <div className="match-setup-container">
        <header className="match-setup-header">
          <h1 className="match-setup-title">{t('createNewMatch')}</h1>
          <p className="match-setup-subtitle">{t('matchSetupDescription')}</p>
        </header>

        <form onSubmit={handleSubmit} className="match-setup-form">
          <div className="form-group">
            <label htmlFor="competitionName" className="form-label">
              {t('competitionName')}
            </label>
            <CompetitionNameInput
              id="competitionName"
              value={formData.competitionName}
              onChange={(value) => handleInputChange('competitionName', value)}
              placeholder={t('competitionNamePlaceholder')}
              disabled={false}
              onSelectSuggestion={() => undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="matchDate" className="form-label">
              {t('matchDate')}
            </label>
            <input
              id="matchDate"
              type="date"
              value={formData.matchDate}
              onChange={(event) => handleInputChange('matchDate', event.target.value)}
              className={`form-input ${errors.matchDate ? 'form-input-error' : ''}`}
            />
            {errors.matchDate && <span className="form-error">{errors.matchDate}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="startTime" className="form-label">
              {t('startTime')}
            </label>
            <input
              id="startTime"
              type="time"
              value={formData.startTime}
              onChange={(event) => handleInputChange('startTime', event.target.value)}
              className={`form-input ${errors.startTime ? 'form-input-error' : ''}`}
            />
            {errors.startTime && <span className="form-error">{errors.startTime}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="venue" className="form-label">
              {t('venue')}
            </label>
            <input
              id="venue"
              type="text"
              value={formData.venue}
              onChange={(event) => handleInputChange('venue', event.target.value)}
              placeholder={t('venuePlaceholder')}
              className="form-input"
            />
          </div>

          <div className="teams-section">
            <h3 className="section-title">{t('teams')}</h3>
            <MatchTeamSelection
              teamType="home"
              teamName={formData.homeTeam.teamName}
              archivedTeam={formData.homeTeam.archivedTeam}
              players={formData.homeTeam.players}
              onTeamNameChange={(name) => handleTeamNameChange('home', name)}
              onSelectTeam={(team) => handleSelectArchivedTeam('home', team)}
              onCreateNewTeam={() => handleCreateNewTeam('home')}
              onAddPlayer={() => handleAddPlayer('home')}
              onPlayerFieldChange={(index, field, value) => handlePlayerFieldChange('home', index, field, value)}
              onPlayerToggleSelected={(playerId) => handleTogglePlayerSelected('home', playerId)}
              onPlayerToggleLibero={(playerId) => handleTogglePlayerLibero('home', playerId)}
              onPlayerToggleCaptain={(playerId) => handleTogglePlayerCaptain('home', playerId)}
              onPlayerRemove={(index) => handleRemovePlayer('home', index)}
              rosterError={errors.homeTeam_roster}
            />

            <MatchTeamSelection
              teamType="away"
              teamName={formData.awayTeam.teamName}
              archivedTeam={formData.awayTeam.archivedTeam}
              players={formData.awayTeam.players}
              onTeamNameChange={(name) => handleTeamNameChange('away', name)}
              onSelectTeam={(team) => handleSelectArchivedTeam('away', team)}
              onCreateNewTeam={() => handleCreateNewTeam('away')}
              onAddPlayer={() => handleAddPlayer('away')}
              onPlayerFieldChange={(index, field, value) => handlePlayerFieldChange('away', index, field, value)}
              onPlayerToggleSelected={(playerId) => handleTogglePlayerSelected('away', playerId)}
              onPlayerToggleLibero={(playerId) => handleTogglePlayerLibero('away', playerId)}
              onPlayerToggleCaptain={(playerId) => handleTogglePlayerCaptain('away', playerId)}
              onPlayerRemove={(index) => handleRemovePlayer('away', index)}
              rosterError={errors.awayTeam_roster}
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/')} className="btn-secondary" disabled={isSubmitting}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? t('creating') : t('createMatch')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
