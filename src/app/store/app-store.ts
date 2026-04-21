import { create } from 'zustand';
import type { MatchProject } from '@src/domain/match/types';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { normalizeMatchProject } from '@src/domain/match';

function cloneProject(project: MatchProject): MatchProject {
  if (typeof structuredClone === 'function') {
    return structuredClone(project);
  }

  return JSON.parse(JSON.stringify(project)) as MatchProject;
}

interface AppStoreState {
  activeProject: MatchProject | null;
  createProject: () => void;
  setActiveProject: (project: MatchProject) => void;
  closeProject: () => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  activeProject: null,
  createProject: () => {
    set({ activeProject: createEmptyMatchProject() });
  },
  setActiveProject: (project) => {
    // Keep the derived team snapshots aligned with the canonical selections at the store boundary.
    set({ activeProject: cloneProject(normalizeMatchProject(project)) });
  },
  closeProject: () => {
    set({ activeProject: null });
  },
}));
