import type { BallTouch } from '@src/domain/touch/types';
import type { VideoSyncInterpolation, VideoSyncPoint } from '@src/domain/video/types';

/**
 * Event-clock helpers for video synchronization.
 *
 * Every touch can carry time information from different sources:
 * - `videoTimeSeconds` (DVW field 12): already relative to the match video;
 * - `recordedAtTime` (DVW field 7 / expert scouting, HH.MM.SS or HH:MM:SS): time of day;
 * - `recordedAtIso` / `createdAt`: real wall-clock timestamps from live scouting.
 *
 * Mixing domains would break offset math, so the whole project resolves to a
 * single clock domain and every touch is mapped onto it.
 */
export type EventClockDomain = 'video' | 'time-of-day' | 'none';

/** Timestamps below this value come from the synthetic import clock, not a real date. */
const REAL_TIMESTAMP_MINIMUM = Date.UTC(2000, 0, 1);

const SECONDS_PER_DAY = 24 * 60 * 60;

export function parseDataVolleyTimeToSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})[.:](\d{1,2})(?:[.:](\d{1,2}))?$/);
  if (!match) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

function isRealTimestamp(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= REAL_TIMESTAMP_MINIMUM;
}

function getTimeOfDaySeconds(touch: BallTouch): number | null {
  const fromRecordedTime = parseDataVolleyTimeToSeconds(touch.recordedAtTime);
  if (fromRecordedTime !== null) return fromRecordedTime;

  const timestamp = touch.recordedAtIso ? Date.parse(touch.recordedAtIso) : touch.createdAt;
  if (!isRealTimestamp(timestamp)) return null;

  const date = new Date(timestamp);
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

/**
 * Pick the clock domain for a set of touches: prefer DVW video times when any
 * touch carries them, otherwise fall back to time-of-day information.
 */
export function resolveEventClockDomain(touches: readonly BallTouch[]): EventClockDomain {
  if (touches.some((touch) => typeof touch.videoTimeSeconds === 'number')) {
    return 'video';
  }
  if (touches.some((touch) => getTimeOfDaySeconds(touch) !== null)) {
    return 'time-of-day';
  }
  return 'none';
}

export function getTouchEventClockSeconds(touch: BallTouch, domain: EventClockDomain): number | null {
  if (domain === 'video') {
    return typeof touch.videoTimeSeconds === 'number' ? touch.videoTimeSeconds : null;
  }
  if (domain === 'time-of-day') {
    return getTimeOfDaySeconds(touch);
  }
  return null;
}

function normalizeClockDelta(delta: number, domain: EventClockDomain): number {
  // Time-of-day clocks can wrap past midnight during an evening match.
  if (domain === 'time-of-day') {
    if (delta < -SECONDS_PER_DAY / 2) return delta + SECONDS_PER_DAY;
    if (delta > SECONDS_PER_DAY / 2) return delta - SECONDS_PER_DAY;
  }
  return delta;
}

/**
 * Map an event-clock value to a video position using the calibration anchors.
 *
 * With no anchors, DVW video times are trusted as-is; other domains cannot be
 * mapped. With anchors, adding a point never moves the actions before it:
 * - 'step': the offset of the nearest preceding anchor is applied;
 * - 'linear': between two anchors the offset changes gradually, reaching each
 *   anchor exactly.
 * Events before the first anchor use its offset, events after the last anchor
 * use the last one's, in both modes.
 *
 * 'single' points (per-action corrections) never contribute to the offset: when
 * `touchId` matches one, its video position is returned as-is.
 */
export function computeVideoSeconds(
  eventClockSeconds: number | null,
  syncPoints: readonly VideoSyncPoint[],
  domain: EventClockDomain,
  interpolation: VideoSyncInterpolation = 'step',
  touchId?: string,
): number | null {
  if (touchId !== undefined) {
    const correction = syncPoints.find((point) => point.scope === 'single' && point.touchId === touchId);
    if (correction) return Math.max(0, correction.videoSeconds);
  }
  if (eventClockSeconds === null) return null;

  const anchors = syncPoints.filter(isAnchorSyncPoint);

  // Bounded rally-scoped points (e.g. Rapid Sync) govern only [start, until)
  // without shifting actions at or after `untilEventClockSeconds`.
  // A newer/closer anchor inside that window still takes precedence.
  const rallyPoints = syncPoints.filter(
    (point) => point.scope !== 'single' && typeof point.untilEventClockSeconds === 'number',
  );
  if (rallyPoints.length > 0) {
    const matching = rallyPoints
      .filter((point) => {
        const fromStart = normalizeClockDelta(eventClockSeconds - point.eventClockSeconds, domain);
        const beforeEnd = normalizeClockDelta((point.untilEventClockSeconds as number) - eventClockSeconds, domain);
        return fromStart >= 0 && beforeEnd > 0;
      })
      .sort((left, right) => {
        const diff = normalizeClockDelta(left.eventClockSeconds - right.eventClockSeconds, domain);
        if (diff !== 0) return diff;
        return left.createdAt - right.createdAt;
      });
    const matched = matching[matching.length - 1];
    if (matched) {
      const overriddenByAnchor = anchors.some((anchor) => {
        if (normalizeClockDelta(eventClockSeconds - anchor.eventClockSeconds, domain) < 0) return false;
        const rel = normalizeClockDelta(anchor.eventClockSeconds - matched.eventClockSeconds, domain);
        return rel > 0 || (rel === 0 && anchor.createdAt > matched.createdAt);
      });
      if (!overriddenByAnchor) {
        const delta = normalizeClockDelta(eventClockSeconds - matched.eventClockSeconds, domain);
        return Math.max(0, matched.videoSeconds + delta);
      }
    }
  }

  if (anchors.length === 0) {
    return domain === 'video' ? Math.max(0, eventClockSeconds) : null;
  }

  const sorted = [...anchors].sort((left, right) => {
    const diff = normalizeClockDelta(left.eventClockSeconds - right.eventClockSeconds, domain);
    if (diff !== 0) return diff;
    return left.createdAt - right.createdAt;
  });
  let anchorIndex = 0;
  sorted.forEach((point, index) => {
    if (normalizeClockDelta(eventClockSeconds - point.eventClockSeconds, domain) >= 0) {
      anchorIndex = index;
    }
  });
  const anchor = sorted[anchorIndex];
  const delta = normalizeClockDelta(eventClockSeconds - anchor.eventClockSeconds, domain);

  const next = sorted[anchorIndex + 1];
  if (interpolation === 'linear' && next && delta >= 0) {
    const span = normalizeClockDelta(next.eventClockSeconds - anchor.eventClockSeconds, domain);
    if (span > 0) {
      const fraction = Math.min(1, delta / span);
      return Math.max(0, anchor.videoSeconds + fraction * (next.videoSeconds - anchor.videoSeconds));
    }
  }

  return Math.max(0, anchor.videoSeconds + delta);
}

export function isAnchorSyncPoint(point: VideoSyncPoint): boolean {
  return point.scope !== 'single' && typeof point.untilEventClockSeconds !== 'number';
}

export function formatVideoSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--:--';
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
}

