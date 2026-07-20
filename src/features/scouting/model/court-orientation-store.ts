import { create } from 'zustand';
import type { ScoutingCourtOrientation } from '@src/domain/spatial';

const STORAGE_KEY = 'openvolleyscout.courtOrientation';

function readStoredCourtOrientation(): ScoutingCourtOrientation | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  return rawValue === 'vertical' || rawValue === 'horizontal' ? rawValue : null;
}

function writeStoredCourtOrientation(value: ScoutingCourtOrientation) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, value);
}

interface CourtOrientationState {
  orientation: ScoutingCourtOrientation;
  setOrientation: (value: ScoutingCourtOrientation) => void;
}

export const useCourtOrientationStore = create<CourtOrientationState>((set) => ({
  orientation: readStoredCourtOrientation() ?? 'horizontal',
  setOrientation: (value) => {
    set({ orientation: value });
    writeStoredCourtOrientation(value);
  },
}));
