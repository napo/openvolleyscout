import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '../../../app/store/app-store';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { createMatchTeamSelection, normalizeMatchProject, setMatchTeamSelection } from '@src/domain/match';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import { DEFAULT_ROSTER } from '@src/lib/utils/player-code-generator';
import type { Player, TeamStaff } from '@src/domain/roster/types';

interface MatchSetupData {
  title: string;
  competition: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamStaff: TeamStaff;
  awayTeamStaff: TeamStaff;
  homeTeamPlayers: Player[];
  awayTeamPlayers: Player[];
}

type MatchSetupStringField = 'title' | 'competition' | 'homeTeamName' | 'awayTeamName';
type MatchSetupStaffField = 'homeTeamStaff' | 'awayTeamStaff';
type MatchSetupPlayersField = 'homeTeamPlayers' | 'awayTeamPlayers';

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
  hideRoster?: boolean;
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
  hideRoster = false,
}: TeamSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizeCodePart = (value: string) =>
    value.trim().replace(/\s+/g, '').slice(0, 3).toUpperCase().padEnd(3, '-');

  const generatePlayerCode = (firstName: string, lastName: string): string => {
    return `${normalizeCodePart(firstName)}-${normalizeCodePart(lastName)}`;
  };

  const handlePlayerChange = (index: number, field: keyof Player, value: string | boolean) => {
    const updatedPlayer = { ...players[index] };

    if (field === 'firstName' || field === 'lastName') {
      updatedPlayer[field] = value as string;
      updatedPlayer.playerCode = generatePlayerCode(
        field === 'firstName' ? (value as string) : updatedPlayer.firstName,
        field === 'lastName' ? (value as string) : updatedPlayer.lastName
      );
    } else if (field === 'jerseyNumber') {
      updatedPlayer[field] = parseInt(value as string, 10) || 0;
    } else if (field === 'isLibero' || field === 'isCaptain') {
      updatedPlayer[field] = value as boolean;
    }

    onPlayerUpdate(index, updatedPlayer);
  };

  const handleRandomRoster = () => {
    if (!onRosterLoad) return;

    const newPlayers = DEFAULT_ROSTER.map((player) => ({
      ...player,
      id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }));

    onRosterLoad(newPlayers);
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

      {isExpanded && hideRoster && (
        <p className="team-not-scouted-note">{t('opponentNotScouted')}</p>
      )}
      {isExpanded && !hideRoster && (
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
                  {t('randomRoster')}
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

function toMatchRosterPlayers(players: Player[]): MatchRosterPlayer[] {
  return players.map((player) => ({
    id: player.id,
    jerseyNumber: player.jerseyNumber,
    firstName: player.firstName,
    lastName: player.lastName,
    shortName: `${player.firstName.charAt(0)}. ${player.lastName}`,
    playerCode: player.playerCode,
    role: player.isLibero ? 'libero' : undefined,
    isCaptain: player.isCaptain,
    isLibero: player.isLibero,
    source: 'manual_entry',
  }));
}

export function MatchSetupForm() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setActiveProject = useAppStore((state) => state.setActiveProject);

  const [formData, setFormData] = useState<MatchSetupData>({
    title: '',
    competition: '',
    homeTeamName: '',
    awayTeamName: '',
    homeTeamStaff: { headCoach: '', assistantCoach: '' },
    awayTeamStaff: { headCoach: '', assistantCoach: '' },
    homeTeamPlayers: [],
    awayTeamPlayers: [],
  });

  const [scoutedTeamSide, setScoutedTeamSide] = useState<'both' | 'home' | 'away'>('both');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

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
    };

    if (scoutedTeamSide !== 'away') validateTeamPlayers(formData.homeTeamPlayers, 'home');
    if (scoutedTeamSide !== 'home') validateTeamPlayers(formData.awayTeamPlayers, 'away');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: MatchSetupStringField, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[field];
        return nextErrors;
      });
    }
  };

  const handleTeamNameChange = (teamType: 'home' | 'away', name: string) => {
    const field: MatchSetupStringField = teamType === 'home' ? 'homeTeamName' : 'awayTeamName';
    handleInputChange(field, name);
  };

  const handleTeamStaffChange = (teamType: 'home' | 'away', staff: TeamStaff) => {
    const field: MatchSetupStaffField = teamType === 'home' ? 'homeTeamStaff' : 'awayTeamStaff';
    setFormData(prev => ({ ...prev, [field]: staff }));
  };

  const handlePlayerAdd = (teamType: 'home' | 'away') => {
    const field: MatchSetupPlayersField = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], createEmptyPlayer()],
    }));
  };

  const handlePlayerUpdate = (teamType: 'home' | 'away', index: number, player: Player) => {
    const field: MatchSetupPlayersField = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((p, i) => i === index ? player : p),
    }));
  };

  const handlePlayerCaptainChange = (teamType: 'home' | 'away', index: number) => {
    const field: MatchSetupPlayersField = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((player, i) => ({
        ...player,
        isCaptain: i === index,
      })),
    }));
  };

  const handlePlayerRemove = (teamType: 'home' | 'away', index: number) => {
    const field: MatchSetupPlayersField = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleRosterLoad = (teamType: 'home' | 'away', players: Player[]) => {
    const field: MatchSetupPlayersField = teamType === 'home' ? 'homeTeamPlayers' : 'awayTeamPlayers';
    setFormData(prev => ({
      ...prev,
      [field]: players,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const project = createEmptyMatchProject();
      const updatedAt = Date.now();

      project.metadata.title = formData.title.trim() || undefined;
      project.metadata.competition = formData.competition.trim() || undefined;
      project.updatedAt = updatedAt;

      setMatchTeamSelection(project, 'home', createMatchTeamSelection({
        teamId: project.homeSelection.teamId,
        teamName: formData.homeTeamName.trim(),
        teamCode: project.homeSelection.teamCode ?? 'TBD',
        staff: formData.homeTeamStaff,
        roster: toMatchRosterPlayers(formData.homeTeamPlayers),
      }));

      setMatchTeamSelection(project, 'away', createMatchTeamSelection({
        teamId: project.awaySelection.teamId,
        teamName: formData.awayTeamName.trim(),
        teamCode: project.awaySelection.teamCode ?? 'TBD',
        staff: formData.awayTeamStaff,
        roster: toMatchRosterPlayers(formData.awayTeamPlayers),
      }));

      setActiveProject(normalizeMatchProject(project));

      // Navigate to scouting page to start live data collection
      navigate('/scouting');
    } catch (error) {
      console.error('Error creating match project:', error);
      // In a real app, you'd show a user-friendly error message
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="match-setup-form">
      <div className="form-group">
        <label htmlFor="match-title" className="form-label">
          {t('matchTitle')}
        </label>
        <input
          id="match-title"
          name="match-title"
          type="text"
          value={formData.title}
          onChange={(event) => handleInputChange('title', event.target.value)}
          placeholder={t('matchTitlePlaceholder')}
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="match-competition" className="form-label">
          {t('competition')}
        </label>
        <input
          id="match-competition"
          name="match-competition"
          type="text"
          value={formData.competition}
          onChange={(event) => handleInputChange('competition', event.target.value)}
          placeholder={t('competitionPlaceholder')}
          className="form-input"
        />
      </div>

      {/* Scouting scope */}
      <div className="form-group">
        <label className="form-label">{t('scoutingScope')}</label>
        <div className="scouting-scope-selector">
          {(['both', 'home', 'away'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={`scouting-scope-btn${scoutedTeamSide === side ? ' is-active' : ''}`}
              onClick={() => setScoutedTeamSide(side)}
            >
              {side === 'both' ? t('scoutBothTeams') : side === 'home' ? t('scoutHomeOnly') : t('scoutAwayOnly')}
            </button>
          ))}
        </div>
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
          hideRoster={scoutedTeamSide === 'away'}
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
          onPlayerRemove={(index) => handlePlayerRemove('away', index)}
          onRosterLoad={(players) => handleRosterLoad('away', players)}
          errors={errors}
          hideRoster={scoutedTeamSide === 'home'}
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
  );
}
