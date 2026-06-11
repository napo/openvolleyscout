import type { BallTouch } from '@src/domain/touch/types';
import type { VideoSyncPoint } from '@src/domain/video/types';

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
  if (domain === 'time-of-day' && delta < -SECONDS_PER_DAY / 2) {
    return delta + SECONDS_PER_DAY;
  }
  return delta;
}

/**
 * Map an event-clock value to a video position using the calibration anchors.
 *
 * With no anchors, DVW video times are trusted as-is; other domains cannot be
 * mapped. With anchors, the offset of the nearest preceding anchor is applied
 * (falling back to the first anchor for events before any anchor).
 */
export function computeVideoSeconds(
  eventClockSeconds: number | null,
  syncPoints: readonly VideoSyncPoint[],
  domain: EventClockDomain,
): number | null {
  if (eventClockSeconds === null) return null;

  if (syncPoints.length === 0) {
    return domain === 'video' ? Math.max(0, eventClockSeconds) : null;
  }

  const sorted = [...syncPoints].sort((left, right) => left.eventClockSeconds - right.eventClockSeconds);
  let anchor = sorted[0];
  for (const point of sorted) {
    if (point.eventClockSeconds <= eventClockSeconds) {
      anchor = point;
    } else {
      break;
    }
  }

  const delta = normalizeClockDelta(eventClockSeconds - anchor.eventClockSeconds, domain);
  return Math.max(0, anchor.videoSeconds + delta);
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
