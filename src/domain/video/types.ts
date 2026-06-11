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
  updatedAt: number;
}

export const DEFAULT_VIDEO_PADDING_SECONDS = 3;

export function createDefaultMatchVideoAnalysis(): MatchVideoAnalysis {
  return {
    source: undefined,
    syncPoints: [],
    paddingBeforeSeconds: DEFAULT_VIDEO_PADDING_SECONDS,
    paddingAfterSeconds: DEFAULT_VIDEO_PADDING_SECONDS,
    updatedAt: Date.now(),
  };
}
