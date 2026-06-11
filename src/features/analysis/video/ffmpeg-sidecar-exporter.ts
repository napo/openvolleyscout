/**
 * Desktop export path: delegates the filtered-clip montage to the bundled
 * minimal ffmpeg sidecar via the `export_video_clips` Tauri command. Cuts are
 * stream-copied (original quality, faster than real time), the action codes
 * travel as a soft subtitle track (no re-encode: players like VLC show them
 * bottom-left by default, but they are not burned into the pixels), and the
 * output is written to the user's Downloads folder; the resolved path is
 * returned.
 * Availability depends on the sidecar binary shipping with the build, so it
 * is queried from the backend (Android builds, for instance, have none).
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ClipExportProgress, ClipInterval } from './clip-export';

const PROGRESS_EVENT = 'video-clip-export-progress';

let availability: Promise<boolean> | null = null;

export function sidecarClipExportAvailable(): Promise<boolean> {
  if (!isTauri()) return Promise.resolve(false);
  availability ??= invoke<boolean>('clip_export_available').catch(() => false);
  return availability;
}

/** The sidecar needs a real filesystem path, not a re-linked object URL. */
export function isAbsoluteFilePath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(path);
}

export function isSidecarExportCancelled(error: unknown): boolean {
  return error === 'cancelled';
}

export interface SidecarClipExportOptions {
  inputPath: string;
  intervals: readonly ClipInterval[];
  outputBaseName: string;
  signal?: AbortSignal;
  onProgress?: (progress: ClipExportProgress) => void;
}

/** Returns the path of the exported file inside the Downloads folder. */
export async function exportClipsWithFfmpegSidecar({
  inputPath,
  intervals,
  outputBaseName,
  signal,
  onProgress,
}: SidecarClipExportOptions): Promise<string> {
  const unlisten = await listen<ClipExportProgress>(PROGRESS_EVENT, (event) => {
    onProgress?.(event.payload);
  });
  const onAbort = () => {
    void invoke('cancel_video_clip_export').catch(() => {});
  };
  signal?.addEventListener('abort', onAbort);
  try {
    return await invoke<string>('export_video_clips', {
      inputPath,
      intervals: intervals.map((interval) => ({
        startSeconds: interval.startSeconds,
        endSeconds: interval.endSeconds,
        labels: interval.labels.map((label) => ({
          startSeconds: label.startSeconds,
          endSeconds: label.endSeconds,
          text: label.text,
        })),
      })),
      outputBaseName,
    });
  } finally {
    unlisten();
    signal?.removeEventListener('abort', onAbort);
  }
}
