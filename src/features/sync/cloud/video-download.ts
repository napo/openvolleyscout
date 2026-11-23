// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Downloads a match video from the user's cloud to this device, streaming it
 * to disk (never the whole file in memory): to a path chosen in the save
 * dialog in the desktop app, to a file chosen with the browser's save picker
 * where available (Chrome, Edge), otherwise through the browser's own download.
 */

import { isTauriRuntime, syncFetch, syncPlatform } from './platform';

/** Bytes buffered before each write to disk in the desktop app. */
const WRITE_BYTES = 8 * 1024 * 1024;

export type VideoDownloadResult =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'handle'; readonly handle: FileSystemFileHandle }
  | { readonly kind: 'browser' }
  | { readonly kind: 'cancelled' };

interface SaveFilePickerWindow {
  showSaveFilePicker?(options?: { suggestedName?: string }): Promise<FileSystemFileHandle & {
    createWritable(): Promise<WritableStream<Uint8Array>>;
  }>;
}

async function readStream(response: Response, onChunk: (bytes: Uint8Array) => Promise<void>, onProgress: (received: number) => void) {
  if (!response.ok || !response.body) throw new Error(`download: ${response.status}`);
  const reader = response.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    received += value.length;
    await onChunk(value);
    onProgress(received);
  }
}

export async function downloadCloudVideo(
  request: string | { url: string; headers?: Record<string, string> },
  fileName: string,
  onProgress: (received: number) => void,
): Promise<VideoDownloadResult> {
  const { url, headers } = typeof request === 'string' ? { url: request, headers: undefined } : request;
  if (isTauriRuntime() && syncPlatform() === 'desktop') {
    const [{ save }, { writeFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
    const path = await save({ defaultPath: fileName });
    if (!path) return { kind: 'cancelled' };
    const fetchFn = await syncFetch();
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    let started = false;
    const flush = async () => {
      const bytes = new Uint8Array(pendingBytes);
      let at = 0;
      for (const part of pending) {
        bytes.set(part, at);
        at += part.length;
      }
      await writeFile(path, bytes, { append: started });
      started = true;
      pending = [];
      pendingBytes = 0;
    };
    await readStream(await fetchFn(url, headers ? { headers } : undefined), async (bytes) => {
      pending.push(bytes);
      pendingBytes += bytes.length;
      if (pendingBytes >= WRITE_BYTES) await flush();
    }, onProgress);
    if (pendingBytes > 0 || !started) await flush();
    return { kind: 'path', path };
  }

  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    let handle: Awaited<ReturnType<NonNullable<SaveFilePickerWindow['showSaveFilePicker']>>>;
    try {
      handle = await picker.call(window, { suggestedName: fileName });
    } catch {
      return { kind: 'cancelled' };
    }
    const writable = await handle.createWritable();
    const writer = writable.getWriter();
    try {
      await readStream(await fetch(url, headers ? { headers } : undefined), (bytes) => writer.write(bytes), onProgress);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => undefined);
      throw error;
    }
    return { kind: 'handle', handle };
  }

  // A plain browser download cannot send the Authorization header (Google Drive).
  if (headers) throw new Error('download: needs a browser that can save files (Chrome, Edge)');
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { kind: 'browser' };
}
