// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Sign-in to a cloud service, one implementation per service and platform.
 * Tokens stay on the device: no server of the project sees them.
 */

export interface CloudAuth {
  /**
   * Returns a valid access token. When `interactive` is false nothing is shown
   * to the user: null means the user has to sign in again (e.g. on the web,
   * where the Google token lasts an hour and is renewed only on a tap).
   */
  token(interactive: boolean): Promise<string | null>;
  /** The access token was refused: the next call obtains a new one. */
  invalidate(): void;
  /** Forgets tokens on this device and revokes access when the service supports it. */
  signOut(): Promise<void>;
  /** The user gave up a sign-in in progress: it ends at once. */
  cancel?(): void;
  /**
   * Services without a refresh token (Google on the web): true when the access
   * token is missing or about to expire, so it has to be renewed with renew()
   * from the next tap or key press of the user.
   */
  needsRenewal?(): boolean;
  /**
   * Asks the service for a new access token even when the current one is still
   * valid. It opens a window, so it must be called from a user gesture.
   */
  renew?(): Promise<string | null>;
  /** Loads what renew() needs, so the window can open at once on the next gesture. */
  prepareRenewal?(): void;
}

/** An access token with its expiry, kept in memory. */
export class TokenCache {
  private value: { token: string; expires: number } | null = null;

  constructor(private readonly clock: () => number = () => Date.now()) {}

  get(): string | null {
    // One minute of margin: a token about to expire could fail mid-upload.
    return this.value && this.value.expires - 60_000 > this.clock() ? this.value.token : null;
  }

  /** When the cached token expires (milliseconds since the epoch), or null without a token. */
  expiresAt(): number | null {
    return this.value ? this.value.expires : null;
  }

  set(token: string, expiresInSeconds: number) {
    this.value = { token, expires: this.clock() + expiresInSeconds * 1000 };
  }

  clear() {
    this.value = null;
  }
}
