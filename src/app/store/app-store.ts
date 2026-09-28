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

// Display and input preferences, kept across reloads.
const PREFERENCES_KEY = 'openvolleyscout.preferences';

/** 'court': draw the ball on the court. 'tag': buttons only (player → evaluation). */
export type InputMode = 'court' | 'tag';

/**
 * Touch-only devices (tablets, phones) start with the large-button Court
 * input; devices with a mouse or trackpad start with the Detailed input.
 * Either way the scout confirms or changes it the first time live scouting
 * opens (see InputLevelChooser).
 */
export function isTouchOnlyDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}

type Preferences = {
  showDebugSubzones: boolean;
  hideImportWarnings: boolean;
  toolbarScale: number;
  markerScale: number;
  confirmPointAssignment: boolean;
  simpleInput: boolean;
  inputMode: InputMode;
  /** Whether the scout has picked Tags / Court / Detailed at least once. */
  inputLevelChosen: boolean;
  feedbackSound: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  showDebugSubzones: false,
  hideImportWarnings: false,
  toolbarScale: 1.4,
  markerScale: 1.5,
  confirmPointAssignment: true,
  // Large touch buttons, no DataVolley detail rows (ball type, blockers, calls).
  simpleInput: isTouchOnlyDevice(),
  inputMode: 'court',
  inputLevelChosen: false,
  feedbackSound: true,
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
      inputMode: state.inputMode,
      inputLevelChosen: state.inputLevelChosen,
      feedbackSound: state.feedbackSound,
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
  inputMode: InputMode;
  inputLevelChosen: boolean;
  feedbackSound: boolean;
  createProject: () => void;
  setActiveProject: (project: MatchProject) => void;
  closeProject: () => void;
  setShowDebugSubzones: (value: boolean) => void;
  setHideImportWarnings: (value: boolean) => void;
  setToolbarScale: (value: number) => void;
  setMarkerScale: (value: number) => void;
  setConfirmPointAssignment: (value: boolean) => void;
  setSimpleInput: (value: boolean) => void;
  setInputMode: (value: InputMode) => void;
  setInputLevelChosen: (value: boolean) => void;
  setFeedbackSound: (value: boolean) => void;
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
  setInputMode: (value) => {
    setPreference({ inputMode: value });
  },
  setInputLevelChosen: (value) => {
    setPreference({ inputLevelChosen: value });
  },
  setFeedbackSound: (value) => {
    setPreference({ feedbackSound: value });
  },
  };
});
