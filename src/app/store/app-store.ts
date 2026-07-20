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
  hideImportWarnings: boolean;
  toolbarScale: number;
  markerScale: number;
  confirmPointAssignment: boolean;
  createProject: () => void;
  setActiveProject: (project: MatchProject) => void;
  closeProject: () => void;
  setShowDebugSubzones: (value: boolean) => void;
  setHideImportWarnings: (value: boolean) => void;
  setToolbarScale: (value: number) => void;
  setMarkerScale: (value: number) => void;
  setConfirmPointAssignment: (value: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  activeProject: null,
  showDebugSubzones: false,
  hideImportWarnings: false,
  toolbarScale: 1.4,
  markerScale: 1.5,
  confirmPointAssignment: true,
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
  setHideImportWarnings: (value) => {
    set({ hideImportWarnings: value });
  },
  setToolbarScale: (value) => {
    set({ toolbarScale: value });
  },
  setMarkerScale: (value) => {
    set({ markerScale: value });
  },
  setConfirmPointAssignment: (value) => {
    set({ confirmPointAssignment: value });
  },
}));
