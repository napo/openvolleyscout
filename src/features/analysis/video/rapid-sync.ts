// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rapid synchronization: the video keeps playing and the scout taps once
 * when each serve starts, so a match whose gap to the video changes rally by
 * rally is lined up with one tap per rally instead of a pause-seek-confirm
 * cycle per point.
 *
 * A tap is a "from here on" sync point on that rally's serve. When the match
 * already has a trustworthy mapping (DVW video times, or an anchor on a clock
 * that follows the pace of play) the tap is bounded to its own rally instead,
 * so it corrects that rally without moving the ones after it.
 */
import type { VideoSyncPoint } from '@src/domain/video/types';
import { isAnchorSyncPoint } from './video-sync';

/** What the queue needs from an action of the list. */
export interface RapidSyncEntry {
  touchId: string;
  setNumber: number;
  rallyNumber: number;
  skill: string;
  eventClockSeconds: number | null;
}

/** The serves that can carry a sync point, one per rally, in match order. */
export function buildRapidSyncQueue<T extends RapidSyncEntry>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.skill === 'serve' && entry.eventClockSeconds !== null)
    .sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber)
    .filter((entry) => {
      const key = `${entry.setNumber}:${entry.rallyNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Where the queue starts: the rally of the selected action when there is
 * one, otherwise the serve after the last one already carrying a
 * "from here on" point, otherwise the first serve.
 */
export function getRapidSyncStartIndex(
  queue: readonly RapidSyncEntry[],
  syncPoints: readonly VideoSyncPoint[],
  selected: Pick<RapidSyncEntry, 'setNumber' | 'rallyNumber'> | null,
): number {
  if (queue.length === 0) return 0;
  if (selected) {
    const index = queue.findIndex((entry) => (
      entry.setNumber > selected.setNumber
      || (entry.setNumber === selected.setNumber && entry.rallyNumber >= selected.rallyNumber)
    ));
    return index < 0 ? queue.length - 1 : index;
  }
  const synced = new Set(syncPoints.filter((point) => point.scope !== 'single').map((point) => point.touchId));
  let last = -1;
  queue.forEach((entry, index) => {
    if (synced.has(entry.touchId)) last = index;
  });
  return Math.min(last + 1, queue.length - 1);
}

export interface AddRapidSyncPointOptions {
  /** Next serve in the queue; bounds the tap to `[entry, nextEntry)` when a baseline already exists. */
  nextEntry?: RapidSyncEntry | null;
  /** True when the match already has a baseline clock mapping (e.g. DVW video times or another anchor). */
  hasBaseline?: boolean;
  /**
   * False when the recorded clocks do not follow the pace of play (scouted
   * from a video with pauses): an earlier anchor is then no baseline for the
   * later rallies, and every tap applies from its rally on.
   */
  clockFollowsPlay?: boolean;
}

/** The sync points after a tap on `entry` at `videoSeconds`: one point per action, the new one wins. */
export function addRapidSyncPoint(
  syncPoints: readonly VideoSyncPoint[],
  entry: RapidSyncEntry,
  label: string,
  videoSeconds: number,
  now: number = Date.now(),
  options?: AddRapidSyncPointOptions,
): VideoSyncPoint[] {
  if (entry.eventClockSeconds === null) return [...syncPoints];
  const remaining = syncPoints.filter((point) => point.touchId !== entry.touchId);
  const hasBaseline = options?.hasBaseline
    || (options?.clockFollowsPlay !== false && remaining.some(isAnchorSyncPoint));
  const nextClock = options?.nextEntry?.eventClockSeconds;
  const untilEventClockSeconds = hasBaseline && typeof nextClock === 'number' && nextClock !== entry.eventClockSeconds
    ? nextClock
    : undefined;
  return [
    ...remaining,
    {
      id: `sync-${entry.touchId}-${now}`,
      touchId: entry.touchId,
      label,
      eventClockSeconds: entry.eventClockSeconds,
      videoSeconds: Math.max(0, videoSeconds),
      scope: 'anchor',
      ...(untilEventClockSeconds !== undefined ? { untilEventClockSeconds } : {}),
      createdAt: now,
    },
  ];
}
