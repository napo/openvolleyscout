// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Short shared links. Every shared link of the app carries its data in the
 * address (after #), so big stats or reports make links of tens of thousands
 * of characters that chat apps refuse. When the user's Google Drive is
 * (or Dropbox) is connected, the data part goes into a small file there, readable by anyone
 * with the link, and the shared link carries only that file's id:
 * `<web app>/#/s/g/<file id>` (Google Drive) or `#/s/d/<link id>~<rlkey>~<name>` (Dropbox). Without a connected cloud the long link stays.
 */

/** Longer links than this are shortened when possible (chat apps cut or refuse long links). */
export const SHORT_LINK_THRESHOLD = 1500;

export interface ShortShareStore {
  createShortShare(text: string, name: string): Promise<{ provider: 'g' | 'd'; id: string } | null>;
}

interface StoredLink {
  v: 1;
  /** The route of the long link, from `#` on. */
  hash: string;
}

export function shortLinkRoute(provider: 'g' | 'd', id: string): string {
  return `#/s/${provider}/${id}`;
}

/**
 * The short link to `route` (the app route, from `#/` on) when `longUrl` is too long
 * for chat apps and the cloud can store it; `longUrl` otherwise.
 */
export async function shortenShareLink(
  longUrl: string,
  route: string,
  baseUrl: string,
  store: ShortShareStore,
  now = new Date(),
): Promise<string> {
  if (longUrl.length <= SHORT_LINK_THRESHOLD || !route.startsWith('#/')) return longUrl;
  const stored: StoredLink = { v: 1, hash: route };
  const name = `share-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  const ref = await store.createShortShare(JSON.stringify(stored), name).catch(() => null);
  return ref ? `${baseUrl.replace(/[#?].*$/, '').replace(/\/+$/, '')}/${shortLinkRoute(ref.provider, ref.id)}` : longUrl;
}

/** The route (from `#` on) stored behind a short link, or null when the file cannot be read. */
export async function resolveShortLink(
  provider: string,
  id: string,
  apiKey: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<string | null> {
  const url = sharedFileUrl(provider, id, apiKey);
  if (!url) return null;
  try {
    const response = await fetchFn(url);
    if (!response.ok) return null;
    const stored = (await response.json()) as Partial<StoredLink>;
    // Only routes of this app: never an address elsewhere.
    return stored.v === 1 && typeof stored.hash === 'string' && stored.hash.startsWith('#/') ? stored.hash : null;
  } catch {
    return null;
  }
}

/** `shortenShareLink` through the connected cloud, loaded only when a link is too long. */
export async function shortenWithCloud(longUrl: string, route: string, baseUrl: string): Promise<string> {
  if (longUrl.length <= SHORT_LINK_THRESHOLD) return longUrl;
  const { cloudSyncController } = await import('@src/features/sync/cloud/archive-adapter');
  return shortenShareLink(longUrl, route, baseUrl, cloudSyncController);
}

/** Where anyone can read a shared-link file: Drive with the app's API key, Dropbox through its public link. */
function sharedFileUrl(provider: string, id: string, apiKey: string): string | null {
  if (provider === 'g') {
    return /^[\w-]{10,}$/.test(id) && apiKey
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(apiKey)}`
      : null;
  }
  if (provider === 'd') {
    const match = id.match(/^([\w-]+)~([\w-]+)~([\w-]+)$/);
    return match ? `https://dl.dropboxusercontent.com/scl/fi/${match[1]}/${match[3]}.json?rlkey=${match[2]}&dl=1` : null;
  }
  return null;
}
