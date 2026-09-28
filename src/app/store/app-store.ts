import { create } from 'zustand';
import type { MatchProject } from '@src/domain/match/types';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { normalizeMatchProject } from '@src/domain/match';

// The open match survives page reloads: mobile browsers (iPad Safari, Android
// WebView) reload or kill background tabs, and scouting must pick up where it
// left off. Only the id is kept here; the match is read back from IndexedDB,
// where live scouting persists every event as it happens.
const ACTIVE_PROJECT_ID_KEY = 'openvolleyscout.activeProjectId';

export function readStoredActiveProjectId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

function storeActiveProjectId(projectId: string | null) {
  try {
    if (projectId) {
      window.localStorage.setItem(ACTIVE_PROJECT_ID_KEY, projectId);
    } else {
      window.localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the app works, only without restore.
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
    // The new match isn't saved yet: a reload must not reopen the previous one.
    storeActiveProjectId(null);
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
