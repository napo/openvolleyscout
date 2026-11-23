// SPDX-License-Identifier: AGPL-3.0-or-later

/** OneDrive provider (personal Microsoft accounts): PKCE popup on web, localhost loopback on desktop. */

import type { CloudAuth } from './auth';
import type { PkceEndpoints } from './auth-pkce';
import { ONEDRIVE_OAUTH } from './config';
import { ONEDRIVE_SCOPE, OneDriveClient } from './onedrive';
import { type SyncPlatform, syncFetch } from './platform';
import type { SyncProvider } from './provider';

const ENDPOINTS: PkceEndpoints = {
  authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  scope: ONEDRIVE_SCOPE,
  storageKey: 'openvolleyscout.onedrive.refresh-token',
};

async function createAuth(platform: SyncPlatform): Promise<CloudAuth> {
  const [{ PkceAuth }, fetchFn] = await Promise.all([import('./auth-pkce'), syncFetch()]);
  const common = { endpoints: ENDPOINTS, clientId: ONEDRIVE_OAUTH.clientId, fetch: fetchFn };
  if (platform === 'web') {
    const { popupSignIn } = await import('./auth-popup');
    return new PkceAuth({ ...common, ...popupSignIn() });
  }
  const [{ invoke }, { openUrl }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/plugin-opener'),
  ]);
  return new PkceAuth({
    ...common,
    // Microsoft rejects an Origin header outside single-page apps; empty string tells tauri-plugin-http to omit it.
    tokenHeaders: { Origin: '' },
    openBrowser: (url) => openUrl(url),
    redirect: async () => {
      const port = await invoke<number>('oauth_listen', {});
      return {
        uri: `http://localhost:${port}`,
        wait: () => invoke<string>('oauth_wait', { port }),
        cancel: () => void invoke('oauth_cancel', { port }).catch(() => undefined),
      };
    },
  });
}

export const onedrive: SyncProvider = {
  id: 'onedrive',
  platforms: ['web', 'desktop'],
  available: (platform) => (platform === 'web' || platform === 'desktop') && ONEDRIVE_OAUTH.clientId !== '',
  createAuth,
  storage: (accessToken, fetchFn) => new OneDriveClient(accessToken, fetchFn),
  async prepare(platform) {
    if (platform === 'web') await Promise.all([import('./auth-pkce'), import('./auth-popup')]);
  },
};
