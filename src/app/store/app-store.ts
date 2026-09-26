import { create } from 'zustand';
import type { MatchProject } from '@src/domain/match/types';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { normalizeMatchProject } from '@src/domain/match';

// The open match survives reloads: iPad Safari reloads background tabs, and
// scouting must pick up where it left off. Only the id is stored; the match
// itself is read back from IndexedDB.
const ACTIVE_PROJECT_ID_KEY = 'syncscout-live.activeProjectId';

export function readStoredActiveProjectId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

function storeActiveProjectId(id: string | null) {
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_PROJECT_ID_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the app still works without restore.
  }
}

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
    storeActiveProjectId(project.metadata.id);
    set({ activeProject: cloneProject(normalizeMatchProject(project)) });
  },
  closeProject: () => {
    storeActiveProjectId(null);
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
