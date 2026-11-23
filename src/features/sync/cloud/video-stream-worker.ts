// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Streams cloud videos that need an Authorization header (Google Drive)
 * through the web app's service worker (see public/ovs-stream-sw.js): the
 * page hands the worker the file URL and token, and the player gets a
 * same-origin address the worker answers. Only in the web app, once the
 * worker controls the page; the desktop app downloads instead.
 */

import { isTauriRuntime } from './platform';

const REPLY_TIMEOUT_MS = 3000;

function controller(): ServiceWorker | null {
  if (isTauriRuntime() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.controller;
}

/** True when this page can stream through the service worker. */
export function canStreamThroughWorker(): boolean {
  return controller() !== null;
}

/** Registers a stream and returns the address the video player should load. */
export async function registerWorkerStream(url: string, token: string): Promise<string> {
  const worker = controller();
  if (!worker) throw new Error('stream: no service worker');
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => reject(new Error('stream: service worker did not answer')), REPLY_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<{ ok: boolean; error?: string }>) => {
      window.clearTimeout(timer);
      if (event.data?.ok) resolve();
      else reject(new Error(`stream: ${event.data?.error ?? 'failed'}`));
    };
    worker.postMessage({ type: 'ovs-stream-register', id, url, token }, [channel.port2]);
  });
  return new URL(`ovs-stream/${id}`, new URL(import.meta.env.BASE_URL, window.location.href)).href;
}
