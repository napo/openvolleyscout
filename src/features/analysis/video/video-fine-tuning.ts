// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Fine tuning from the keyboard in Video analysis: move the selected action's
 * video time by small steps and step the video frame by frame.
 */
import type { VideoSyncPoint } from '@src/domain/video/types';

export const NUDGE_STEP_SECONDS = 0.5;
export const NUDGE_FINE_STEP_SECONDS = 0.1;
/** One frame at 30 fps: close enough for 25-60 fps footage. */
export const FRAME_STEP_SECONDS = 1 / 30;

export type FineTuneAction =
  | { kind: 'nudge'; seconds: number }
  | { kind: 'frame'; direction: -1 | 1 };

/**
 * Q / W move the selected action 0.5 s earlier / later (with Shift 0.1 s);
 * Shift + ← / → step the video by one frame. Ignored while typing.
 */
export function getFineTuneAction(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): FineTuneAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = typeof Element !== 'undefined' && event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], dialog')) return null;
  const key = event.key.toLowerCase();
  const step = event.shiftKey ? NUDGE_FINE_STEP_SECONDS : NUDGE_STEP_SECONDS;
  if (key === 'q') return { kind: 'nudge', seconds: -step };
  if (key === 'w') return { kind: 'nudge', seconds: step };
  if (event.shiftKey && event.key === 'ArrowLeft') return { kind: 'frame', direction: -1 };
  if (event.shiftKey && event.key === 'ArrowRight') return { kind: 'frame', direction: 1 };
  return null;
}

/**
 * The sync points after moving one action by `deltaSeconds` from where it
 * plays now: a "this action only" correction, replacing any correction it had.
 * A point that already governs other actions ("from here on", "this rally")
 * keeps its scope and is moved with it.
 */
export function nudgeActionSyncPoint(
  syncPoints: readonly VideoSyncPoint[],
  action: { touchId: string; label?: string; eventClockSeconds: number | null },
  currentVideoSeconds: number,
  deltaSeconds: number,
  now: number = Date.now(),
): VideoSyncPoint[] {
  const videoSeconds = Math.max(0, Math.round((currentVideoSeconds + deltaSeconds) * 100) / 100);
  const existing = syncPoints.find((point) => point.touchId === action.touchId);
  if (existing && existing.scope !== 'single') {
    return syncPoints.map((point) => (point === existing ? { ...point, videoSeconds } : point));
  }
  return [
    ...syncPoints.filter((point) => point.touchId !== action.touchId),
    {
      id: existing?.id ?? `sync-${action.touchId}-${now}`,
      touchId: action.touchId,
      label: action.label,
      eventClockSeconds: action.eventClockSeconds ?? 0,
      videoSeconds,
      scope: 'single',
      createdAt: existing?.createdAt ?? now,
    },
  ];
}
