/**
 * Picks how to export the filtered clip montage and delivers the result:
 *
 * 1. Packet copy with Mediabunny (any browser and the desktop webview):
 *    original quality, much faster than real time.
 * 2. If the file can't be copied that way: the ffmpeg sidecar on desktop,
 *    or real-time MediaRecorder capture in the browser.
 *
 * Desktop saves into the Downloads folder (a synthetic download link does
 * nothing in Tauri webviews); the browser downloads the file.
 */
import { isTauri } from '@tauri-apps/api/core';
import type { Source } from 'mediabunny';
import type { ClipExportProgress, ClipInterval } from './clip-export';
import {
  exportClipsWithFfmpegSidecar,
  isAbsoluteFilePath,
  sidecarClipExportAvailable,
} from './ffmpeg-sidecar-exporter';
import {
  clipExportFileExtension,
  exportClipsWithMediaRecorder,
  isClipExportAbort,
  supportsMediaRecorderClipExport,
} from './media-recorder-exporter';
import { resolveLocalVideoUrl } from './VideoPlayerView';

export type ClipExportBackend = 'copy' | 'sidecar' | 'recorder';

export interface RunClipExportOptions {
  /** The local video file: an absolute path on desktop, a name in the browser. */
  path: string;
  /** Object URL of the file the browser user picked, if any. */
  fileObjectUrl: string | null;
  intervals: readonly ClipInterval[];
  /** File name without extension. */
  baseName: string;
  signal: AbortSignal;
  onProgress: (progress: ClipExportProgress) => void;
  onBackendChange: (backend: ClipExportBackend) => void;
}

export interface RunClipExportResult {
  /** Where desktop saved the file; null when the browser downloaded it. */
  savedPath: string | null;
}

/** Reads a local file through plugin-fs in ranges, so a long match video is never loaded whole. */
async function openTauriFileSource(path: string): Promise<Source> {
  const { open, SeekMode } = await import('@tauri-apps/plugin-fs');
  const { CustomSource } = await import('./mediabunny-exporter');
  const file = await open(path, { read: true });
  const { size } = await file.stat();
  // One handle has one cursor: seek+read pairs must not interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const readRange = async (start: number, end: number) => {
    await file.seek(start, SeekMode.Start);
    const bytes = new Uint8Array(end - start);
    let filled = 0;
    while (filled < bytes.length) {
      const chunk = bytes.subarray(filled);
      const count = await file.read(chunk);
      if (!count) break;
      filled += count;
    }
    return filled === bytes.length ? bytes : bytes.subarray(0, filled);
  };
  return new CustomSource({
    getSize: () => size,
    read: (start, end) => {
      const result = queue.then(() => readRange(start, end));
      queue = result.catch(() => undefined);
      return result;
    },
    dispose: () => { void file.close(); },
    prefetchProfile: 'fileSystem',
  });
}

/** Saves into Downloads without overwriting: name.ext, name-1.ext, name-2.ext… */
async function saveToDownloads(baseName: string, files: Array<{ extension: string; data: Uint8Array }>): Promise<string> {
  const { downloadDir, join } = await import('@tauri-apps/api/path');
  const { exists, writeFile } = await import('@tauri-apps/plugin-fs');
  const directory = await downloadDir();
  for (let attempt = 0; ; attempt += 1) {
    const name = attempt === 0 ? baseName : `${baseName}-${attempt}`;
    const paths = await Promise.all(files.map((file) => join(directory, `${name}.${file.extension}`)));
    const taken = await Promise.all(paths.map((path) => exists(path)));
    if (taken.some(Boolean)) continue;
    await Promise.all(files.map((file, index) => writeFile(paths[index], file.data)));
    return paths[0];
  }
}

function downloadInBrowser(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function deliver(
  baseName: string,
  video: { data: Uint8Array; extension: string; mimeType: string },
  srt: string | null,
): Promise<RunClipExportResult> {
  if (isTauri()) {
    const files = [{ extension: video.extension, data: video.data }];
    if (srt) files.push({ extension: 'srt', data: new TextEncoder().encode(srt) });
    return { savedPath: await saveToDownloads(baseName, files) };
  }
  // The codes are embedded as a subtitle track; a second automatic download
  // for the .srt would be blocked or prompted by most browsers.
  downloadInBrowser(new Blob([video.data as BlobPart], { type: video.mimeType }), `${baseName}.${video.extension}`);
  return { savedPath: null };
}

export function canExportLocalClips(path: string, fileObjectUrl: string | null): boolean {
  return (isTauri() && isAbsoluteFilePath(path)) || resolveLocalVideoUrl(path, fileObjectUrl) !== null;
}

export async function runClipExport({
  path,
  fileObjectUrl,
  intervals,
  baseName,
  signal,
  onProgress,
  onBackendChange,
}: RunClipExportOptions): Promise<RunClipExportResult> {
  const desktopPath = isTauri() && isAbsoluteFilePath(path) ? path : null;
  const videoUrl = resolveLocalVideoUrl(path, fileObjectUrl);

  if (desktopPath || videoUrl) {
    onBackendChange('copy');
    try {
      // Loaded on demand: the library is only needed while exporting.
      const { BlobSource, exportClipsWithMediabunny } = await import('./mediabunny-exporter');
      const source = desktopPath
        ? await openTauriFileSource(desktopPath)
        : new BlobSource(await (await fetch(videoUrl as string)).blob());
      const result = await exportClipsWithMediabunny({ source, intervals, signal, onProgress });
      return await deliver(baseName, { ...result, data: new Uint8Array(result.data) }, result.srt);
    } catch (error) {
      if (isClipExportAbort(error)) throw error;
      // Not fatal: an unusual container or codec still has the slower paths.
      console.warn('Clip export by packet copy failed, falling back', error);
    }
  }

  if (desktopPath && await sidecarClipExportAvailable()) {
    onBackendChange('sidecar');
    onProgress({ clipIndex: 0, clipCount: intervals.length, fraction: 0 });
    const savedPath = await exportClipsWithFfmpegSidecar({
      inputPath: desktopPath,
      intervals,
      outputBaseName: baseName,
      signal,
      onProgress,
    });
    return { savedPath };
  }

  if (videoUrl && supportsMediaRecorderClipExport()) {
    onBackendChange('recorder');
    onProgress({ clipIndex: 0, clipCount: intervals.length, fraction: 0 });
    const blob = await exportClipsWithMediaRecorder({ videoUrl, intervals, signal, onProgress });
    const extension = clipExportFileExtension(blob.type);
    return deliver(baseName, { data: new Uint8Array(await blob.arrayBuffer()), extension, mimeType: blob.type }, null);
  }

  throw new Error('No clip export method can read this video');
}
