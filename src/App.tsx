import { useEffect, useState } from 'react';
import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/router/AppRouter';
import { readStoredActiveProjectId, useAppStore } from './app/store/app-store';
import { matchRepository } from './infrastructure/repositories';
import { seedDemoMatchOnce } from './features/demo/demo-match';
import { ConfirmDialogHost } from './components/confirm-dialog';
import { cloudSyncController } from './features/sync/cloud';
import { ScoutingClaimKeeper } from './features/sync/cloud/ScoutingClaimKeeper';
import { CloudVideoUploadPrompt } from './features/sync/cloud/CloudVideoUploadPrompt';
import { hydrateDefenseSystemsFromDatabase, hydrateReceptionSystemsFromDatabase } from './features/systems/model';

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
  useEffect(() => {
    void seedDemoMatchOnce();
    // Systems live in the database (cloud sync reads them there): load them before sync starts.
    void Promise.all([hydrateReceptionSystemsFromDatabase(), hydrateDefenseSystemsFromDatabase()])
      .catch((error) => console.warn('Could not load the systems from the database', error))
      .finally(() => void cloudSyncController.init());
  }, []);

  return (
    <AppProviders>
      {isRestored ? <AppRouter /> : null}
      <ConfirmDialogHost />
      <ScoutingClaimKeeper />
      <CloudVideoUploadPrompt />
    </AppProviders>
  );
}
