/**
 * Instant "it registered" feedback while scouting: a short edge flash and,
 * optionally, a tone. iPad browsers cannot vibrate, and the scout's eyes are
 * on the court, so this confirms a tap without having to look at the toolbar.
 * The tone is synthesized (Web Audio), so there are no sound files to load.
 */
export type ConfirmFeedbackKind = 'touch' | 'point';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  // iOS starts contexts suspended until a user gesture; feedback always follows a tap.
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
  return audioContext;
}

function playTone(context: AudioContext, frequency: number, startOffset: number, duration: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + startOffset;
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function flashEdges(kind: ConfirmFeedbackKind) {
  if (typeof document === 'undefined') return;
  const flash = document.createElement('div');
  const color = kind === 'point' ? '47, 158, 106' : '75, 97, 209';
  Object.assign(flash.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2000',
    boxShadow: `inset 0 0 0 6px rgba(${color}, 0.85), inset 0 0 40px rgba(${color}, 0.35)`,
  });
  document.body.appendChild(flash);
  const animation = flash.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: kind === 'point' ? 450 : 260, easing: 'ease-out' });
  if (animation) {
    animation.onfinish = () => flash.remove();
  } else {
    window.setTimeout(() => flash.remove(), 300);
  }
}

export function playConfirmFeedback(kind: ConfirmFeedbackKind, withSound: boolean): void {
  flashEdges(kind);
  if (!withSound) return;
  try {
    const context = getAudioContext();
    if (!context) return;
    if (kind === 'point') {
      playTone(context, 660, 0, 0.09);
      playTone(context, 990, 0.1, 0.12);
    } else {
      playTone(context, 880, 0, 0.06);
    }
  } catch {
    // Sound is a nicety; never let it break scouting.
  }
}
