import { useEffect, useState } from 'react';
import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/router/AppRouter';
import { readStoredActiveProjectId, useAppStore } from './app/store/app-store';
import { matchRepository } from './infrastructure/repositories';

/**
 * Reopens the match that was open before the page was reloaded. The router
 * waits for it, so a reload on /scouting lands back in the match instead of
 * the "create a match first" screen. Finished matches are not reopened: the
 * point is resuming live scouting, not jumping into last week's match.
 */
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
        const store = useAppStore.getState();
        if (store.activeProject) return;
        if (project && project.phase !== 'closed' && project.phase !== 'analysis') {
          store.setActiveProject(project);
        } else {
          // Deleted or finished since: forget it.
          store.closeProject();
        }
      })
      .catch((error) => console.error('[OpenVolleyScout] Could not reopen the last match:', error))
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