/** An action that can carry a sync point: used when there is none to shift yet. */
export interface VideoSyncAnchorCandidate {
  touchId: string;
  label?: string;
  eventClockSeconds: number;
}

/**
 * Move the whole synchronization by `deltaSeconds`, e.g. after swapping a
 * YouTube source for a downloaded file whose start was trimmed differently.
 * Shifting every anchor by the same amount shifts every mapped action by it,
 * in both 'step' and 'linear' modes. A 'video' clock with no anchors (DVW
 * video times trusted as-is) gets one anchor carrying the offset, which a
 * single anchor applies to the whole match. Returns null when there is
 * nothing to shift.
 */
export function shiftVideoSync(
  syncPoints: readonly VideoSyncPoint[],
  deltaSeconds: number,
  domain: EventClockDomain,
  fallbackAnchor: VideoSyncAnchorCandidate | null,
  now: number = Date.now(),
): VideoSyncPoint[] | null {
  if (!Number.isFinite(deltaSeconds)) return null;
  // Per-action corrections move with everything else.
  const shifted = syncPoints.map((point) => ({ ...point, videoSeconds: Math.max(0, point.videoSeconds + deltaSeconds) }));
  if (syncPoints.some(isAnchorSyncPoint)) return shifted;
  if (domain !== 'video' || !fallbackAnchor) return shifted.length > 0 ? shifted : null;
  return [...shifted.filter((point) => point.touchId !== fallbackAnchor.touchId), {
    id: `sync-${fallbackAnchor.touchId}-${now}`,
    touchId: fallbackAnchor.touchId,
    label: fallbackAnchor.label,
    eventClockSeconds: fallbackAnchor.eventClockSeconds,
    videoSeconds: Math.max(0, fallbackAnchor.eventClockSeconds + deltaSeconds),
    createdAt: now,
  }];
}
