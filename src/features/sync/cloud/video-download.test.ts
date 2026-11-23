// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCloudVideo } from './video-download';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe('downloadCloudVideo in the browser', () => {
  it('streams the file into the chosen file, piece by piece', async () => {
    const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        parts.forEach((part) => controller.enqueue(part));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    const written: number[] = [];
    const handle = {
      createWritable: async () => new WritableStream<Uint8Array>({ write: (chunk) => { written.push(...chunk); } }),
    };
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(async () => handle);
    const progress: number[] = [];
    const result = await downloadCloudVideo('https://cloud/video', 'match.mp4', (received) => progress.push(received));
    expect(result).toEqual({ kind: 'handle', handle });
    expect(written).toEqual([1, 2, 3, 4, 5]);
    expect(progress).toEqual([3, 5]);
  });

  it('reports a cancelled save dialog', async () => {
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(async () => { throw new Error('abort'); });
    expect(await downloadCloudVideo('https://cloud/video', 'match.mp4', () => undefined)).toEqual({ kind: 'cancelled' });
  });
});
