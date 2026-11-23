// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * Imported by the web app's service worker. Lets the video player stream a
 * match video from Google Drive, which serves file contents only with the
 * access token in an Authorization header (a <video> element cannot send it).
 * The page registers a stream (Drive URL + token) under a private id; requests
 * to <scope>/ovs-stream/<id> are answered by fetching Drive with the header,
 * forwarding the Range header so seeking works. Registrations are kept in a
 * small cache so they survive the worker being stopped while the video is paused.
 */

(() => {
  const CACHE = 'ovs-video-streams';
  const PREFIX = 'ovs-stream/';
  const MAX_AGE_MS = 6 * 60 * 60 * 1000;

  const keyFor = (id) => new URL(`${PREFIX}${id}`, self.registration.scope).href;

  self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'ovs-stream-register') return;
    const port = event.ports && event.ports[0];
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE);
        // Forget old registrations: tokens expire within the hour anyway.
        for (const request of await cache.keys()) {
          const stored = await cache.match(request);
          const entry = stored ? await stored.json().catch(() => null) : null;
          if (!entry || Date.now() - entry.at > MAX_AGE_MS) await cache.delete(request);
        }
        await cache.put(keyFor(data.id), new Response(JSON.stringify({ url: data.url, token: data.token, at: Date.now() })));
        if (port) port.postMessage({ ok: true });
      } catch (error) {
        if (port) port.postMessage({ ok: false, error: String(error) });
      }
    })());
  });

  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const base = new URL(PREFIX, self.registration.scope);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const stored = await cache.match(keyFor(url.pathname.slice(base.pathname.length)));
      const entry = stored ? await stored.json().catch(() => null) : null;
      if (!entry) return new Response(null, { status: 404 });
      const headers = { Authorization: `Bearer ${entry.token}` };
      const range = event.request.headers.get('Range');
      if (range) headers.Range = range;
      const upstream = await fetch(entry.url, { headers });
      // Rebuilt so the player sees a plain same-origin response with its range headers.
      const out = new Headers();
      for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
        const value = upstream.headers.get(name);
        if (value) out.set(name, value);
      }
      if (!out.has('Accept-Ranges')) out.set('Accept-Ranges', 'bytes');
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
    })());
  });
})();
