import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '../../../app/store/app-store';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import {
  createMatchRosterSelectionFromArchived,
  createMatchRosterSelectionPlayer,
  createMatchTeamSelection,
  getMatchRoster,
  getMatchTeamSelection,
  getMatchTeamSnapshot,
  normalizeMatchProject,
  setMatchTeamSelection,
} from '@src/domain/match';
import {
  competitionRepository,
  matchRepository,
  teamRepository,
} from '@src/infrastructure/repositories';
import { CompetitionNameInput } from '../components/CompetitionNameInput';
import { MatchTeamSelection } from '../components/MatchTeamSelection';
import { createEmptyArchivedTeam, generatePlayerCode } from '@src/domain/team/factories';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { useSequentialEnterNavigation } from '@src/lib/hooks/useSequentialEnterNavigation';
import type {
  MatchProject,
  MatchRosterPlayer,
  MatchRosterSelectionPlayer,
  MatchTeamSelection as MatchTeamSelectionModel,
} from '@src/domain/match/types';
import type { TeamStaff } from '@src/domain/roster/types';
import type { ArchivedTeam } from '@src/domain/team/types';
import { getMatchRosterErrorKeys, validateMatchRoster } from '@src/lib/validation/roster-validation';

type MatchWizardStep = 'match_info' | 'home_team' | 'away_team';

interface TeamSelectionState {
  teamName: string;
  archivedTeam: ArchivedTeam | null;
  staff: TeamStaff;
  players: MatchRosterSelectionPlayer[];
}

interface MatchSetupData {
  competitionName: string;
  matchNumber: string;
  matchDate: string;
  startTime: string;
  venue: string;
  homeTeam: TeamSelectionState;
  awayTeam: TeamSelectionState;
}

