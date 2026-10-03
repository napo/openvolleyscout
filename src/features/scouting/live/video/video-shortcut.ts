/** A key combination, matched on KeyboardEvent.code so it ignores the keyboard layout. */
export interface VideoShortcut {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export const DEFAULT_VIDEO_SHORTCUT: VideoShortcut = {
  code: 'Space', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false,
};

const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight',
]);

const isFunctionKey = (code: string) => /^F([1-9]|1[0-9]|2[0-4])$/.test(code);

/**
 * The configurable shortcut also works while typing codes, so it must never
 * produce text: it needs Ctrl, Alt or Meta, or must be a function key.
 * Shift alone would still type a character.
 */
export function isUsableVideoShortcut(shortcut: VideoShortcut): boolean {
  if (!shortcut.code || MODIFIER_CODES.has(shortcut.code)) return false;
  return shortcut.ctrlKey || shortcut.altKey || shortcut.metaKey || isFunctionKey(shortcut.code);
}

export function videoShortcutFromEvent(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): VideoShortcut {
  return {
    code: event.code,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  };
}

export function matchesVideoShortcut(event: KeyboardEvent, shortcut: VideoShortcut): boolean {
  return event.code === shortcut.code
    && event.ctrlKey === shortcut.ctrlKey
    && event.altKey === shortcut.altKey
    && event.shiftKey === shortcut.shiftKey
    && event.metaKey === shortcut.metaKey;
}

const metaKeyLabel = () => (
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Cmd' : 'Win'
);

/** Human-readable label, e.g. "Ctrl+Space". `aria` uses the ARIA key names instead. */
export function formatVideoShortcut(shortcut: VideoShortcut, aria = false): string {
  const key = shortcut.code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '');
  return [
    shortcut.ctrlKey && (aria ? 'Control' : 'Ctrl'),
    shortcut.altKey && 'Alt',
    shortcut.shiftKey && 'Shift',
    shortcut.metaKey && (aria ? 'Meta' : metaKeyLabel()),
    key,
  ].filter(Boolean).join('+');
}
