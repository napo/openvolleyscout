import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAppStore } from '../../../app/store/app-store';
import { createEmptyMatchProject } from '@src/domain/match/factories';

export function MatchSetupForm() {
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const [title, setTitle] = useState('');
  const [competition, setCompetition] = useState('');
  const [homeTeamName, setHomeTeamName] = useState('Home Team');
  const [awayTeamName, setAwayTeamName] = useState('Away Team');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    const project = createEmptyMatchProject();
    const updatedAt = Date.now();

    project.metadata.title = title.trim() || undefined;
    project.metadata.competition = competition.trim() || undefined;
    project.homeTeam.name = homeTeamName.trim() || project.homeTeam.name;
    project.awayTeam.name = awayTeamName.trim() || project.awayTeam.name;
    project.updatedAt = updatedAt;

    setActiveProject(project);
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-lg)', maxWidth: '560px', background: 'var(--color-background)', padding: 'var(--space-xl)', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        <label htmlFor="match-title" style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>{t('matchTitle')}</label>
        <input
          id="match-title"
          name="match-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="E.g. OpenVolleyScout Invitational"
          style={{ padding: 'var(--space-md)', fontSize: 'var(--font-size-base)', width: '100%', border: '1px solid var(--color-text-secondary)', borderRadius: 'var(--border-radius-sm)', background: 'var(--color-background)', color: 'var(--color-text-primary)' }}
        />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        <label htmlFor="match-competition" style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>{t('competition')}</label>
        <input
          id="match-competition"
          name="match-competition"
          type="text"
          value={competition}
          onChange={(event) => setCompetition(event.target.value)}
          placeholder="E.g. Season 2026"
          style={{ padding: 'var(--space-md)', fontSize: 'var(--font-size-base)', width: '100%', border: '1px solid var(--color-text-secondary)', borderRadius: 'var(--border-radius-sm)', background: 'var(--color-background)', color: 'var(--color-text-primary)' }}
        />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        <label htmlFor="home-team-name" style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>{t('homeTeam')}</label>
        <input
          id="home-team-name"
          name="home-team-name"
          type="text"
          value={homeTeamName}
          onChange={(event) => setHomeTeamName(event.target.value)}
          style={{ padding: 'var(--space-md)', fontSize: 'var(--font-size-base)', width: '100%', border: '1px solid var(--color-text-secondary)', borderRadius: 'var(--border-radius-sm)', background: 'var(--color-background)', color: 'var(--color-text-primary)' }}
        />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        <label htmlFor="away-team-name" style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>{t('awayTeam')}</label>
        <input
          id="away-team-name"
          name="away-team-name"
          type="text"
          value={awayTeamName}
          onChange={(event) => setAwayTeamName(event.target.value)}
          style={{ padding: 'var(--space-md)', fontSize: 'var(--font-size-base)', width: '100%', border: '1px solid var(--color-text-secondary)', borderRadius: 'var(--border-radius-sm)', background: 'var(--color-background)', color: 'var(--color-text-primary)' }}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          padding: 'var(--space-md) var(--space-lg)',
          fontSize: 'var(--font-size-base)',
          fontWeight: 'var(--font-weight-medium)',
          background: 'var(--color-primary)',
          color: 'var(--color-background)',
          border: 'none',
          borderRadius: 'var(--border-radius-sm)',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-secondary)'}
        onMouseOut={(e) => e.currentTarget.style.background = 'var(--color-primary)'}
      >
        {isSubmitting ? 'Creating…' : t('createNewMatch')}
      </button>
    </form>
  );
}
