import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { matchRepository } from '@src/infrastructure/repositories';
import type { MatchProject } from '@src/domain/match/types';

export function LoadDataPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const [projects, setProjects] = useState<MatchProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      const savedProjects = await matchRepository.list();
      setProjects(savedProjects);
      setIsLoading(false);
    };

    loadProjects();
  }, []);

  const openProject = async (project: MatchProject) => {
    const persistedProject = await matchRepository.getById(project.metadata.id);
    if (!persistedProject) {
      return;
    }

    setActiveProject(persistedProject);
    navigate('/scouting');
  };

  return (
    <main style={{ padding: 'var(--space-xl)', minHeight: '100vh', background: 'var(--color-background)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-3xl)', color: 'var(--color-text-primary)' }}>{t('loadData')}</h1>
            <p style={{ margin: 'var(--space-sm) 0 0', color: 'var(--color-text-secondary)' }}>{t('loadDataDescription')}</p>
          </div>
        </div>

        {isLoading ? (
          <p>{t('loading')}</p>
        ) : projects.length === 0 ? (
          <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)', borderRadius: 'var(--border-radius-md)', color: 'var(--color-text-secondary)' }}>
            {t('noSavedProjects')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            {projects.map((project) => {
              const homeTeam = getMatchTeamSnapshot(project, 'home');
              const awayTeam = getMatchTeamSnapshot(project, 'away');

              return (
              <div key={project.metadata.id} style={{ padding: 'var(--space-lg)', background: 'var(--color-surface)', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--shadow-sm)', display: 'grid', gap: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}>
                      {homeTeam.name} {t('vs')} {awayTeam.name}
                    </h2>
                    <p style={{ margin: 'var(--space-xs) 0 0', color: 'var(--color-text-secondary)' }}>
                      {project.metadata.competition || t('unknownCompetition')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void openProject(project);
                    }}
                    style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-primary)', color: 'var(--color-background)', border: 'none', borderRadius: 'var(--border-radius-sm)', cursor: 'pointer' }}
                  >
                    {t('openProject')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                  <span>{project.metadata.playedAt ? new Date(project.metadata.playedAt).toLocaleDateString() : t('dateUnavailable')}</span>
                  <span>{project.metadata.venue || t('venueUnavailable')}</span>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>
    </main>
  );
}
