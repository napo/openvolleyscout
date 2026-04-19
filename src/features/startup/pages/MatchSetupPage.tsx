import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '../../../app/store/app-store';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { saveMatchProject } from '@src/infrastructure/storage/match-project-storage';
import type { Player, TeamStaff } from '@src/domain/roster/types';
import type { MatchProject } from '@src/domain/match/types';
import { generatePlayerCode, DEFAULT_ROSTER } from '@src/lib/utils/player-code-generator';

interface MatchSetupData {
  competitionName: string;
  matchDate: string;
  startTime: string;
  venue: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamStaff: TeamStaff;
  awayTeamStaff: TeamStaff;
  homeTeamPlayers: Player[];
  awayTeamPlayers: Player[];
}

interface TeamSectionProps {
  teamType: 'home' | 'away';
  teamName: string;
  teamStaff: TeamStaff;
  players: Player[];
  onTeamNameChange: (name: string) => void;
  onStaffChange: (staff: TeamStaff) => void;
  onPlayerAdd: () => void;
  onPlayerUpdate: (index: number, player: Player) => void;
  onPlayerCaptainChange: (index: number) => void;
  onPlayerRemove: (index: number) => void;
  onRosterLoad?: (players: Player[]) => void;
  errors: Record<string, string>;
}

