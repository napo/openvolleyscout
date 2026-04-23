import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { matchRepository } from '@src/infrastructure/repositories';
import type { MatchProject } from '@src/domain/match/types';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';

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
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card"
          headerClassName="app-page-card__header"
          contentClassName="app-page-card__content load-data-page__content"
          header={(
            <>
              <div className="app-page-card__header-copy">
                <h1 className="app-page-card__title">{t('loadData')}</h1>
                <p className="app-page-card__description">{t('loadDataDescription')}</p>
              </div>
              <div className="app-page-card__header-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => {
                    setIsLoading(true);
                    setStatusMessage('');
                    void loadProjects();
                  }}
                >
                  {t('refreshData')}
                </button>
              </div>
            </>
          )}
        >

        {errorMessage ? (
          <div className="app-page-message app-page-message--error">
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="app-page-message app-page-message--success">
            {statusMessage}
          </div>
        ) : null}

        {isLoading ? (
          <p className="load-data-page__loading">{t('loading')}</p>
        ) : projects.length === 0 ? (
          <div className="load-data-page__empty">
            {t('noSavedProjects')}
          </div>
        ) : (
          <div className="load-data-page__list">
            {projects.map((project) => {
              const homeTeam = getMatchTeamSnapshot(project, 'home');
              const awayTeam = getMatchTeamSnapshot(project, 'away');

              return (
              <div key={project.metadata.id} className="load-data-card">
                <div className="load-data-card__header">
                  <div className="load-data-card__summary">
                    <h2 className="load-data-card__title">
                      {homeTeam.name} {t('vs')} {awayTeam.name}
                    </h2>
                    <p className="load-data-card__competition">
                      {project.metadata.competition || t('unknownCompetition')}
                    </p>
                  </div>
                  <div className="load-data-card__actions">
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => {
                        void openProject(project);
                      }}
                      disabled={busyProjectId === project.metadata.id}
                    >
                      {t('continueSetup')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small load-data-card__delete"
                      onClick={() => {
                        void deleteProject(project);
                      }}
                      disabled={busyProjectId === project.metadata.id}
                    >
                      {t('deleteProject')}
                    </button>
                  </div>
                </div>
                <div className="load-data-card__meta">
                  <span>{project.metadata.playedAt ? new Date(project.metadata.playedAt).toLocaleDateString() : t('dateUnavailable')}</span>
                  <span>{project.metadata.venue || t('venueUnavailable')}</span>
                </div>
              </div>
            )})}
          </div>
        )}
        </AppPageLayout>
      </div>
    </main>
  );
}
