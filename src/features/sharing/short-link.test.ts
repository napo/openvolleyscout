// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { resolveShortLink, shortenShareLink, SHORT_LINK_THRESHOLD } from './short-link';

const longUrl = `https://scout.volleyserve.it/#/stats-viewer/${'x'.repeat(SHORT_LINK_THRESHOLD)}`;
const route = longUrl.slice(longUrl.indexOf('#'));

describe('short shared links', () => {
  it('keeps short links as they are, without touching the cloud', async () => {
    const store = { createShortShare: vi.fn() };
    expect(await shortenShareLink('https://scout.volleyserve.it/#/player/abc', '#/player/abc', 'https://scout.volleyserve.it', store)).toBe('https://scout.volleyserve.it/#/player/abc');
    expect(store.createShortShare).not.toHaveBeenCalled();
  });

  it('stores the route of a long link and shares only the file id', async () => {
    const store = { createShortShare: vi.fn(async (_text: string, _name: string) => ({ provider: 'g' as const, id: '1AbCdEfGhIjK' })) };
    const short = await shortenShareLink(longUrl, route, 'https://scout.volleyserve.it/', store);
    expect(short).toBe('https://scout.volleyserve.it/#/s/g/1AbCdEfGhIjK');
    expect(JSON.parse(store.createShortShare.mock.calls[0][0])).toEqual({ v: 1, hash: route });
  });

  it('falls back to the long link when the cloud is not connected or fails', async () => {
    expect(await shortenShareLink(longUrl, route, 'https://scout.volleyserve.it', { createShortShare: async () => null })).toBe(longUrl);
    expect(await shortenShareLink(longUrl, route, 'https://scout.volleyserve.it', { createShortShare: async () => { throw new Error('x'); } })).toBe(longUrl);
  });

  it('opens only routes of this app', async () => {
    const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    expect(await resolveShortLink('g', '1AbCdEfGhIjK', 'key', reply({ v: 1, hash: route }))).toBe(route);
    expect(await resolveShortLink('g', '1AbCdEfGhIjK', 'key', reply({ v: 1, hash: 'https://evil.example' }))).toBeNull();
    expect(await resolveShortLink('x', '1AbCdEfGhIjK', 'key', reply({ v: 1, hash: route }))).toBeNull();
    expect(await resolveShortLink('g', '1AbCdEfGhIjK', 'key', vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch)).toBeNull();
  });

  it('reads Dropbox short links through the public link, without a key', async () => {
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify({ v: 1, hash: route })));
    expect(await resolveShortLink('d', 'abc123XYZ~rl9key~share-2026-11-24-ab12', '', fetchFn as unknown as typeof fetch)).toBe(route);
    expect(fetchFn.mock.calls[0][0]).toBe('https://dl.dropboxusercontent.com/scl/fi/abc123XYZ/share-2026-11-24-ab12.json?rlkey=rl9key&dl=1');
    expect(await resolveShortLink('d', 'not-a-dropbox-id', '', fetchFn as unknown as typeof fetch)).toBeNull();
  });
});