const MATCH_WIZARD_STEPS: MatchWizardStep[] = ['match_info', 'home_team', 'away_team'];

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
    matchNumber: '',
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
    matchNumber: project.metadata.matchNumber ?? '',
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
  const [currentStep, setCurrentStep] = useState<MatchWizardStep>('match_info');
  const handleSequentialEnter = useSequentialEnterNavigation();

  useEffect(() => {
    if (!activeProject) {
      setFormData(createEmptyMatchSetupData());
      setErrors({});
      setCurrentStep('match_info');
      return;
    }

    setFormData(createFormDataFromProject(activeProject));
    setErrors({});
  }, [activeProject]);

  const currentStepIndex = MATCH_WIZARD_STEPS.indexOf(currentStep);

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

  const mergeValidationErrors = (newEntries: Record<string, string>, keysToClear: string[]) => {
    setErrors((prev) => {
      const next = { ...prev };

      Object.keys(next).forEach((key) => {
        if (keysToClear.some((clearKey) => key === clearKey || key.startsWith(clearKey))) {
          delete next[key];
        }
      });

      return {
        ...next,
        ...newEntries,
      };
    });

    return Object.keys(newEntries).length === 0;
  };

  const clearErrorKeys = (keysToClear: string[]) => {
    setErrors((prev) => {
      const next = { ...prev };

      Object.keys(next).forEach((key) => {
        if (keysToClear.some((clearKey) => key === clearKey || key.startsWith(clearKey))) {
          delete next[key];
        }
      });

      return next;
    });
  };

  const validateMatchInfoStep = () => {
    const stepErrors: Record<string, string> = {};

    if (!formData.matchDate) {
      stepErrors.matchDate = t('matchDateRequired');
    }

    if (!formData.startTime) {
      stepErrors.startTime = t('startTimeRequired');
    }

    return mergeValidationErrors(stepErrors, ['matchDate', 'startTime']);
  };

  const validateTeamStep = (teamType: 'home' | 'away') => {
    const team = formData[teamType === 'home' ? 'homeTeam' : 'awayTeam'];
    const stepErrors: Record<string, string> = {};
    const prefix = teamType === 'home' ? 'homeTeam' : 'awayTeam';
    const nameErrorKey = teamType === 'home' ? 'homeTeamName' : 'awayTeamName';

    if (!team.teamName.trim()) {
      stepErrors[nameErrorKey] = teamType === 'home' ? t('homeTeamNameRequired') : t('awayTeamNameRequired');
    }

    team.players.forEach((player, index) => {
      if (!player.isSelectedForMatch) {
        return;
      }

      if (!player.jerseyNumber) {
        stepErrors[`${prefix}_player_${index}_jersey`] = t('jerseyNumberRequired');
      }

      if (!player.firstName.trim()) {
        stepErrors[`${prefix}_player_${index}_firstName`] = t('firstNameRequired');
      }

      if (!player.lastName.trim()) {
        stepErrors[`${prefix}_player_${index}_lastName`] = t('lastNameRequired');
      }
    });

    const selectedPlayers = team.players.filter((player) => player.isSelectedForMatch);
    const validation = validateMatchRoster(selectedPlayers);
    if (!validation.isValid) {
      stepErrors[`${prefix}_roster`] = validation.errors.map((key) => t(key as never)).join(', ');
    }

    if (
      teamType === 'away' &&
      formData.homeTeam.teamName.trim() &&
      formData.awayTeam.teamName.trim() &&
      formData.homeTeam.teamName.trim().toLowerCase() === formData.awayTeam.teamName.trim().toLowerCase()
    ) {
      stepErrors.awayTeamName = t('matchReadinessTeamsMustDiffer');
    }

    return mergeValidationErrors(stepErrors, [nameErrorKey, `${prefix}_player_`, `${prefix}_roster`]);
  };

  const validateBeforeReview = () => {
    const matchInfoValid = validateMatchInfoStep();
    const homeValid = validateTeamStep('home');
    const awayValid = validateTeamStep('away');

    return matchInfoValid && homeValid && awayValid;
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
        if (playerIndex !== index) {
          return player;
        }

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

    const prefix = teamType === 'home' ? 'homeTeam' : 'awayTeam';
    clearErrorKeys([`${prefix}_player_${index}_`, `${prefix}_roster`]);
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

    const prefix = teamType === 'home' ? 'homeTeam' : 'awayTeam';
    clearErrorKeys([`${prefix}_roster`]);
  };

  const handleTogglePlayerLibero = (teamType: 'home' | 'away', playerId: string) => {
    updateTeamState(teamType, (team) => {
      const selectedLiberos = team.players.filter((player) => player.isSelectedForMatch && player.isLibero).length;
      return {
        ...team,
        players: team.players.map((player) => {
          if (player.id !== playerId) {
            return player;
          }

          const isLibero = !player.isLibero && selectedLiberos < 2;
          return {
            ...player,
            isLibero,
          };
        }),
      };
    });

    const prefix = teamType === 'home' ? 'homeTeam' : 'awayTeam';
    clearErrorKeys([`${prefix}_roster`]);
  };

  const handleTogglePlayerCaptain = (teamType: 'home' | 'away', playerId: string) => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: team.players.map((player) => ({
        ...player,
        isCaptain: player.id === playerId,
      })),
    }));

    const prefix = teamType === 'home' ? 'homeTeam' : 'awayTeam';
    clearErrorKeys([`${prefix}_roster`]);
  };

  const handleRemovePlayer = (teamType: 'home' | 'away', index: number) => {
    updateTeamState(teamType, (team) => ({
      ...team,
      players: team.players.filter((_, playerIndex) => playerIndex !== index),
    }));

    const prefix = teamType === 'home' ? 'homeTeam' : 'awayTeam';
    clearErrorKeys([`${prefix}_player_${index}_`, `${prefix}_roster`]);
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

    return errorKeys.map((key) => t(key as never)).join(', ');
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

  const persistProject = async () => {
    if (!validateBeforeReview()) {
      return false;
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
      project.metadata.matchNumber = formData.matchNumber.trim() || undefined;
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
      navigate('/scouting');
      return true;
    } catch (error) {
      console.error('Error creating match project:', error);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextStep = async () => {
    if (currentStep === 'match_info') {
      if (validateMatchInfoStep()) {
        setCurrentStep('home_team');
      }
      return;
    }

    if (currentStep === 'home_team') {
      if (validateTeamStep('home')) {
        setCurrentStep('away_team');
      }
      return;
    }

    if (currentStep === 'away_team') {
      await persistProject();
    }
  };

  const handleBackStep = () => {
    if (currentStep === 'match_info') {
      navigate('/');
      return;
    }

    if (currentStep === 'home_team') {
      setCurrentStep('match_info');
      return;
    }

    if (currentStep === 'away_team') {
      setCurrentStep('home_team');
      return;
    }
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

  const stepProgressLabelKey: Record<MatchWizardStep, 'matchWizardProgressMatch' | 'matchWizardProgressHomeTeam' | 'matchWizardProgressAwayTeam'> = {
    match_info: 'matchWizardProgressMatch',
    home_team: 'matchWizardProgressHomeTeam',
    away_team: 'matchWizardProgressAwayTeam',
  };

  const stepHeadingKey: Record<MatchWizardStep, 'matchWizardTitleMatchInfo' | 'matchWizardTitleHomeTeam' | 'matchWizardTitleAwayTeam'> = {
    match_info: 'matchWizardTitleMatchInfo',
    home_team: 'matchWizardTitleHomeTeam',
    away_team: 'matchWizardTitleAwayTeam',
  };

  const stepDescriptionKey: Record<MatchWizardStep, 'matchWizardMatchInfoDescription' | 'matchWizardHomeTeamDescription' | 'matchWizardAwayTeamDescription'> = {
    match_info: 'matchWizardMatchInfoDescription',
    home_team: 'matchWizardHomeTeamDescription',
    away_team: 'matchWizardAwayTeamDescription',
  };

  const handleStepIndicatorClick = (targetStep: MatchWizardStep) => {
    const targetIndex = MATCH_WIZARD_STEPS.indexOf(targetStep);
    if (targetIndex <= currentStepIndex && !isSubmitting) {
      setCurrentStep(targetStep);
    }
  };

  return (
    <main className="match-setup-page match-setup-page--with-nav">
      <AppPageLayout
        className="match-setup-container"
        headerClassName="match-setup-header"
        contentClassName="match-setup-form"
        footerClassName="match-setup-footer"
        header={(
          <>
            <div className="match-setup-header__main">
              <h1 className="match-setup-title">{t('matchSetup')}</h1>
              <div className="match-setup-step-summary">
                <span className="match-setup-step-counter">
                  {t('matchWizardStepCounter', { current: currentStepIndex + 1, total: MATCH_WIZARD_STEPS.length })}
                </span>
                <span className="match-setup-step-pill">{t(stepProgressLabelKey[currentStep])}</span>
              </div>
            </div>
            <div className="match-setup-steps" aria-label={t('matchWizardSteps')}>
              {MATCH_WIZARD_STEPS.map((step, index) => (
                <button
                  type="button"
                  key={step}
                  onClick={() => handleStepIndicatorClick(step)}
                  disabled={index > currentStepIndex || isSubmitting}
                  className={`match-setup-step-chip${index === currentStepIndex ? ' is-active' : ''}${index < currentStepIndex ? ' is-complete' : ''}${index <= currentStepIndex ? ' is-clickable' : ''}`}
                >
                  <span className="match-setup-step-chip__index">{index + 1}</span>
                  <span className="match-setup-step-chip__label">{t(stepProgressLabelKey[step])}</span>
                </button>
              ))}
            </div>
          </>
        )}
        footer={(
          <div className="form-actions match-wizard-actions">
            <button type="button" onClick={handleBackStep} className="btn-secondary" disabled={isSubmitting}>
              {t('back')}
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleNextStep()} disabled={isSubmitting}>
              {isSubmitting && currentStep === 'away_team'
                ? t('creating')
                : currentStep === 'away_team'
                  ? t('startScouting')
                  : t('next')}
            </button>
          </div>
        )}
      >
          <div className="match-setup-section-intro">
            <h2 className="match-setup-section-title">{t(stepHeadingKey[currentStep])}</h2>
            <p className="match-setup-section-description">{t(stepDescriptionKey[currentStep])}</p>
          </div>

          {currentStep === 'match_info' && (
            <div className="match-setup-form-grid" data-sequential-nav-root="true">
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
                  onKeyDown={handleSequentialEnter}
                  onSelectSuggestion={() => undefined}
                />
              </div>

              <div className="form-group">
                <label htmlFor="matchNumber" className="form-label">
                  {t('matchNumber')} <span className="form-label__optional">{t('optional')}</span>
                </label>
                <input
                  id="matchNumber"
                  type="text"
                  value={formData.matchNumber}
                  onChange={(event) => handleInputChange('matchNumber', event.target.value)}
                  onKeyDown={handleSequentialEnter}
                  placeholder={t('matchNumberPlaceholder')}
                  className="form-input"
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
                  onKeyDown={handleSequentialEnter}
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
                  onKeyDown={handleSequentialEnter}
                  className={`form-input ${errors.startTime ? 'form-input-error' : ''}`}
                />
                {errors.startTime && <span className="form-error">{errors.startTime}</span>}
              </div>

              <div className="form-group match-setup-form-grid__full">
                <label htmlFor="venue" className="form-label">
                  {t('venue')}
                </label>
                <input
                  id="venue"
                  type="text"
                  value={formData.venue}
                  onChange={(event) => handleInputChange('venue', event.target.value)}
                  onKeyDown={handleSequentialEnter}
                  placeholder={t('venuePlaceholder')}
                  className="form-input"
                />
              </div>
            </div>
          )}

          {currentStep === 'home_team' && (
            <MatchTeamSelection
              teamType="home"
              teamName={formData.homeTeam.teamName}
              archivedTeam={formData.homeTeam.archivedTeam}
              players={formData.homeTeam.players}
              allPlayersSelected={homeAllPlayersSelected}
              onTeamNameChange={(name) => handleTeamNameChange('home', name)}
              onSelectTeam={(team) => void handleSelectArchivedTeam('home', team)}
              onCreateNewTeam={() => void handleCreateNewTeam('home')}
              onAddPlayer={() => handleAddPlayer('home')}
              onToggleSelectAll={() => handleToggleSelectAll('home')}
              onPlayerFieldChange={(index, field, value) => handlePlayerFieldChange('home', index, field, value)}
              onPlayerToggleSelected={(playerId) => handleTogglePlayerSelected('home', playerId)}
              onPlayerToggleLibero={(playerId) => handleTogglePlayerLibero('home', playerId)}
              onPlayerToggleCaptain={(playerId) => handleTogglePlayerCaptain('home', playerId)}
              onPlayerRemove={(index) => handleRemovePlayer('home', index)}
              rosterError={homeRosterError}
            />
          )}

          {currentStep === 'away_team' && (
            <MatchTeamSelection
              teamType="away"
              teamName={formData.awayTeam.teamName}
              archivedTeam={formData.awayTeam.archivedTeam}
              players={formData.awayTeam.players}
              allPlayersSelected={awayAllPlayersSelected}
              onTeamNameChange={(name) => handleTeamNameChange('away', name)}
              onSelectTeam={(team) => void handleSelectArchivedTeam('away', team)}
              onCreateNewTeam={() => void handleCreateNewTeam('away')}
              onAddPlayer={() => handleAddPlayer('away')}
              onToggleSelectAll={() => handleToggleSelectAll('away')}
              onPlayerFieldChange={(index, field, value) => handlePlayerFieldChange('away', index, field, value)}
              onPlayerToggleSelected={(playerId) => handleTogglePlayerSelected('away', playerId)}
              onPlayerToggleLibero={(playerId) => handleTogglePlayerLibero('away', playerId)}
              onPlayerToggleCaptain={(playerId) => handleTogglePlayerCaptain('away', playerId)}
              onPlayerRemove={(index) => handleRemovePlayer('away', index)}
              rosterError={awayRosterError}
            />
          )}
      </AppPageLayout>
    </main>
  );
}
