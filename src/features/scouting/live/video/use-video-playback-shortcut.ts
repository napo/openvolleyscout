import { useEffect, useRef } from 'react';

/** Capture Space before a focused scouting button can activate or scroll. */
export function handleVideoPlaybackShortcut(event: KeyboardEvent, togglePlay: () => void) {
  if (
    (event.code !== 'Space' && event.key !== ' ')
    || event.defaultPrevented || event.isComposing
    || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
  ) return;

  const target = event.target instanceof Element ? event.target : null;
  if (
    target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], dialog')
    || document.querySelector('[aria-modal="true"], dialog[open]')
  ) return;

  event.preventDefault();
  event.stopPropagation();
  // Holding the key should pause once, not repeatedly switch playback.
  if (!event.repeat) togglePlay();
}

export function useVideoPlaybackShortcut(enabled: boolean, togglePlay: () => void) {
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => handleVideoPlaybackShortcut(event, () => toggleRef.current());
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
