import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleVideoPlaybackShortcut } from './use-video-playback-shortcut';

class ShortcutTarget {
  constructor(private readonly protectedControl = false) {}
  closest() { return this.protectedControl ? this : null; }
}

afterEach(() => vi.unstubAllGlobals());

function pressSpace(overrides: Record<string, unknown> = {}, modalOpen = false) {
  vi.stubGlobal('Element', ShortcutTarget);
  vi.stubGlobal('document', { querySelector: () => modalOpen ? {} : null });
  const togglePlay = vi.fn();
  const event = {
    code: 'Space', key: ' ', target: new ShortcutTarget(),
    defaultPrevented: false, isComposing: false, repeat: false,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), ...overrides,
  };
  handleVideoPlaybackShortcut(event as unknown as KeyboardEvent, togglePlay);
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

  it.each(['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing', 'defaultPrevented'])('ignores %s', (flag) => {
    const { event, togglePlay } = pressSpace({ [flag]: true });
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const { event, togglePlay } = pressSpace({ code: 'Enter', key: 'Enter' });
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
