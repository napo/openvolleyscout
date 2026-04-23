import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '../../../app/store/app-store';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import {
  createMatchRosterSelectionFromArchived,
  createMatchRosterSelectionPlayer,
  getMatchRoster,
  getMatchTeamSelection,
  getMatchTeamSnapshot,
  setMatchTeamSelection,
  createMatchTeamSelection,
  normalizeMatchProject,
} from '@src/domain/match';
import {
  competitionRepository,
  matchRepository,
  teamRepository,
} from '@src/infrastructure/repositories';
import { CompetitionNameInput } from '../components/CompetitionNameInput';
import { MatchTeamSelection } from '../components/MatchTeamSelection';
import { MatchReadinessSection } from '../components/MatchReadinessSection';
import { createEmptyArchivedTeam, generatePlayerCode } from '@src/domain/team/factories';
import type {
  MatchProject,
  MatchRosterPlayer,
  MatchRosterSelectionPlayer,
  MatchTeamSelection as MatchTeamSelectionModel,
} from '@src/domain/match/types';
import type { TeamStaff } from '@src/domain/roster/types';
import type { ArchivedTeam } from '@src/domain/team/types';
import { evaluateMatchReadiness } from '@src/lib/validation/match-readiness';
import { getMatchRosterErrorKeys, validateMatchRoster } from '@src/lib/validation/roster-validation';

interface TeamSelectionState {
  teamName: string;
  archivedTeam: ArchivedTeam | null;
  staff: TeamStaff;
  players: MatchRosterSelectionPlayer[];
}

function toPersistedRosterPlayers(players: MatchRosterSelectionPlayer[]): MatchRosterPlayer[] {
  return players
    .filter((player) => player.isSelectedForMatch)
    .map((player) => ({
      id: player.id,
      jerseyNumber: player.jerseyNumber,
      firstName: player.firstName,
      lastName: player.lastName,
      shortName: `${player.firstName.charAt(0)}. ${player.lastName}`,
      playerCode: player.playerCode,
      role: player.isLibero ? 'libero' : undefined,
      isCaptain: player.isCaptain,
      isLibero: player.isLibero,
      archivedPlayerId: player.archivedPlayerId,
      archivedTeamId: player.archivedTeamId,
      source: player.source,
    }));
}

function createSelectionFromTeamState(
  teamId: string,
  teamCode: string,
  teamState: TeamSelectionState,
): MatchTeamSelectionModel {
  return createMatchTeamSelection({
    teamId,
    teamName: teamState.teamName.trim(),
    teamCode,
    archivedTeamId: teamState.archivedTeam?.id,
    staff: teamState.archivedTeam?.staff ?? teamState.staff,
    roster: toPersistedRosterPlayers(teamState.players).map((player) => ({
      ...player,
      archivedTeamId: player.archivedTeamId ?? teamState.archivedTeam?.id,
    })),
  });
}

interface MatchSetupData {
  competitionName: string;
  matchDate: string;
  startTime: string;
  venue: string;
  homeTeam: TeamSelectionState;
  awayTeam: TeamSelectionState;
}

function createEmptyTeamSelectionState(): TeamSelectionState {
  return {
    teamName: '',
    archivedTeam: null,
    staff: { headCoach: '', assistantCoach: '' },
    players: [],
  };
}

function createEmptyMatchSetupData(): MatchSetupData {
  const now = new Date();

  return {
    competitionName: '',
    matchDate: now.toISOString().split('T')[0],
    startTime: now.toTimeString().slice(0, 5),
    venue: '',
    homeTeam: createEmptyTeamSelectionState(),
    awayTeam: createEmptyTeamSelectionState(),
  };
}

const createEmptyMatchPlayer = (): MatchRosterSelectionPlayer =>
  createMatchRosterSelectionPlayer({
    id: crypto.randomUUID(),
    jerseyNumber: 0,
    firstName: '',
    lastName: '',
    shortName: '',
    playerCode: '---',
    isLibero: false,
    isCaptain: false,
  });

function cloneProject(project: MatchProject): MatchProject {
  if (typeof structuredClone === 'function') {
    return structuredClone(project);
  }

  return JSON.parse(JSON.stringify(project)) as MatchProject;
}

