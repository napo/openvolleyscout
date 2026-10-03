import { create } from 'zustand';
import {
  DEFAULT_VIDEO_SHORTCUT,
  isUsableVideoShortcut,
  type VideoShortcut,
} from './video-shortcut';

const STORAGE_KEY = 'openvolleyscout.videoPlaybackShortcut';

function readStoredVideoShortcut(): VideoShortcut | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const shortcut: VideoShortcut = {
      code: typeof record.code === 'string' ? record.code : '',
      ctrlKey: record.ctrlKey === true,
      altKey: record.altKey === true,
      shiftKey: record.shiftKey === true,
      metaKey: record.metaKey === true,
    };
    return isUsableVideoShortcut(shortcut) ? shortcut : null;
  } catch {
    return null;
  }
}

function writeStoredVideoShortcut(shortcut: VideoShortcut) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcut));
  } catch {
    // Storage unavailable (private mode): the choice lasts for this session only.
  }
}

interface VideoShortcutState {
  shortcut: VideoShortcut;
  /** Returns false when the combination would also type text (no modifier, not an F-key). */
  setShortcut: (shortcut: VideoShortcut) => boolean;
  resetShortcut: () => void;
}

export const useVideoShortcutStore = create<VideoShortcutState>((set) => ({
  shortcut: readStoredVideoShortcut() ?? DEFAULT_VIDEO_SHORTCUT,
  setShortcut: (shortcut) => {
    if (!isUsableVideoShortcut(shortcut)) return false;
    set({ shortcut });
    writeStoredVideoShortcut(shortcut);
    return true;
  },
  resetShortcut: () => {
    set({ shortcut: DEFAULT_VIDEO_SHORTCUT });
    writeStoredVideoShortcut(DEFAULT_VIDEO_SHORTCUT);
  },
}));
