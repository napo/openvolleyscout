import { useEffect, useState } from 'react';
import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/router/AppRouter';
import { readStoredActiveProjectId, useAppStore } from './app/store/app-store';
import { matchRepository } from './infrastructure/repositories';

/** Reopens the match that was open before the page was reloaded. */
function useRestoreActiveProject(): boolean {
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    const storedId = readStoredActiveProjectId();
    if (!storedId || useAppStore.getState().activeProject) {
      setIsRestored(true);
      return;
    }

    matchRepository.getById(storedId)
      .then((project) => {
        if (project && !useAppStore.getState().activeProject) {
          useAppStore.getState().setActiveProject(project);
        }
      })
      .catch((error) => console.error('Could not reopen the last match:', error))
      .finally(() => setIsRestored(true));
  }, []);

  return isRestored;
}

export default function App() {
  const isRestored = useRestoreActiveProject();

  return (
    <AppProviders>
      {isRestored ? <AppRouter /> : null}
    </AppProviders>
  );
}