function createTeamSelectionStateFromProject(
  project: MatchProject,
  teamType: 'home' | 'away',
): TeamSelectionState {
  const selection = getMatchTeamSelection(project, teamType);
  const team = getMatchTeamSnapshot(project, teamType);

  return {
    teamName: team.name,
    archivedTeam: null,
    staff: selection.staff,
    players: getMatchRoster(project, teamType).map((player) => createMatchRosterSelectionPlayer(player, {
      archivedPlayerId: player.archivedPlayerId,
      archivedTeamId: player.archivedTeamId,
      isSelectedForMatch: true,
      isFromArchive: player.source === 'archived_roster',
    })),
  };
}

function createFormDataFromProject(project: MatchProject): MatchSetupData {
  return {
    competitionName: project.metadata.competition ?? '',
    matchDate: project.metadata.playedAt?.slice(0, 10) ?? '',
    startTime: project.metadata.playedAt ? new Date(project.metadata.playedAt).toTimeString().slice(0, 5) : '',
    venue: project.metadata.venue ?? '',
    homeTeam: createTeamSelectionStateFromProject(project, 'home'),
    awayTeam: createTeamSelectionStateFromProject(project, 'away'),
  };
}

export function MatchSetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const setActiveProject = useAppStore((state) => state.setActiveProject);

  const [formData, setFormData] = useState<MatchSetupData>(() => createEmptyMatchSetupData());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [createdProject, setCreatedProject] = useState<MatchProject | null>(null);
  const createdHomeTeam = createdProject ? getMatchTeamSnapshot(createdProject, 'home') : null;
  const createdAwayTeam = createdProject ? getMatchTeamSnapshot(createdProject, 'away') : null;
  const createdHomeRoster = createdProject ? getMatchRoster(createdProject, 'home') : [];
  const createdAwayRoster = createdProject ? getMatchRoster(createdProject, 'away') : [];
  const createdProjectReadiness = evaluateMatchReadiness(createdProject);

  useEffect(() => {
    if (showConfirmation) {
      return;
    }

    if (!activeProject) {
      setFormData(createEmptyMatchSetupData());
      setErrors({});
      return;
    }

    setFormData(createFormDataFromProject(activeProject));
    setErrors({});
  }, [activeProject, showConfirmation]);

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
    const teamRecord = await teamRepository.getById(teamId);
    if (!teamRecord) {
      return [] as MatchRosterSelectionPlayer[];
    }

    return createMatchRosterSelectionFromArchived(teamRecord.roster.players, teamId);
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
      staff: team.staff,
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
      staff: team.staff,
      players: rosterPlayers,
    }));
  };

  const handleCreateNewTeam = async (teamType: 'home' | 'away') => {
    const teamName = formData[getTeamKey(teamType)].teamName.trim();
    if (!teamName) {
      return;
    }

    const existingArchive = await teamRepository.getByName(teamName);
    if (existingArchive) {
      await handleSelectArchivedTeam(teamType, existingArchive.team);
      return;
    }

    const newTeam = createEmptyArchivedTeam(teamName);
    const createdTeamRecord = await teamRepository.create({
      id: newTeam.id,
      teamCode: newTeam.teamCode,
      name: newTeam.name,
      staff: newTeam.staff,
      createdAt: newTeam.createdAt,
      updatedAt: newTeam.updatedAt,
    });
    updateTeamState(teamType, (team) => ({
      ...team,
      archivedTeam: createdTeamRecord.team,
      staff: createdTeamRecord.team.staff,
    }));
  };

  const handleAddPlayer = (teamType: 'home' | 'away') => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: [...team.players, createEmptyMatchPlayer()],
    }));
  };

  const handleToggleSelectAll = (teamType: 'home' | 'away') => {
    updateTeamState(teamType, (team) => {
      const shouldSelectAll = team.players.some((player) => !player.isSelectedForMatch);

      return {
        ...team,
        players: team.players.map((player) => ({
          ...player,
          isSelectedForMatch: shouldSelectAll,
          isLibero: shouldSelectAll ? player.isLibero : false,
          isCaptain: shouldSelectAll ? player.isCaptain : false,
        })),
      };
    });
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

  const getLiveRosterError = (team: TeamSelectionState): string | undefined => {
    const selectedPlayers = team.players.filter((player) => player.isSelectedForMatch);
    if (selectedPlayers.length === 0) {
      return undefined;
    }

    const errorKeys = getMatchRosterErrorKeys(selectedPlayers);
    if (errorKeys.length === 0) {
      return undefined;
    }

    return errorKeys.map((key) => t(key as any)).join(', ');
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

  const saveTeamArchiveIfNeeded = async (team: TeamSelectionState) => {
    const teamName = team.teamName.trim();
    if (!teamName) {
      return;
    }

    let archivedTeam = team.archivedTeam;
    if (!archivedTeam) {
      const existingRecord = await teamRepository.getByName(teamName);
      archivedTeam = existingRecord?.team ?? null;
      if (!archivedTeam) {
        archivedTeam = createEmptyArchivedTeam(teamName);
        const createdRecord = await teamRepository.create({
          id: archivedTeam.id,
          teamCode: archivedTeam.teamCode,
          name: archivedTeam.name,
          staff: team.staff,
          createdAt: archivedTeam.createdAt,
          updatedAt: archivedTeam.updatedAt,
        });
        archivedTeam = createdRecord.team;
      }
    }

    await teamRepository.update(archivedTeam.id, {
      staff: team.staff,
      players: team.players.map((player) => ({
        id: player.id,
        jerseyNumber: player.jerseyNumber,
        firstName: player.firstName,
        lastName: player.lastName,
        playerCode: player.playerCode,
        isLibero: player.isLibero,
        isCaptain: player.isCaptain,
      })),
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const project = activeProject ? cloneProject(activeProject) : createEmptyMatchProject();
      const playedAt = new Date(`${formData.matchDate}T${formData.startTime}:00`).toISOString();
      const competitionName = formData.competitionName.trim();
      const competitionEntry = competitionName
        ? await competitionRepository.create({ name: competitionName })
        : null;

      project.metadata.competition = competitionName || undefined;
      project.metadata.competitionEntryId = competitionEntry?.id;
      project.metadata.venue = formData.venue.trim() || undefined;
      project.metadata.playedAt = playedAt;
      project.updatedAt = Date.now();

      setMatchTeamSelection(project, 'home', createSelectionFromTeamState(
        project.homeSelection.teamId,
        project.homeSelection.teamCode ?? 'TBD',
        formData.homeTeam,
      ));
      setMatchTeamSelection(project, 'away', createSelectionFromTeamState(
        project.awaySelection.teamId,
        project.awaySelection.teamCode ?? 'TBD',
        formData.awayTeam,
      ));

      const normalizedProject = normalizeMatchProject(project);
      const persistedProject = activeProject
        ? await matchRepository.update(normalizedProject)
        : await matchRepository.create(normalizedProject);
      await Promise.all([
        saveTeamArchiveIfNeeded(formData.homeTeam),
        saveTeamArchiveIfNeeded(formData.awayTeam),
      ]);

      setActiveProject(persistedProject);
      setCreatedProject(persistedProject);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error creating match project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToScouting = () => {
    if (!createdProjectReadiness.isReady) {
      return;
    }

    navigate('/scouting');
  };

  const handleBackToSetup = () => {
    setShowConfirmation(false);
  };

  const homeAllPlayersSelected =
    formData.homeTeam.players.length > 0 &&
    formData.homeTeam.players.every((player) => player.isSelectedForMatch);
  const awayAllPlayersSelected =
    formData.awayTeam.players.length > 0 &&
    formData.awayTeam.players.every((player) => player.isSelectedForMatch);
  const homeLiveRosterError = getLiveRosterError(formData.homeTeam);
  const awayLiveRosterError = getLiveRosterError(formData.awayTeam);
  const homeRosterError = homeLiveRosterError ?? errors.homeTeam_roster;
  const awayRosterError = awayLiveRosterError ?? errors.awayTeam_roster;

  if (showConfirmation && createdProject) {
    return (
      <main className="match-setup-page match-setup-page--with-nav">
        <div className="match-setup-container match-setup-container--review">
            <header className="match-setup-header">
              <h1 className="match-setup-title">{t('matchCreated')}</h1>
              <p className="match-setup-subtitle">{t('reviewMatchDetails')}</p>
              <div className="match-review-edit">
                <button type="button" onClick={handleBackToSetup} className="btn-secondary">
                  {t('edit')}
                </button>
              </div>
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

              <div className="match-review-primary-action">
                <button
                  type="button"
                  onClick={handleProceedToScouting}
                  className="btn-primary"
                  disabled={!createdProjectReadiness.isReady}
                  title={!createdProjectReadiness.isReady ? t('matchNotReadyToStartScouting') : undefined}
                >
                  {t('startScouting')}
                </button>
              </div>

              {!createdProjectReadiness.isReady && (
                <p className="match-review-primary-action__hint">
                  {t('completeReadinessItemsToStartScouting')}
                </p>
              )}

              <MatchReadinessSection readiness={createdProjectReadiness} />

              <div className="teams-summary">
                <div className="team-summary-card">
                  <h4 className="team-name">{createdHomeTeam?.name}</h4>
                  <div className="team-details">
                    <div className="detail-row">
                      <span className="detail-label">{t('players')}:</span>
                      <span className="detail-value">{createdHomeRoster.length}</span>
                    </div>
                  </div>
                </div>

                <div className="vs-divider">{t('vs').toUpperCase()}</div>

                <div className="team-summary-card">
                  <h4 className="team-name">{createdAwayTeam?.name}</h4>
                  <div className="team-details">
                    <div className="detail-row">
                      <span className="detail-label">{t('players')}:</span>
                      <span className="detail-value">{createdAwayRoster.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </main>
    );
  }

  return (
    <main className="match-setup-page match-setup-page--with-nav">
      <div className="match-setup-container">
          <header className="match-setup-header">
            <h1 className="match-setup-title">
              {activeProject ? t('reviewMatchSetup') : t('createNewMatch')}
            </h1>
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
                allPlayersSelected={homeAllPlayersSelected}
                onTeamNameChange={(name) => handleTeamNameChange('home', name)}
                onSelectTeam={(team) => handleSelectArchivedTeam('home', team)}
                onCreateNewTeam={() => handleCreateNewTeam('home')}
                onAddPlayer={() => handleAddPlayer('home')}
                onToggleSelectAll={() => handleToggleSelectAll('home')}
                onPlayerFieldChange={(index, field, value) => handlePlayerFieldChange('home', index, field, value)}
                onPlayerToggleSelected={(playerId) => handleTogglePlayerSelected('home', playerId)}
                onPlayerToggleLibero={(playerId) => handleTogglePlayerLibero('home', playerId)}
                onPlayerToggleCaptain={(playerId) => handleTogglePlayerCaptain('home', playerId)}
                onPlayerRemove={(index) => handleRemovePlayer('home', index)}
                rosterError={homeRosterError}
              />

              <MatchTeamSelection
                teamType="away"
                teamName={formData.awayTeam.teamName}
                archivedTeam={formData.awayTeam.archivedTeam}
                players={formData.awayTeam.players}
                allPlayersSelected={awayAllPlayersSelected}
                onTeamNameChange={(name) => handleTeamNameChange('away', name)}
                onSelectTeam={(team) => handleSelectArchivedTeam('away', team)}
                onCreateNewTeam={() => handleCreateNewTeam('away')}
                onAddPlayer={() => handleAddPlayer('away')}
                onToggleSelectAll={() => handleToggleSelectAll('away')}
                onPlayerFieldChange={(index, field, value) => handlePlayerFieldChange('away', index, field, value)}
                onPlayerToggleSelected={(playerId) => handleTogglePlayerSelected('away', playerId)}
                onPlayerToggleLibero={(playerId) => handleTogglePlayerLibero('away', playerId)}
                onPlayerToggleCaptain={(playerId) => handleTogglePlayerCaptain('away', playerId)}
                onPlayerRemove={(index) => handleRemovePlayer('away', index)}
                rosterError={awayRosterError}
              />
            </div>

            <div className="form-actions">
              <button type="button" onClick={() => navigate('/')} className="btn-secondary" disabled={isSubmitting}>
                {t('cancel')}
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? t('creating') : activeProject ? t('saveMatchChanges') : t('createMatch')}
              </button>
            </div>
          </form>
      </div>
    </main>
  );
}
