import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@src/app/store/app-store';
import type { MatchProject } from '@src/domain/match/types';
import { matchRepository } from '@src/infrastructure/repositories';
import { useScoutingStore } from './scouting-store';
import { isProjectSyncedWithLiveMatch, syncProjectWithLiveMatch } from './session';

type PendingPersistence = {
  project: MatchProject;
  key: string;
};

function createPersistenceKey(project: MatchProject) {
  return [
    project.metadata.id,
    project.updatedAt,
    project.events.length,
    project.events.at(-1)?.id ?? 'none',
  ].join(':');
}

export function useScoutingPersistence(activeProject: MatchProject | null) {
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const liveMatch = useScoutingStore((state) => state.liveMatch);
  const pendingPersistenceRef = useRef<PendingPersistence | null>(null);
  const isPersistingRef = useRef(false);

  const flushPersistence = useCallback(async () => {
    if (isPersistingRef.current) {
      return;
    }

    isPersistingRef.current = true;

    try {
      while (pendingPersistenceRef.current) {
        const nextPersistence = pendingPersistenceRef.current;
        pendingPersistenceRef.current = null;

        const persistedProject = await matchRepository.update(nextPersistence.project);

        if (createPersistenceKey(persistedProject) === nextPersistence.key) {
          setActiveProject(persistedProject);
        }
      }
    } finally {
      isPersistingRef.current = false;
    }
  }, [setActiveProject]);

  useEffect(() => {
    if (!activeProject || !liveMatch) {
      return;
    }

    if (activeProject.metadata.id !== liveMatch.activeProjectId) {
      return;
    }

    if (isProjectSyncedWithLiveMatch(activeProject, liveMatch)) {
      return;
    }

    const nextProject = syncProjectWithLiveMatch(activeProject, liveMatch);
    pendingPersistenceRef.current = {
      project: nextProject,
      key: createPersistenceKey(nextProject),
    };

    void flushPersistence();
  }, [activeProject, flushPersistence, liveMatch]);
}
