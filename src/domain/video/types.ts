/**
 * Video analysis model persisted inside a match project.
 *
 * OVS never stores the video itself: only its path/URL plus the
 * synchronization points needed to map scouting events to video time.
 */

export type MatchVideoSource =
  | {
      kind: 'file';
      /** Absolute path (desktop) or file name (browser picker) used to re-locate the video. */
      path: string;
      fileName?: string;
    }
  | {
      kind: 'youtube';
      url: string;
      videoId: string;
    }
  | {
      kind: 'webcam';
      /** getUserMedia device id. Meaningless on another machine, like a moved file path. */
      deviceId?: string;
      deviceLabel?: string;
      /** 'live-monitor': shows the feed, records nothing. 'recorded': also writes to recordingPath. */
      mode: 'live-monitor' | 'recorded';
      /** Absolute temp-file path (desktop only) while a recording is in progress or done. */
      recordingPath?: string;
    }
  | {
      kind: 'rtsp';
      /** rtsp://[user:pass@]host[:port]/path — credentials may be embedded. Always live, never recorded. */
      url: string;
    };

/**
 * A calibration anchor: the user paused the video on a known scouting event
 * (typically the first serve of the match) and confirmed the position.
 */
export interface VideoSyncPoint {
  id: string;
  /** Touch the anchor refers to. */
  touchId: string;
  /** Human readable label of the anchored action (e.g. its DataVolley code). */
  label?: string;
  /** Event clock of the anchored touch, in seconds (see video-sync helpers). */
  eventClockSeconds: number;
  /** Video position chosen by the user for that touch, in seconds. */
  videoSeconds: number;
  /**
   * 'anchor' (default, also for older projects): sets the video offset for the
   * following actions. 'single': pins only this action, the others are untouched.
   */
  scope?: VideoSyncPointScope;
  /**
   * Optional upper bound (exclusive, in event clock seconds) for a rally-scoped
   * sync point (used by Rapid Sync). When set, this point governs only
   * `[eventClockSeconds, untilEventClockSeconds)` without shifting later rallies.
   */
  untilEventClockSeconds?: number;
  createdAt: number;
}

export interface VideoPlaylistArchiveEntry {
  id: string;
  /** User-assigned title shown in the analysis archive. */
  title: string;
  createdAt: number;
  expiresAt?: number;
  /** Versioned compressed player payloads, one for each shareable part. */
  parts: string[];
}

export type VideoSyncPointScope = 'anchor' | 'single';

/**
 * How the video offset changes between two sync points:
 * - 'step': each point applies from its action onward (a pause in the recording);
 * - 'linear': the correction is spread evenly between the two points (a video
 *   that drifts little by little, e.g. a camera running slightly fast or slow).
 */
export type VideoSyncInterpolation = 'step' | 'linear';

/**
 * How touches inside a rally are timed relative to the rally's serve:
 * - 'recorded' (default): trust each touch's recorded clock second;
 * - 'realistic': anchor the first phase to the serve (`+1s` receive, `+2s` set,
 *   `+3s` first attack, `block/dig = attack`) and clamp counter-attack steps
 *   to `[2s, 5s]` to remove operator typing lag and outliers. When the clocks
 *   do not follow the pace of play at all, counter-attacks use a fixed cadence.
 */
export type VideoRallyTimingMode = 'recorded' | 'realistic';

export interface MatchVideoAnalysis {
  source?: MatchVideoSource;
  syncPoints: VideoSyncPoint[];
  /** Missing on older projects, which behave as 'step'. */
  syncInterpolation?: VideoSyncInterpolation;
  /**
   * Missing until the user picks one: 'realistic' when the recorded clocks do
   * not follow the pace of play (scouted from a video with pauses, or typed
   * after the fact), otherwise 'recorded'.
   */
  rallyTimingMode?: VideoRallyTimingMode;
  /** Touch ids the user marked as "of interest" for later review/export. */
  starredTouchIds: string[];
  /** Locally archived YouTube playlists for this match. */
  sharedPlaylistArchive?: VideoPlaylistArchiveEntry[];
  /** Seconds of video shown before the filtered action. */
  paddingBeforeSeconds: number;
  /** Seconds of video shown after the filtered action. */
  paddingAfterSeconds: number;
  /** Last playback position while scouting live against the video, for resuming later. */
  lastPlaybackPositionSeconds?: number;
  lastPlaybackAtIso?: string;
  updatedAt: number;
}

export const DEFAULT_VIDEO_PADDING_SECONDS = 3;

/**
 * Stable identity key for a video source, used to detect "the source
 * actually changed" (e.g. to reset playability/error state) as opposed to
 * an unrelated re-render of the object holding it.
 */
/**
 * Tauri's file drop/picker attaches a native absolute `path` to the browser
 * `File` object (non-standard, desktop-only); a plain browser file input
 * never has one. Falls back to the file name, which is all a web build can
 * use to re-identify a re-picked file.
 */
export function getFilePath(file: File): string {
  return (file as File & { path?: string }).path ?? file.name;
}

export function getVideoSourceKey(source: MatchVideoSource | undefined): string {
  if (!source) return '';
  switch (source.kind) {
    case 'file':
      return `file:${source.path}`;
    case 'youtube':
      return `yt:${source.videoId}`;
    case 'webcam':
      return `webcam:${source.deviceId ?? 'default'}:${source.mode}`;
    case 'rtsp':
      return `rtsp:${source.url}`;
  }
}

export function createDefaultMatchVideoAnalysis(): MatchVideoAnalysis {
  return {
    source: undefined,
    syncPoints: [],
    starredTouchIds: [],
    sharedPlaylistArchive: [],
    paddingBeforeSeconds: DEFAULT_VIDEO_PADDING_SECONDS,
    paddingAfterSeconds: DEFAULT_VIDEO_PADDING_SECONDS,
    updatedAt: Date.now(),
  };
}

export function isTouchStarred(analysis: Pick<MatchVideoAnalysis, 'starredTouchIds'>, touchId: string): boolean {
  return analysis.starredTouchIds.includes(touchId);
}

export function toggleStarredTouchId(ids: readonly string[], touchId: string): string[] {
  return ids.includes(touchId) ? ids.filter((id) => id !== touchId) : [...ids, touchId];
}
