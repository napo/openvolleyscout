// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google sign-in on the web: Google Identity Services token model.
 * No server is involved, so there is no refresh token: the access token lasts
 * an hour and is kept in localStorage until expiry so reloads do not prompt again.
 * It is renewed from the next tap of the user (see needsRenewal / renew): once
 * consent was given, Google's window opens and closes at once (the account
 * used at the first connection is passed as a hint, so Google does not ask to
 * choose among several signed-in accounts).
 * A window that gets no answer (left open behind the app) gives up after two
 * minutes, so it never holds synchronisation; a tap on Reconnect or Sync now
 * opens a new window instead of waiting for a forgotten one.
 * Google's script is loaded only after the user chooses to connect Google Drive.
 */

import { type CloudAuth, TokenCache } from './auth';
import { DRIVE_SCOPE } from './drive';

const SCRIPT = 'https://accounts.google.com/gsi/client';
const STORED = 'openvolleyscout.google.web-token';
const CONSENTED = 'openvolleyscout.google.consented';
/** The e-mail of the connected account, passed to Google as a hint. */
const ACCOUNT = 'openvolleyscout.google.account';
/** A sign-in window without an answer for this long counts as closed (a later answer still keeps its token). */
const REQUEST_TIMEOUT_MS = 2 * 60_000;
/** A window open for longer than this is replaced by a new one on an explicit tap; a newer one shares it (same tap). */
const REUSE_WINDOW_MS = 3000;
/** The token is renewed on the next tap once less than this is left. */
const RENEW_BEFORE_MS = 5 * 60_000;

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
    login_hint?: string;
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
  const ready = typeof window !== 'undefined' ? window.google?.accounts?.oauth2 : undefined;
  if (ready) loading ??= Promise.resolve(ready);
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

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

interface PendingRequest {
  readonly promise: Promise<string | null>;
  readonly resolve: (token: string | null) => void;
  /** The most recent window opened for this request, and when. */
  window: number;
  openedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class WebGoogleAuth implements CloudAuth {
  private readonly cache = new TokenCache();
  private pending: PendingRequest | null = null;
  private windows = 0;

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
    return this.request(true);
  }

  /** True when the user consented once and the token is missing or expires within a few minutes. */
  needsRenewal(): boolean {
    if (!readStored(CONSENTED)) return false;
    const expires = this.cache.expiresAt();
    return expires === null || expires - RENEW_BEFORE_MS <= Date.now();
  }

  /** After the first consent Google closes its window at once, so this can run on any tap. */
  renew(): Promise<string | null> {
    return this.request(false);
  }

  prepareRenewal(): void {
    void loadGoogle().catch(() => undefined);
  }

  /** The user gave up: the request in progress ends at once (a later answer still keeps its token). */
  cancel(): void {
    if (this.pending) this.settle(this.pending, null);
  }

  /**
   * One request at a time: a tap that renews and a tap on Sync now share the
   * same window. With `fresh` (an explicit tap of the user), a window opened
   * more than a moment ago, perhaps forgotten behind the app, is replaced by a
   * new one, and its answer ends the same request.
   */
  private request(fresh: boolean): Promise<string | null> {
    const now = Date.now();
    if (this.pending && !(fresh && now - this.pending.openedAt > REUSE_WINDOW_MS)) return this.pending.promise;
    if (!this.pending) {
      let resolve: (token: string | null) => void = () => undefined;
      const promise = new Promise<string | null>((done) => {
        resolve = done;
      });
      this.pending = { promise, resolve, window: 0, openedAt: now, timer: null };
    }
    const pending = this.pending;
    this.windows += 1;
    pending.window = this.windows;
    pending.openedAt = now;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => this.settle(pending, null), REQUEST_TIMEOUT_MS);
    void this.openWindow(pending.window, pending);
    return pending.promise;
  }

  private settle(pending: PendingRequest, token: string | null) {
    if (this.pending !== pending) return;
    this.pending = null;
    if (pending.timer) clearTimeout(pending.timer);
    pending.resolve(token);
  }

  /** Opens Google's window; Google's script is normally loaded already, so it opens within the tap. */
  private async openWindow(windowId: number, pending: PendingRequest): Promise<void> {
    let oauth2: GoogleOauth2;
    try {
      oauth2 = await loadGoogle();
    } catch {
      this.settle(pending, null);
      return;
    }
    const consented = readStored(CONSENTED);
    const account = readStored(ACCOUNT);
    try {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPE,
        ...(consented && account ? { login_hint: account } : {}),
        callback: (response) => this.answered(windowId, response),
        error_callback: (error) => this.answered(windowId, { error: error.type }),
      });
      client.requestAccessToken({ prompt: consented ? '' : 'consent' });
    } catch {
      this.settle(pending, null);
    }
  }

  private answered(windowId: number, response: TokenResponse) {
    const token = response.access_token ? this.keep(response.access_token, response.expires_in ?? 3600) : null;
    const pending = this.pending;
    // Answered after its time limit or a cancel: the token is kept for the next round.
    if (!pending) return;
    // An older window closed while a newer one is still open: wait for the newer one.
    if (!token && windowId !== pending.window) return;
    this.settle(pending, token);
  }

  private keep(token: string, expiresIn: number): string {
    this.cache.set(token, expiresIn);
    try {
      localStorage.setItem(CONSENTED, '1');
      localStorage.setItem(STORED, JSON.stringify({ token, expires: Date.now() + expiresIn * 1000 }));
    } catch {
      // Private browsing: token stays in memory until the tab is closed.
    }
    if (!readStored(ACCOUNT)) void this.rememberAccount(token);
    return token;
  }

  /** Best effort: the account's e-mail, so later renewals do not show Google's account chooser. */
  private async rememberAccount(token: string): Promise<void> {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const email = ((await response.json()) as { user?: { emailAddress?: string } }).user?.emailAddress;
      if (email) localStorage.setItem(ACCOUNT, email);
    } catch {
      // No hint: Google may show its account chooser when several accounts are signed in.
    }
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
      localStorage.removeItem(ACCOUNT);
    } catch {
      // Ignore storage errors.
    }
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token);
  }
}
