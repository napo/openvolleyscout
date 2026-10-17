import { create } from 'zustand';

/**
 * During live input the app menu is hidden (it costs a row of height and a
 * stray tap on it leaves the match); the live header opens it on demand.
 */
interface LiveMenuState {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
}

export const useLiveMenuStore = create<LiveMenuState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
}));
