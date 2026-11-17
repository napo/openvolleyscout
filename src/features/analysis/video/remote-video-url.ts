// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchVideoSource } from '@src/domain/video/types';
import { parseYouTubeVideoId } from './youtube';

export type RemoteVideoResolution =
  | { ok: true; source: Extract<MatchVideoSource, { kind: 'youtube' | 'url' }> }
  | { ok: false; reason: 'invalid' | 'dropbox_folder' };

function isDropboxHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'dropbox.com' || host.endsWith('.dropbox.com') || host.endsWith('.dropboxusercontent.com');
}

/**
 * Resolves a pasted remote video URL into either a YouTube source or a direct
 * streamable URL (normalizing Dropbox file links to `raw=1`).
 * Dropbox shared folder links (`/scl/fo/...`, `/sh/...`) return `dropbox_folder`
 * because Dropbox serves folders as `.zip` archives rather than video streams.
 */
export function resolveRemoteVideoSource(rawUrl: string): RemoteVideoResolution {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, reason: 'invalid' };

  const youtubeId = parseYouTubeVideoId(trimmed);
  if (youtubeId) {
    return { ok: true, source: { kind: 'youtube', url: trimmed, videoId: youtubeId } };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'invalid' };
  }

  if (isDropboxHost(parsed.hostname)) {
    if (parsed.pathname.startsWith('/scl/fo/') || parsed.pathname.startsWith('/sh/')) {
      return { ok: false, reason: 'dropbox_folder' };
    }
    parsed.searchParams.delete('dl');
    parsed.searchParams.set('raw', '1');
    return { ok: true, source: { kind: 'url', url: parsed.toString() } };
  }

  return { ok: true, source: { kind: 'url', url: parsed.toString() } };
}

/** Returns a direct-download variant of a remote video URL (e.g. Dropbox `dl=1`). */
export function getDownloadableRemoteUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (isDropboxHost(parsed.hostname)) {
      parsed.searchParams.delete('raw');
      parsed.searchParams.set('dl', '1');
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
