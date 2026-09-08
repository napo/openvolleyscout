import { create } from 'zustand';

const STORAGE_KEY = 'openvolleyscout.displaySideSwap';

interface StoredDisplaySideSwap {
  activeProjectId: string;
  setNumber: number;
  swapped: boolean;
}

function readStoredSwap(): StoredDisplaySideSwap | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredDisplaySideSwap>;
    if (
      typeof parsed.activeProjectId === 'string'
      && typeof parsed.setNumber === 'number'
      && typeof parsed.swapped === 'boolean'
    ) {
      return parsed as StoredDisplaySideSwap;
    }
  } catch {
    return null;
  }

  return null;
}

function writeStoredSwap(value: StoredDisplaySideSwap) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

interface DisplaySideSwapState {
  stored: StoredDisplaySideSwap | null;
  isSwapped: (activeProjectId: string, setNumber: number) => boolean;
  toggleSwapped: (activeProjectId: string, setNumber: number) => void;
}

/**
 * Persisted per match/set so the "swap sides" toggle (used when teams change
 * ends mid-set, e.g. the deciding-set 8-point switch) survives a ScoutingPage
 * remount or app reload. It must NOT reset to plain component state, since a
 * stale mismatch here silently flips home/away for the keyboard point
 * shortcuts and manual point buttons.
 */
export const useDisplaySideSwapStore = create<DisplaySideSwapState>((set, get) => ({
  stored: readStoredSwap(),
  isSwapped: (activeProjectId, setNumber) => {
    const { stored } = get();
    return stored !== null
      && stored.activeProjectId === activeProjectId
      && stored.setNumber === setNumber
      && stored.swapped;
  },
  toggleSwapped: (activeProjectId, setNumber) => {
    const current = get().isSwapped(activeProjectId, setNumber);
    const value: StoredDisplaySideSwap = { activeProjectId, setNumber, swapped: !current };
    writeStoredSwap(value);
    set({ stored: value });
  },
}));
