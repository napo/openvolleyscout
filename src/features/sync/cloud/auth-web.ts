// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google sign-in on the web: Google Identity Services token model.
 * No server is involved, so there is no refresh token: the access token lasts
 * an hour and is kept in localStorage until expiry so reloads do not prompt again.
 * Google's script is loaded only after the user chooses to connect Google Drive.
 */

import { type CloudAuth, TokenCache } from './auth';
import { DRIVE_SCOPE } from './drive';

const SCRIPT = 'https://accounts.google.com/gsi/client';
const STORED = 'openvolleyscout.google.web-token';
const CONSENTED = 'openvolleyscout.google.consented';

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth2 } };
  }
}

let loading: Promise<GoogleOauth2> | null = null;

/** Loads Google Identity Services once; called on confirmation so the login window opens immediately on tap. */
export function loadGoogle(): Promise<GoogleOauth2> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('gsi')));
    script.onerror = () => {
      loading = null;
      reject(new Error('gsi'));
    };
    document.head.append(script);
  });
  return loading;
}

export class WebGoogleAuth implements CloudAuth {
  private readonly cache = new TokenCache();

  constructor(private readonly clientId: string) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORED) ?? 'null') as { token: string; expires: number } | null;
      if (stored) this.cache.set(stored.token, (stored.expires - Date.now()) / 1000);
    } catch {
      // No stored token: the user will be prompted at the next interactive sync.
    }
  }

  async token(interactive: boolean): Promise<string | null> {
    const cached = this.cache.get();
    if (cached || !interactive) return cached;
    const oauth2 = await loadGoogle();
    const response = await new Promise<TokenResponse>((resolve) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPE,
        callback: resolve,
        error_callback: (error) => resolve({ error: error.type }),
      });
      client.requestAccessToken({ prompt: localStorage.getItem(CONSENTED) ? '' : 'consent' });
    });
    if (!response.access_token) return null;
    const expiresIn = response.expires_in ?? 3600;
    this.cache.set(response.access_token, expiresIn);
    try {
      localStorage.setItem(CONSENTED, '1');
      localStorage.setItem(STORED, JSON.stringify({ token: response.access_token, expires: Date.now() + expiresIn * 1000 }));
    } catch {
      // Private browsing: token stays in memory until the tab is closed.
    }
    return response.access_token;
  }

  invalidate() {
    this.cache.clear();
    try {
      localStorage.removeItem(STORED);
    } catch {
      // Ignore storage errors.
    }
  }

  async signOut(): Promise<void> {
    const token = this.cache.get();
    this.invalidate();
    try {
      localStorage.removeItem(CONSENTED);
    } catch {
      // Ignore storage errors.
    }
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token);
  }
}