function TeamSection({
  teamType,
  teamName,
  teamStaff,
  players,
  onTeamNameChange,
  onStaffChange,
  onPlayerAdd,
  onPlayerUpdate,
  onPlayerCaptainChange,
  onPlayerRemove,
  onRosterLoad,
  errors,
}: TeamSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizeCodePart = (value: string) =>
    value.trim().replace(/\s+/g, '').slice(0, 3).toUpperCase().padEnd(3, '-');

  const handlePlayerChange = (index: number, field: keyof Player, value: string | boolean) => {
    const updatedPlayer = { ...players[index] };

    if (field === 'firstName' || field === 'lastName') {
      updatedPlayer[field] = value as string;
      // Use new generatePlayerCode with conflict resolution
      updatedPlayer.playerCode = generatePlayerCode(
        field === 'firstName' ? (value as string) : updatedPlayer.firstName,
        field === 'lastName' ? (value as string) : updatedPlayer.lastName,
        players
      );
    } else if (field === 'jerseyNumber') {
      updatedPlayer[field] = parseInt(value as string, 10) || 0;
    } else if (field === 'isLibero' || field === 'isCaptain') {
      updatedPlayer[field] = value as boolean;
    }

    onPlayerUpdate(index, updatedPlayer);
  };

  const handleRandomRoster = () => {
    // Generate new IDs for each player from DEFAULT_ROSTER
    const newPlayers = DEFAULT_ROSTER.map((player) => ({
      ...player,
      id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }));

    // Use onRosterLoad if available, otherwise fall back to adding one by one
    if (onRosterLoad) {
      onRosterLoad(newPlayers);
    } else {
      // Fallback: clear existing and add new players one by one
      // First remove all existing players
      [...Array(players.length)].forEach(() => {
        // This won't work well, so we need the callback
      });
    }
  };

  const liberoCount = players.filter((p) => p.isLibero).length;
  const canAddLibero = liberoCount < 2;

  return (
    <div className="team-section">
      <div className="team-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="team-name-section">
          <label className="team-label">
            {teamType === 'home' ? t('homeTeam') : t('awayTeam')}
          </label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => onTeamNameChange(e.target.value)}
            placeholder={t('teamNamePlaceholder')}
            className="team-name-input"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <button type="button" className="expand-toggle">
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      {isExpanded && (
        <div className="team-content">
          {/* Team Staff */}
          <div className="staff-section">
            <h4 className="section-title">{t('teamStaff')}</h4>
            <div className="staff-grid">
              <div className="form-group">
                <label className="form-label">{t('headCoach')}</label>
                <input
                  type="text"
                  value={teamStaff.headCoach}
                  onChange={(e) => onStaffChange({ ...teamStaff, headCoach: e.target.value })}
                  placeholder={t('coachNamePlaceholder')}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('assistantCoach')}</label>
                <input
                  type="text"
                  value={teamStaff.assistantCoach}
                  onChange={(e) => onStaffChange({ ...teamStaff, assistantCoach: e.target.value })}
                  placeholder={t('coachNamePlaceholder')}
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Roster */}
          <div className="roster-section">
            <div className="roster-header">
              <h4 className="section-title">{t('roster')}</h4>
              <div className="roster-actions">
                <button type="button" onClick={onPlayerAdd} className="btn-secondary btn-small">
                  {t('addPlayer')}
                </button>
                <button type="button" onClick={handleRandomRoster} className="btn-secondary btn-small">
                  Random (14)
                </button>
              </div>
            </div>

            {players.length > 0 && (
              <div className="roster-table-container">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>{t('jerseyNumber')}</th>
                      <th>{t('firstName')}</th>
                      <th>{t('lastName')}</th>
                      <th>{t('playerCode')}</th>
                      <th>{t('libero')}</th>
                      <th>{t('captain')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, index) => {
                      const jerseyError = errors[`${teamType}_player_${index}_jersey`];
                      const firstNameError = errors[`${teamType}_player_${index}_firstName`];
                      const lastNameError = errors[`${teamType}_player_${index}_lastName`];

                      return (
                        <tr key={player.id}>
                          <td>
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={player.jerseyNumber || ''}
                              onChange={(e) => handlePlayerChange(index, 'jerseyNumber', e.target.value)}
                              className={`table-input ${jerseyError ? 'form-input-error' : ''}`}
                              required
                            />
                            {jerseyError && <span className="form-error">{jerseyError}</span>}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={player.firstName}
                              onChange={(e) => handlePlayerChange(index, 'firstName', e.target.value)}
                              className={`table-input ${firstNameError ? 'form-input-error' : ''}`}
                              required
                            />
                            {firstNameError && <span className="form-error">{firstNameError}</span>}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={player.lastName}
                              onChange={(e) => handlePlayerChange(index, 'lastName', e.target.value)}
                              className={`table-input ${lastNameError ? 'form-input-error' : ''}`}
                              required
                            />
                            {lastNameError && <span className="form-error">{lastNameError}</span>}
                          </td>
                          <td className="player-code-cell">{player.playerCode}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={player.isLibero || false}
                              onChange={(e) => handlePlayerChange(index, 'isLibero', e.target.checked)}
                              disabled={!canAddLibero && !player.isLibero}
                            />
                          </td>
                          <td>
                            <input
                              type="radio"
                              name={`${teamType}-captain`}
                              checked={player.isCaptain || false}
                              onChange={() => onPlayerCaptainChange(index)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => onPlayerRemove(index)}
                              className="remove-btn"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {players.length > 0 && (
              <div className="roster-footer">
                <button type="button" onClick={onPlayerAdd} className="btn-secondary btn-small">
                  + {t('addPlayer')}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setIsExpanded(false)}
                >
                  {t('back')}
                </button>
              </div>
            )}

            {errors[`${teamType}_liberoLimit`] && (
              <span className="form-error">{errors[`${teamType}_liberoLimit`]}</span>
            )}

            {players.length === 0 && (
              <p className="empty-roster">{t('noPlayersAdded')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MatchSetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setActiveProject = useAppStore((state) => state.setActiveProject);

  const [formData, setFormData] = useState<MatchSetupData>({
    competitionName: '',
    matchDate: '',
    startTime: '',
    venue: '',
    homeTeamName: '',
    awayTeamName: '',
    homeTeamStaff: { headCoach: '', assistantCoach: '' },
    awayTeamStaff: { headCoach: '', assistantCoach: '' },
    homeTeamPlayers: [],
    awayTeamPlayers: [],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [createdProject, setCreatedProject] = useState<MatchProject | null>(null);

  // Initialize with current date and time
  useEffect(() => {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    setFormData(prev => ({
      ...prev,
      matchDate: currentDate,
      startTime: currentTime,
    }));
  }, []);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate date
    if (!formData.matchDate) {
      newErrors.matchDate = t('matchDateRequired');
    } else {
      const date = new Date(formData.matchDate);
      if (isNaN(date.getTime())) {
        newErrors.matchDate = t('invalidDateFormat');
      }
    }

    // Validate time
    if (!formData.startTime) {
      newErrors.startTime = t('startTimeRequired');
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(formData.startTime)) {
        newErrors.startTime = t('invalidTimeFormat');
      }
    }

    // Validate team names
    if (!formData.homeTeamName.trim()) {
      newErrors.homeTeamName = t('homeTeamNameRequired');
    }
    if (!formData.awayTeamName.trim()) {
      newErrors.awayTeamName = t('awayTeamNameRequired');
    }

    // Validate players
    const validateTeamPlayers = (players: Player[], teamName: string) => {
      players.forEach((player, index) => {
        if (!player.jerseyNumber) {
          newErrors[`${teamName}_player_${index}_jersey`] = t('jerseyNumberRequired');
        }
        if (!player.firstName.trim()) {
          newErrors[`${teamName}_player_${index}_firstName`] = t('firstNameRequired');
        }
        if (!player.lastName.trim()) {
          newErrors[`${teamName}_player_${index}_lastName`] = t('lastNameRequired');
        }
      });

      const liberoCount = players.filter((player) => player.isLibero).length;
      if (liberoCount > 2) {
        newErrors[`${teamName}_liberoLimit`] = t('liberoLimitExceeded');
      }
    };

    validateTeamPlayers(formData.homeTeamPlayers, 'home');
    validateTeamPlayers(formData.awayTeamPlayers, 'away');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Scroll to next input field in the form
   * Finds the next focusable input and smoothly scrolls it into view
   */
  const scrollToNextInput = useCallback((currentInputId: string) => {
    const form = document.querySelector('.match-setup-form');
    if (!form) return;

    // Get all inputs and textareas in the form
    const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"])'));
    const currentIndex = inputs.findIndex(
      (input) => (input as HTMLInputElement).id === currentInputId
    );

    if (currentIndex !== -1 && currentIndex < inputs.length - 1) {
      const nextInput = inputs[currentIndex + 1] as HTMLInputElement;
      // Scroll with smooth behavior, positioned near viewport
      setTimeout(() => {
        nextInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, []);

  const generatePlayerId = () => `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const createEmptyPlayer = (): Player => ({
    id: generatePlayerId(),
    jerseyNumber: 0,
    firstName: '',
    lastName: '',
    shortName: '',
    playerCode: '--',
    isCaptain: false,
    isLibero: false,
  });

  const handleInputChange = (field: keyof MatchSetupData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleTeamNameChange = (teamType: 'home' | 'away', name: string) => {
    const field = teamType === 'home' ? 'homeTeamName' : 'awayTeamName';
    handleInputChange(field, name);
  };

  const handleTeamStaffChange = (teamType: 'home' | 'away', staff: TeamStaff) => {
    const field = teamType === 'home' ? 'homeTeamStaff' : 'awayTeamStaff';
    setFormData((prev) => ({ ...prev, [field]: staff }));
  };

  const handlePlayerAdd = (teamType: 'home' | 'away') => {
    const field = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], createEmptyPlayer()],
    }));
  };

  const handlePlayerUpdate = (teamType: 'home' | 'away', index: number, player: Player) => {
    const field = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((p, i) => (i === index ? player : p)),
    }));
  };

  const handlePlayerCaptainChange = (teamType: 'home' | 'away', index: number) => {
    const field = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((player, i) => ({
        ...player,
        isCaptain: i === index,
      })),
    }));
  };

  const handlePlayerRemove = (teamType: 'home' | 'away', index: number) => {
    const field = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleRosterLoad = (teamType: 'home' | 'away', players: Player[]) => {
    const field = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData((prev) => ({
      ...prev,
      [field]: players,
    }));
  };

  const adjustTime = (direction: 'up' | 'down', field: 'hours' | 'minutes') => {
    const [hours, minutes] = formData.startTime.split(':').map(Number);
    let newHours = hours;
    let newMinutes = minutes;

    if (field === 'hours') {
      newHours = direction === 'up'
        ? (hours + 1) % 24
        : hours === 0 ? 23 : hours - 1;
    } else {
      newMinutes = direction === 'up'
        ? (minutes + 1) % 60
        : minutes === 0 ? 59 : minutes - 1;
    }

    const newTime = `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
    handleInputChange('startTime', newTime);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const project = createEmptyMatchProject();

      // Combine date and time into ISO string for playedAt
      const dateTimeString = `${formData.matchDate}T${formData.startTime}:00`;
      const playedAt = new Date(dateTimeString).toISOString();

      project.metadata.competition = formData.competitionName.trim() || undefined;
      project.metadata.venue = formData.venue.trim() || undefined;
      project.metadata.playedAt = playedAt;
      project.updatedAt = Date.now();

      project.homeTeam.name = formData.homeTeamName.trim();
      project.homeTeam.players = formData.homeTeamPlayers.map(player => ({
        ...player,
        shortName: `${player.firstName.charAt(0)}. ${player.lastName}`,
        role: player.isLibero ? 'libero' : undefined,
      }));
      project.homeTeam.staff = formData.homeTeamStaff;

      project.awayTeam.name = formData.awayTeamName.trim();
      project.awayTeam.players = formData.awayTeamPlayers.map(player => ({
        ...player,
        shortName: `${player.firstName.charAt(0)}. ${player.lastName}`,
        role: player.isLibero ? 'libero' : undefined,
      }));
      project.awayTeam.staff = formData.awayTeamStaff;

      await saveMatchProject(project);
      setActiveProject(project);
      setCreatedProject(project);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error creating match project:', error);
      // In a real app, you'd show a user-friendly error message
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToCollection = () => {
    navigate('/app/collection');
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
                  {new Date(createdProject.metadata.playedAt).toLocaleDateString()} at {new Date(createdProject.metadata.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                  <div className="detail-row">
                    <span className="detail-label">{t('headCoach')}:</span>
                    <span className="detail-value">{createdProject.homeTeam.staff.headCoach || t('notSpecified')}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('assistantCoach')}:</span>
                    <span className="detail-value">{createdProject.homeTeam.staff.assistantCoach || t('notSpecified')}</span>
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
                  <div className="detail-row">
                    <span className="detail-label">{t('headCoach')}:</span>
                    <span className="detail-value">{createdProject.awayTeam.staff.headCoach || t('notSpecified')}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('assistantCoach')}:</span>
                    <span className="detail-value">{createdProject.awayTeam.staff.assistantCoach || t('notSpecified')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="confirmation-actions">
              <button
                type="button"
                onClick={handleBackToSetup}
                className="btn-secondary"
              >
                {t('back')}
              </button>
              <button
                type="button"
                onClick={handleProceedToCollection}
                className="btn-primary"
              >
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
            <input
              id="competitionName"
              type="text"
              value={formData.competitionName}
              onChange={(e) => handleInputChange('competitionName', e.target.value)}
              onBlur={() => scrollToNextInput('competitionName')}
              placeholder={t('competitionNamePlaceholder')}
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
              onChange={(e) => handleInputChange('matchDate', e.target.value)}
              onBlur={() => scrollToNextInput('matchDate')}
              className={`form-input ${errors.matchDate ? 'form-input-error' : ''}`}
            />
            {errors.matchDate && <span className="form-error">{errors.matchDate}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="startTime" className="form-label">
              {t('startTime')}
            </label>
            <div className="time-input-group">
              <input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => handleInputChange('startTime', e.target.value)}
                onBlur={() => scrollToNextInput('startTime')}
                className={`form-input time-input ${errors.startTime ? 'form-input-error' : ''}`}
              />
              <div className="time-controls">
                <button
                  type="button"
                  onClick={() => adjustTime('up', 'hours')}
                  className="time-control-btn"
                  aria-label="Increase hours"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => adjustTime('down', 'hours')}
                  className="time-control-btn"
                  aria-label="Decrease hours"
                >
                  ▼
                </button>
              </div>
              <div className="time-separator">:</div>
              <div className="time-controls">
                <button
                  type="button"
                  onClick={() => adjustTime('up', 'minutes')}
                  className="time-control-btn"
                  aria-label="Increase minutes"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => adjustTime('down', 'minutes')}
                  className="time-control-btn"
                  aria-label="Decrease minutes"
                >
                  ▼
                </button>
              </div>
            </div>
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
              onChange={(e) => handleInputChange('venue', e.target.value)}
              onBlur={() => scrollToNextInput('venue')}
              placeholder={t('venuePlaceholder')}
              className="form-input"
            />
          </div>

          {/* Team Sections */}
          <div className="teams-section">
            <h3 className="section-title">{t('teams')}</h3>

            <TeamSection
              teamType="home"
              teamName={formData.homeTeamName}
              teamStaff={formData.homeTeamStaff}
              players={formData.homeTeamPlayers}
              onTeamNameChange={(name) => handleTeamNameChange('home', name)}
              onStaffChange={(staff) => handleTeamStaffChange('home', staff)}
              onPlayerAdd={() => handlePlayerAdd('home')}
              onPlayerUpdate={(index, player) => handlePlayerUpdate('home', index, player)}
              onPlayerCaptainChange={(index) => handlePlayerCaptainChange('home', index)}
              onPlayerRemove={(index) => handlePlayerRemove('home', index)}
              onRosterLoad={(players) => handleRosterLoad('home', players)}
              errors={errors}
            />

            <TeamSection
              teamType="away"
              teamName={formData.awayTeamName}
              teamStaff={formData.awayTeamStaff}
              players={formData.awayTeamPlayers}
              onTeamNameChange={(name) => handleTeamNameChange('away', name)}
              onStaffChange={(staff) => handleTeamStaffChange('away', staff)}
              onPlayerAdd={() => handlePlayerAdd('away')}
              onPlayerUpdate={(index, player) => handlePlayerUpdate('away', index, player)}
              onPlayerCaptainChange={(index) => handlePlayerCaptainChange('away', index)}
              onRosterLoad={(players) => handleRosterLoad('away', players)}
              onPlayerRemove={(index) => handlePlayerRemove('away', index)}
              errors={errors}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('creating') : t('createMatch')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}