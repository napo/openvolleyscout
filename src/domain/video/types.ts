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
  createdAt: number;
}

export interface MatchVideoAnalysis {
  source?: MatchVideoSource;
  syncPoints: VideoSyncPoint[];
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
    paddingBeforeSeconds: DEFAULT_VIDEO_PADDING_SECONDS,
    paddingAfterSeconds: DEFAULT_VIDEO_PADDING_SECONDS,
    updatedAt: Date.now(),
  };
}
