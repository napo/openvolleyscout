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
}

/** An access token with its expiry, kept in memory. */
export class TokenCache {
  private value: { token: string; expires: number } | null = null;

  constructor(private readonly clock: () => number = () => Date.now()) {}

  get(): string | null {
    // One minute of margin: a token about to expire could fail mid-upload.
    return this.value && this.value.expires - 60_000 > this.clock() ? this.value.token : null;
  }

  set(token: string, expiresInSeconds: number) {
    this.value = { token, expires: this.clock() + expiresInSeconds * 1000 };
  }

  clear() {
    this.value = null;
  }
}
