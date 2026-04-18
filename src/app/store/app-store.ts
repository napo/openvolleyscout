import { create } from 'zustand';
import type { MatchProject } from '@src/domain/match/types';
import { createEmptyMatchProject } from '@src/domain/match/factories';

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
    set({ activeProject: project });
  },
  closeProject: () => {
    set({ activeProject: null });
  },
}));
