// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Plays Google Drive videos shared as "Anyone with the link" in the app's own
 * player, so seeking (and jumping to clips) works.
 *
 * The download link of a Drive share (drive.usercontent.google.com) is not a
 * documented API: for large files Drive often answers with its "can't scan for
 * viruses" page instead of the video, and seeking is not guaranteed. With an
 * API key, the Drive API serves public files directly and honours Range
 * requests. The key is added only when the video is played: saved matches,
 * exports and shared links keep the key-less address, so a new key works for
 * them too.
 *
 * The keys are public by design (they end up in the app); each is restricted
 * to the Drive API, and the web one to the app's site (see docs/cloud-sync.md).
 */

import { isTauriRuntime } from '@src/features/sync/cloud/platform';
import { isGoogleDriveHost } from './remote-video-url';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';

/**
 * The key for this build: the web one only answers on the app's site, so the
 * desktop and Android apps, and local development, use the app key.
 */
export function googleDriveApiKey(): string {
  // Read on each call (cheap) so tests can stub the variables.
  const env = import.meta.env as Record<string, string | boolean | undefined> | undefined;
  const webKey = String(env?.VITE_GOOGLE_DRIVE_API_KEY_WEB ?? '').trim();
  const appKey = String(env?.VITE_GOOGLE_DRIVE_API_KEY_APP ?? '').trim();
  if (isTauriRuntime()) return appKey;
  if (env?.DEV) return appKey || webKey;
  return webKey;
}

/** The Drive file id of a share, download or API link; null for other links. */
export function googleDriveFileId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const id = host === 'www.googleapis.com'
    ? parsed.pathname.match(/^\/drive\/v3\/files\/([\w-]+)$/)?.[1]
    : isGoogleDriveHost(host)
      ? parsed.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? parsed.searchParams.get('id')
      : null;
  return id && /^[\w-]+$/.test(id) ? id : null;
}

/** The address to give the video player: Drive files go through the Drive API when a key is configured. */
export function toPlayableVideoUrl(rawUrl: string, apiKey = googleDriveApiKey()): string {
  if (!apiKey) return rawUrl;
  const fileId = googleDriveFileId(rawUrl);
  if (!fileId) return rawUrl;
  const url = new URL(`${DRIVE_FILES_API}/${fileId}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('key', apiKey);
  return url.toString();
}
