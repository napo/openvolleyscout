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
  const activeProject = useAppStore((state) => state.activeProject);
  const closeProject = useAppStore((state) => state.closeProject);
  const [projects, setProjects] = useState<MatchProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      setErrorMessage('');
      const savedProjects = await matchRepository.list();
      setProjects(savedProjects);
    } catch (error) {
      console.error('Error loading saved projects:', error);
      setErrorMessage(t('projectLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, [t]);

  const openProject = async (project: MatchProject) => {
    try {
      setBusyProjectId(project.metadata.id);
      setErrorMessage('');
      const persistedProject = await matchRepository.getById(project.metadata.id);
      if (!persistedProject) {
        setErrorMessage(t('openProjectFailed'));
        return;
      }

      setActiveProject(persistedProject);
      navigate('/match');
    } catch (error) {
      console.error('Error opening project:', error);
      setErrorMessage(t('openProjectFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  const deleteProject = async (project: MatchProject) => {
    const confirmed = window.confirm(
      t('deleteProjectConfirmation', {
        name: project.metadata.title || project.metadata.competition || project.metadata.id,
      }),
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusyProjectId(project.metadata.id);
      setErrorMessage('');
      await matchRepository.delete(project.metadata.id);

      if (activeProject?.metadata.id === project.metadata.id) {
        closeProject();
      }

      await loadProjects();
      setStatusMessage(t('projectDeleted'));
    } catch (error) {
      console.error('Error deleting project:', error);
      setErrorMessage(t('projectDeleteFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <main style={{ padding: 'var(--space-xl)', minHeight: '100vh', background: 'var(--color-background)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-3xl)', color: 'var(--color-text-primary)' }}>{t('loadData')}</h1>
            <p style={{ margin: 'var(--space-sm) 0 0', color: 'var(--color-text-secondary)' }}>{t('loadDataDescription')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setStatusMessage('');
              void loadProjects();
            }}
            style={{ padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--color-text-secondary)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
          >
            {t('refreshData')}
          </button>
        </div>

        {errorMessage ? (
          <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)', background: 'rgba(185, 28, 28, 0.08)', color: '#b91c1c', borderRadius: 'var(--border-radius-sm)' }}>
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)', background: 'rgba(22, 163, 74, 0.08)', color: '#166534', borderRadius: 'var(--border-radius-sm)' }}>
            {statusMessage}
          </div>
        ) : null}

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
                    disabled={busyProjectId === project.metadata.id}
                    style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-primary)', color: 'var(--color-background)', border: 'none', borderRadius: 'var(--border-radius-sm)', cursor: 'pointer' }}
                  >
                    {t('continueSetup')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteProject(project);
                    }}
                    disabled={busyProjectId === project.metadata.id}
                    style={{ padding: 'var(--space-sm) var(--space-md)', background: 'transparent', color: '#b91c1c', border: '1px solid rgba(185, 28, 28, 0.28)', borderRadius: 'var(--border-radius-sm)', cursor: 'pointer' }}
                  >
                    {t('deleteProject')}
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
