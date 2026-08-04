function detectCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function shouldAllowAutoFocusForInput(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0,
  hasCoarsePointer = detectCoarsePointer(),
): boolean {
  // Primary signal: device's main pointer is touch-only (no mouse/trackpad),
  // which covers iPad, Android tablets, Windows tablet-mode, etc. without
  // relying on user-agent strings that vendors change over time.
  if (hasCoarsePointer) {
    return false;
  }
  // Fallback signals for browsers where the pointer media feature is
  // unreliable or unsupported (e.g. older WebViews).
  const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent);
  const isIPadOSSafari = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  return !isIOSDevice && !isIPadOSSafari;
}
