import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleVideoPlaybackShortcut } from './use-video-playback-shortcut';
import { DEFAULT_VIDEO_SHORTCUT, formatVideoShortcut, isUsableVideoShortcut, type VideoShortcut } from './video-shortcut';

class ShortcutTarget {
  constructor(private readonly protectedControl = false) {}
  closest() { return this.protectedControl ? this : null; }
}

afterEach(() => vi.unstubAllGlobals());

function pressSpace(overrides: Record<string, unknown> = {}, modalOpen = false, shortcut: VideoShortcut = DEFAULT_VIDEO_SHORTCUT) {
  vi.stubGlobal('Element', ShortcutTarget);
  vi.stubGlobal('document', { querySelector: () => modalOpen ? {} : null });
  const togglePlay = vi.fn();
  const event = {
    code: 'Space', key: ' ', target: new ShortcutTarget(),
    defaultPrevented: false, isComposing: false, repeat: false,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), ...overrides,
  };
  handleVideoPlaybackShortcut(event as unknown as KeyboardEvent, togglePlay, shortcut);
  return { event, togglePlay };
}

describe('scouting video Space shortcut', () => {
  it('toggles playback with focus on a scouting button and consumes its activation', () => {
    const { event, togglePlay } = pressSpace();
    expect(togglePlay).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('consumes repeated Space presses without toggling again', () => {
    const { event, togglePlay } = pressSpace({ repeat: true });
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('preserves Space in text fields and other protected controls', () => {
    const { event, togglePlay } = pressSpace({ target: new ShortcutTarget(true) });
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves modal keyboard interaction alone even when focus is outside the modal', () => {
    const { event, togglePlay } = pressSpace({}, true);
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each(['metaKey', 'altKey', 'shiftKey', 'isComposing', 'defaultPrevented'])('ignores %s', (flag) => {
    const { event, togglePlay } = pressSpace({ [flag]: true });
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const { event, togglePlay } = pressSpace({ code: 'Enter', key: 'Enter' });
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('toggles with Ctrl+Space even while typing in a text field', () => {
    const { event, togglePlay } = pressSpace({ ctrlKey: true, target: new ShortcutTarget(true) });
    expect(togglePlay).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves Ctrl+Space alone while a modal is open', () => {
    const { togglePlay } = pressSpace({ ctrlKey: true }, true);
    expect(togglePlay).not.toHaveBeenCalled();
  });

  it('uses a custom shortcut instead of Ctrl+Space', () => {
    const f2: VideoShortcut = { code: 'F2', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    const custom = pressSpace({ code: 'F2', key: 'F2', target: new ShortcutTarget(true) }, false, f2);
    expect(custom.togglePlay).toHaveBeenCalledOnce();
    const oldDefault = pressSpace({ ctrlKey: true, target: new ShortcutTarget(true) }, false, f2);
    expect(oldDefault.togglePlay).not.toHaveBeenCalled();
  });
});

describe('video shortcut configuration', () => {
  const combo = (code: string, mods: Partial<VideoShortcut> = {}): VideoShortcut => ({
    code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
  });

  it('accepts combinations that can never type a character', () => {
    expect(isUsableVideoShortcut(DEFAULT_VIDEO_SHORTCUT)).toBe(true);
    expect(isUsableVideoShortcut(combo('KeyP', { altKey: true }))).toBe(true);
    expect(isUsableVideoShortcut(combo('F2'))).toBe(true);
  });

  it('rejects plain or Shift-only keys and bare modifiers', () => {
    expect(isUsableVideoShortcut(combo('Space'))).toBe(false);
    expect(isUsableVideoShortcut(combo('KeyP', { shiftKey: true }))).toBe(false);
    expect(isUsableVideoShortcut(combo('ControlLeft', { ctrlKey: true }))).toBe(false);
  });

  it('formats labels for the UI and for aria-keyshortcuts', () => {
    expect(formatVideoShortcut(DEFAULT_VIDEO_SHORTCUT)).toBe('Ctrl+Space');
    expect(formatVideoShortcut(DEFAULT_VIDEO_SHORTCUT, true)).toBe('Control+Space');
    expect(formatVideoShortcut(combo('KeyP', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+P');
  });
});
