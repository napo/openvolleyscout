import { useEffect, useRef } from 'react';
import { useVideoShortcutStore } from './video-shortcut-store';
import { DEFAULT_VIDEO_SHORTCUT, matchesVideoShortcut, type VideoShortcut } from './video-shortcut';

/**
 * Plain Space toggles playback outside text fields, captured before a focused
 * scouting button can activate or scroll. The configurable shortcut
 * (Ctrl+Space by default) also works while typing codes, where Space has to
 * stay a separator.
 */
export function handleVideoPlaybackShortcut(
  event: KeyboardEvent,
  togglePlay: () => void,
  shortcut: VideoShortcut = DEFAULT_VIDEO_SHORTCUT,
) {
  if (event.defaultPrevented || event.isComposing) return;

  const consume = () => {
    event.preventDefault();
    event.stopPropagation();
    // Holding the key should pause once, not repeatedly switch playback.
    if (!event.repeat) togglePlay();
  };

  if (matchesVideoShortcut(event, shortcut)) {
    if (document.querySelector('[aria-modal="true"], dialog[open]')) return;
    consume();
    return;
  }

  if (
    (event.code !== 'Space' && event.key !== ' ')
    || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
  ) return;

  const target = event.target instanceof Element ? event.target : null;
  if (
    target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], dialog')
    || document.querySelector('[aria-modal="true"], dialog[open]')
  ) return;

  consume();
}

export function useVideoPlaybackShortcut(enabled: boolean, togglePlay: () => void) {
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => handleVideoPlaybackShortcut(
      event,
      () => toggleRef.current(),
      useVideoShortcutStore.getState().shortcut,
    );
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
