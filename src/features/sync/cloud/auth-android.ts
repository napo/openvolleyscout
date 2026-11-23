// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google sign-in on Android: the Authorization API of Google Play services,
 * through the Kotlin plugin in src-tauri/plugins/google-auth. Account and
 * consent are asked once; afterwards Play services hands out valid access
 * tokens without showing anything, so there is no refresh token to keep.
 */

import { invoke } from '@tauri-apps/api/core';
import { DRIVE_SCOPE } from './drive';
import { type CloudAuth, TokenCache } from './auth';
import type { Fetch } from './storage';

const REVOKE = 'https://oauth2.googleapis.com/revoke';
/** Play services does not tell the expiry: Google's tokens last an hour, keep them a bit less. */
const TOKEN_SECONDS = 50 * 60;

export class AndroidGoogleAuth implements CloudAuth {
  private readonly cache = new TokenCache();
  /** The last token handed out, to drop it from Play services when Drive refuses it. */
  private last: string | null = null;

  constructor(private readonly fetchFn: Fetch) {}

  async token(interactive: boolean): Promise<string | null> {
    const cached = this.cache.get();
    if (cached) return cached;
    const { accessToken } = await invoke<{ accessToken?: string }>('plugin:google-auth|authorize', { scope: DRIVE_SCOPE, interactive });
    if (!accessToken) return null;
    this.last = accessToken;
    this.cache.set(accessToken, TOKEN_SECONDS);
    return accessToken;
  }

  invalidate() {
    this.cache.clear();
    if (this.last) void invoke('plugin:google-auth|clear', { token: this.last }).catch(() => undefined);
    this.last = null;
  }

  async signOut(): Promise<void> {
    const token = this.last;
    this.invalidate();
    // Revoking the token removes the app's access to Drive for the account.
    if (token) await this.fetchFn(`${REVOKE}?${new URLSearchParams({ token })}`, { method: 'POST' }).catch(() => undefined);
  }
}
