// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchVideoSource } from '@src/domain/video/types';
import { parseYouTubeVideoId } from './youtube';

export type RemoteVideoResolution =
  | { ok: true; source: Extract<MatchVideoSource, { kind: 'youtube' | 'url' }> }
  | { ok: false; reason: RemoteVideoUrlError };

export type RemoteVideoUrlError = 'invalid' | 'dropbox_folder' | 'cloud_folder';

/** Translation key of the message shown under the URL field. */
export function remoteVideoUrlErrorKey(reason: RemoteVideoUrlError) {
  if (reason === 'dropbox_folder') return 'videoDropboxFolderError' as const;
  if (reason === 'cloud_folder') return 'videoCloudFolderError' as const;
  return 'videoInvalidYoutubeUrl' as const;
}

export function isDropboxHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'dropbox.com' || host.endsWith('.dropbox.com') || host.endsWith('.dropboxusercontent.com');
}

export function isOneDriveHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === '1drv.ms' || host === 'onedrive.live.com' || host === 'api.onedrive.com'
    || host.endsWith('.sharepoint.com');
}

export function isGoogleDriveHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'drive.google.com' || host === 'docs.google.com' || host === 'drive.usercontent.google.com';
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

/**
 * OneDrive personal share links (1drv.ms, onedrive.live.com) go through the
 * public "shares" endpoint, which redirects to the file itself; OneDrive for
 * work or school (SharePoint) links serve the file with `download=1`.
 */
function resolveOneDriveUrl(parsed: URL): RemoteVideoResolution {
  const host = parsed.hostname.toLowerCase();
  if (host === 'api.onedrive.com') {
    return { ok: true, source: { kind: 'url', url: parsed.toString() } };
  }
  if (host.endsWith('.sharepoint.com')) {
    if (/^\/:f:\//.test(parsed.pathname)) return { ok: false, reason: 'cloud_folder' };
    parsed.searchParams.set('download', '1');
    return { ok: true, source: { kind: 'url', url: parsed.toString() } };
  }
  if (/^\/f\//.test(parsed.pathname)) return { ok: false, reason: 'cloud_folder' };
  return {
    ok: true,
    source: { kind: 'url', url: `https://api.onedrive.com/v1.0/shares/u!${toBase64Url(parsed.toString())}/root/content` },
  };
}

/** Google Drive file links become a direct download link; folder links are refused. */
function resolveGoogleDriveUrl(parsed: URL): RemoteVideoResolution {
  if (parsed.hostname.toLowerCase() === 'drive.usercontent.google.com') {
    return { ok: true, source: { kind: 'url', url: parsed.toString() } };
  }
  if (parsed.pathname.includes('/folders/')) return { ok: false, reason: 'cloud_folder' };
  const fileId = parsed.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? parsed.searchParams.get('id');
  if (!fileId || !/^[\w-]+$/.test(fileId)) return { ok: false, reason: 'invalid' };
  const url = new URL('https://drive.usercontent.google.com/download');
  url.searchParams.set('id', fileId);
  url.searchParams.set('export', 'download');
  url.searchParams.set('confirm', 't');
  return { ok: true, source: { kind: 'url', url: url.toString() } };
}

/**
 * Resolves a pasted remote video URL into either a YouTube source or a direct
 * streamable URL (Dropbox file links get `raw=1`, OneDrive and Google Drive
 * share links become direct download links).
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
  if (isOneDriveHost(parsed.hostname)) return resolveOneDriveUrl(parsed);
  if (isGoogleDriveHost(parsed.hostname)) return resolveGoogleDriveUrl(parsed);

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
