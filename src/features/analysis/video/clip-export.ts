/**
 * Clip interval math for exporting the filtered action sequence.
 * Pure module (ts-node safe): keep browser APIs and value imports out.
 */

/** A code overlay shown while its window is on screen, in video time. */
export interface ClipLabel {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface ClipInterval {
  startSeconds: number;
  endSeconds: number;
  /** Codes of the actions covered by this (possibly merged) interval. */
  labels: ClipLabel[];
}

/** One filtered action: its video time and the code to overlay. */
export interface ClipSource {
  videoSeconds: number | null;
  label: string;
}

export interface ClipExportProgress {
  /** 1-based index of the clip being recorded. */
  clipIndex: number;
  clipCount: number;
  /** Overall progress across the whole export, 0..1. */
  fraction: number;
}

/**
 * Build sorted clip intervals from the filtered actions, applying the
 * configured padding and merging overlapping clips so the export never
 * records the same footage twice. Each action keeps its own padded window as
 * a label, so merged clips can show every code at the right moment. Mirrors
 * playEntry's minimum clip length of one second.
 */
export function buildClipIntervals(
  sources: ReadonlyArray<ClipSource>,
  paddingBeforeSeconds: number,
  paddingAfterSeconds: number,
): ClipInterval[] {
  const sorted = sources
    .filter((source): source is ClipSource & { videoSeconds: number } => (
      source.videoSeconds !== null && Number.isFinite(source.videoSeconds)
    ))
    .sort((a, b) => a.videoSeconds - b.videoSeconds);

  const intervals: ClipInterval[] = [];
  sorted.forEach((source) => {
    const startSeconds = Math.max(0, source.videoSeconds - paddingBeforeSeconds);
    const endSeconds = Math.max(source.videoSeconds + paddingAfterSeconds, startSeconds + 1);
    const label: ClipLabel = { startSeconds, endSeconds, text: source.label };
    const previous = intervals[intervals.length - 1];
    if (previous && startSeconds <= previous.endSeconds) {
      previous.endSeconds = Math.max(previous.endSeconds, endSeconds);
      previous.labels.push(label);
    } else {
      intervals.push({ startSeconds, endSeconds, labels: [label] });
    }
  });
  return intervals;
}

export function totalClipDurationSeconds(intervals: readonly ClipInterval[]): number {
  return intervals.reduce((sum, interval) => sum + (interval.endSeconds - interval.startSeconds), 0);
}
