import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '../../../app/store/app-store';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import type { Player, TeamStaff } from '@src/domain/roster/types';

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
  onPlayerRemove: (index: number) => void;
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
  onPlayerRemove,
  errors,
}: TeamSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const generatePlayerCode = (firstName: string, lastName: string): string => {
    const firstPart = firstName.replace(/\s/g, '').substring(0, 3).toUpperCase();
    const lastPart = lastName.replace(/\s/g, '').substring(0, 3).toUpperCase();
    return `${firstPart}-${lastPart}`;
  };

  const handlePlayerChange = (index: number, field: keyof Player, value: string | boolean) => {
    const updatedPlayer = { ...players[index] };

    if (field === 'firstName' || field === 'lastName') {
      updatedPlayer[field] = value as string;
      updatedPlayer.playerCode = generatePlayerCode(
        field === 'firstName' ? value as string : updatedPlayer.firstName,
        field === 'lastName' ? value as string : updatedPlayer.lastName
      );
    } else if (field === 'jerseyNumber') {
      updatedPlayer[field] = parseInt(value as string) || 0;
    } else if (field === 'isLibero' || field === 'isCaptain') {
      updatedPlayer[field] = value as boolean;
    }

    onPlayerUpdate(index, updatedPlayer);
  };

  const liberoCount = players.filter(p => p.isLibero).length;
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
              <button type="button" onClick={onPlayerAdd} className="btn-secondary btn-small">
                {t('addPlayer')}
              </button>
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
                    {players.map((player, index) => (
                      <tr key={player.id}>
                        <td>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={player.jerseyNumber || ''}
                            onChange={(e) => handlePlayerChange(index, 'jerseyNumber', e.target.value)}
                            className="table-input"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={player.firstName}
                            onChange={(e) => handlePlayerChange(index, 'firstName', e.target.value)}
                            className="table-input"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={player.lastName}
                            onChange={(e) => handlePlayerChange(index, 'lastName', e.target.value)}
                            className="table-input"
                            required
                          />
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
                            onChange={(e) => {
                              // Clear all captain flags first
                              players.forEach((p, i) => {
                                if (i !== index) {
                                  onPlayerUpdate(i, { ...p, isCaptain: false });
                                }
                              });
                              handlePlayerChange(index, 'isCaptain', true);
                            }}
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
                    ))}
                  </tbody>
                </table>
              </div>
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
  const [errors, setErrors] = useState<Partial<MatchSetupData>>({});

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
      newErrors.matchDate = 'Match date is required';
    } else {
      const date = new Date(formData.matchDate);
      if (isNaN(date.getTime())) {
        newErrors.matchDate = 'Invalid date format';
      }
    }

    // Validate time
    if (!formData.startTime) {
      newErrors.startTime = 'Start time is required';
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(formData.startTime)) {
        newErrors.startTime = 'Invalid time format (HH:MM)';
      }
    }

    // Validate team names
    if (!formData.homeTeamName.trim()) {
      newErrors.homeTeamName = 'Home team name is required';
    }
    if (!formData.awayTeamName.trim()) {
      newErrors.awayTeamName = 'Away team name is required';
    }

    // Validate players
    const validateTeamPlayers = (players: Player[], teamName: string) => {
      players.forEach((player, index) => {
        if (!player.jerseyNumber) {
          newErrors[`${teamName}_player_${index}_jersey`] = 'Jersey number required';
        }
        if (!player.firstName.trim()) {
          newErrors[`${teamName}_player_${index}_firstName`] = 'First name required';
        }
        if (!player.lastName.trim()) {
          newErrors[`${teamName}_player_${index}_lastName`] = 'Last name required';
        }
      });
    };

    validateTeamPlayers(formData.homeTeamPlayers, 'home');
    validateTeamPlayers(formData.awayTeamPlayers, 'away');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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

      setActiveProject(project);

      // Navigate to collection page to start scouting
      navigate('/app/collection');
    } catch (error) {
      console.error('Error creating match project:', error);
      // In a real app, you'd show a user-friendly error message
    } finally {
      setIsSubmitting(false);
    }
  };

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
              onPlayerRemove={(index) => handlePlayerRemove('home', index)}
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