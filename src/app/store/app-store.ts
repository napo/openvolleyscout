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
  showDebugSubzones: boolean;
  toolbarScale: number;
  createProject: () => void;
  setActiveProject: (project: MatchProject) => void;
  closeProject: () => void;
  setShowDebugSubzones: (value: boolean) => void;
  setToolbarScale: (value: number) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  activeProject: null,
  showDebugSubzones: false,
  toolbarScale: 1.4,
  createProject: () => {
    set({ activeProject: createEmptyMatchProject() });
  },
  setActiveProject: (project) => {
    set({ activeProject: cloneProject(normalizeMatchProject(project)) });
  },
  closeProject: () => {
    set({ activeProject: null });
  },
  setShowDebugSubzones: (value) => {
    set({ showDebugSubzones: value });
  },
  setToolbarScale: (value) => {
    set({ toolbarScale: value });
  },
}));
