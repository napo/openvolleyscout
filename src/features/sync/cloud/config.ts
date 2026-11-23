// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * OAuth client configuration for personal cloud synchronisation (Google Drive,
 * Dropbox, OneDrive). One client per platform where required; an empty id
 * hides that provider on that platform.
 *
 * Values are read from Vite build-time environment variables (see docs/cloud-sync.md).
 * None of the client IDs is a secret; Google's desktop "client secret" is also
 * treated as public by Google for installed apps (RFC 8252), and is injected at
 * build time rather than committed to the repository.
 */

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const SYNC_FOLDER_NAME = 'OpenVolleyScout';
export const SYNC_FILE_NAME = 'OpenVolleyScout.ovs';

export const GOOGLE_OAUTH = {
  /** "Web application" OAuth client ID. */
  web: env?.VITE_GOOGLE_WEB_CLIENT_ID?.trim() ?? '',
  /** "Desktop app" OAuth client (Windows, macOS, Linux): loopback redirect 127.0.0.1. */
  desktop: {
    clientId: env?.VITE_GOOGLE_DESKTOP_CLIENT_ID?.trim() ?? '',
    clientSecret: env?.VITE_GOOGLE_DESKTOP_CLIENT_SECRET?.trim() ?? '',
  },
  android: env?.VITE_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? '',
  ios: env?.VITE_GOOGLE_IOS_CLIENT_ID?.trim() ?? '',
} as const;

export const DROPBOX_OAUTH: { readonly appKey: string } = {
  appKey: env?.VITE_DROPBOX_APP_KEY?.trim() ?? '',
};

export const ONEDRIVE_OAUTH: { readonly clientId: string } = {
  clientId: env?.VITE_ONEDRIVE_CLIENT_ID?.trim() ?? '',
};
