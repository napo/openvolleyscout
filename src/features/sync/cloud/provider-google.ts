// SPDX-License-Identifier: AGPL-3.0-or-later

/** Google Drive provider: Google Identity Services on web, RFC 8252 PKCE loopback on desktop. */

import type { CloudAuth } from './auth';
import { GOOGLE_OAUTH } from './config';
import { DRIVE_SCOPE, DriveClient } from './drive';
import { type SyncPlatform, syncFetch } from './platform';
import type { SyncProvider } from './provider';

const ENDPOINTS = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  scope: DRIVE_SCOPE,
  extraParams: { access_type: 'offline', prompt: 'consent' },
  storageKey: 'openvolleyscout.google.refresh-token',
};

const clientId = (platform: SyncPlatform) =>
  platform === 'desktop' ? GOOGLE_OAUTH.desktop.clientId : GOOGLE_OAUTH[platform];

async function createAuth(platform: SyncPlatform): Promise<CloudAuth> {
  if (platform === 'web') {
    const { WebGoogleAuth } = await import('./auth-web');
    return new WebGoogleAuth(GOOGLE_OAUTH.web);
  }
  if (platform === 'android') {
    // Play services finds the "Android" client by package and signing certificate: its id is not passed.
    const [{ AndroidGoogleAuth }, fetchFn] = await Promise.all([import('./auth-android'), syncFetch()]);
    return new AndroidGoogleAuth(fetchFn);
  }
  const [{ PkceAuth }, { invoke }, { openUrl }, fetchFn] = await Promise.all([
    import('./auth-pkce'),
    import('@tauri-apps/api/core'),
    import('@tauri-apps/plugin-opener'),
    syncFetch(),
  ]);
  return new PkceAuth({
    endpoints: ENDPOINTS,
    clientId: GOOGLE_OAUTH.desktop.clientId,
    clientSecret: GOOGLE_OAUTH.desktop.clientSecret,
    fetch: fetchFn,
    openBrowser: (url) => openUrl(url),
    redirect: async () => {
      const port = await invoke<number>('oauth_listen', {});
      return {
        uri: `http://127.0.0.1:${port}`,
        wait: () => invoke<string>('oauth_wait', { port }),
        cancel: () => void invoke('oauth_cancel', { port }).catch(() => undefined),
      };
    },
  });
}

export const googleDrive: SyncProvider = {
  id: 'google-drive',
  platforms: ['web', 'desktop', 'android'],
  available(platform) {
    if (platform === 'desktop') return clientId(platform) !== '' && GOOGLE_OAUTH.desktop.clientSecret !== '';
    // Android: the id only tells that an "Android" client exists for this build. iOS: still to be built.
    return platform !== 'ios' && clientId(platform) !== '';
  },
  createAuth,
  storage: (accessToken, fetchFn) => new DriveClient(accessToken, fetchFn),
  async prepare(platform) {
    if (platform !== 'web') return;
    const { loadGoogle } = await import('./auth-web');
    await loadGoogle().catch(() => undefined);
  },
};
