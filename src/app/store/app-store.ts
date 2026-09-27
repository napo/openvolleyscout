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

// Display and input preferences, kept across reloads.
const PREFERENCES_KEY = 'syncscout-live.preferences';

type Preferences = {
  showDebugSubzones: boolean;
  hideImportWarnings: boolean;
  toolbarScale: number;
  markerScale: number;
  confirmPointAssignment: boolean;
  simpleInput: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  showDebugSubzones: false,
  hideImportWarnings: false,
  toolbarScale: 1.4,
  markerScale: 1.5,
  confirmPointAssignment: true,
  // Large touch buttons, no DataVolley detail rows (ball type, blockers, calls).
  simpleInput: true,
};

function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    return raw ? { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(state: Preferences) {
  try {
    const preferences: Preferences = {
      showDebugSubzones: state.showDebugSubzones,
      hideImportWarnings: state.hideImportWarnings,
      toolbarScale: state.toolbarScale,
      markerScale: state.markerScale,
      confirmPointAssignment: state.confirmPointAssignment,
      simpleInput: state.simpleInput,
    };
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences simply reset on the next reload when storage is unavailable.
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
  simpleInput: boolean;
  createProject: () => void;
  setActiveProject: (project: MatchProject) => void;
  closeProject: () => void;
  setShowDebugSubzones: (value: boolean) => void;
  setHideImportWarnings: (value: boolean) => void;
  setToolbarScale: (value: number) => void;
  setMarkerScale: (value: number) => void;
  setConfirmPointAssignment: (value: boolean) => void;
  setSimpleInput: (value: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set, get) => {
  const setPreference = (patch: Partial<Preferences>) => {
    set(patch);
    savePreferences(get());
  };

  return {
  activeProject: null,
  ...loadPreferences(),
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
    setPreference({ showDebugSubzones: value });
  },
  setHideImportWarnings: (value) => {
    setPreference({ hideImportWarnings: value });
  },
  setToolbarScale: (value) => {
    setPreference({ toolbarScale: value });
  },
  setMarkerScale: (value) => {
    setPreference({ markerScale: value });
  },
  setConfirmPointAssignment: (value) => {
    setPreference({ confirmPointAssignment: value });
  },
  setSimpleInput: (value) => {
    setPreference({ simpleInput: value });
  },
  };
});
