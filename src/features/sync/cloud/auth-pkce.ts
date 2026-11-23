// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * OAuth 2.0 PKCE sign-in (RFC 7636 / RFC 8252): opens the service's page in the
 * system browser (desktop) or a popup window (web), receives the authorisation
 * code, and exchanges it with PKCE for an access token and refresh token kept
 * locally on the device.
 */

import { type CloudAuth, TokenCache } from './auth';
import type { Fetch } from './storage';

/** Endpoints and parameters of an OAuth PKCE cloud provider. */
export interface PkceEndpoints {
  readonly authorize: string;
  readonly token: string;
  /** Absent when the service has no documented revocation endpoint. */
  readonly revoke?: string;
  /** True when the service revokes the access token as Bearer instead of a refresh token query parameter. */
  readonly revokeWithAccessToken?: boolean;
  readonly scope: string;
  readonly extraParams?: Readonly<Record<string, string>>;
  /** Storage key where the refresh token is persisted on the device. */
  readonly storageKey: string;
}

export interface Redirect {
  readonly uri: string;
  /** Resolves with the callback address containing the authorisation code query. */
  wait(): Promise<string>;
  /** Stops waiting and rejects wait(). */
  cancel(): void;
}

export interface PkceOptions {
  readonly endpoints: PkceEndpoints;
  /** Extra headers added to token requests (e.g. empty Origin for Microsoft desktop). */
  readonly tokenHeaders?: Readonly<Record<string, string>>;
  readonly clientId: string;
  /** Desktop clients only; public by design. */
  readonly clientSecret?: string;
  readonly redirect: () => Promise<Redirect>;
  readonly openBrowser: (url: string) => Promise<void>;
  readonly fetch: Fetch;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

/** Sign-in refused or cancelled by the user, or a code the service did not accept. */
export class SignInError extends Error {}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (length: number) => base64url(crypto.getRandomValues(new Uint8Array(length)));

export async function pkcePair() {
  const verifier = random(48);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

export class PkceAuth implements CloudAuth {
  private readonly cache = new TokenCache();
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  private waiting: Redirect | null = null;

  constructor(private readonly options: PkceOptions) {
    this.storage = options.storage ?? localStorage;
  }

  private get refreshKey() {
    return this.options.endpoints.storageKey;
  }

  async token(interactive: boolean): Promise<string | null> {
    const cached = this.cache.get();
    if (cached) return cached;
    if (this.storage.getItem(this.refreshKey) && (await this.refresh())) return this.cache.get();
    return interactive ? this.signIn() : null;
  }

  invalidate() {
    this.cache.clear();
  }

  cancel() {
    this.waiting?.cancel();
    this.waiting = null;
  }

  async signOut(): Promise<void> {
    const token = this.storage.getItem(this.refreshKey);
    const { revoke, revokeWithAccessToken } = this.options.endpoints;
    const access = revokeWithAccessToken && token
      ? (this.cache.get() ?? ((await this.refresh().catch(() => false)) ? this.cache.get() : null))
      : null;
    this.storage.removeItem(this.refreshKey);
    this.cache.clear();
    if (!token || !revoke) return;
    const request = revokeWithAccessToken
      ? access && this.options.fetch(revoke, { method: 'POST', headers: { Authorization: `Bearer ${access}` } })
      : this.options.fetch(`${revoke}?${new URLSearchParams({ token })}`, { method: 'POST' });
    await Promise.resolve(request).catch(() => undefined);
  }

  private async tokenRequest(fields: Record<string, string>) {
    const { clientId, clientSecret } = this.options;
    const body = new URLSearchParams({
      client_id: clientId,
      ...(clientSecret && { client_secret: clientSecret }),
      ...fields,
    });
    const response = await this.options.fetch(this.options.endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...this.options.tokenHeaders },
      body: body.toString(),
    });
    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
    };
    return { ok: response.ok && Boolean(json.access_token), ...json };
  }

  /** Requests a fresh access token using the stored refresh token. */
  private async refresh(): Promise<boolean> {
    const refreshToken = this.storage.getItem(this.refreshKey);
    if (!refreshToken) return false;
    const result = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (!result.ok) {
      if (result.error === 'invalid_grant') this.storage.removeItem(this.refreshKey);
      return false;
    }
    if (result.refresh_token) this.storage.setItem(this.refreshKey, result.refresh_token);
    this.cache.set(result.access_token!, result.expires_in ?? 3600);
    return true;
  }

  private async signIn(): Promise<string> {
    const redirect = await this.options.redirect();
    const { verifier, challenge } = await pkcePair();
    const state = random(16);
    const { authorize, scope, extraParams } = this.options.endpoints;
    const url = `${authorize}?${new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: redirect.uri,
      response_type: 'code',
      scope,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      ...extraParams,
    })}`;
    this.waiting = redirect;
    const back = redirect.wait();
    let address: string;
    try {
      await this.options.openBrowser(url);
      address = await back;
    } catch (e) {
      redirect.cancel();
      throw e instanceof SignInError ? e : new SignInError(String(e));
    } finally {
      if (this.waiting === redirect) this.waiting = null;
    }
    const query = new URL(address, redirect.uri).searchParams;
    if (query.get('state') !== state || !query.get('code')) throw new SignInError(query.get('error') ?? 'no code');
    const result = await this.tokenRequest({
      grant_type: 'authorization_code',
      code: query.get('code')!,
      code_verifier: verifier,
      redirect_uri: redirect.uri,
    });
    if (!result.ok) throw new SignInError(result.error ?? 'token');
    if (result.refresh_token) this.storage.setItem(this.refreshKey, result.refresh_token);
    this.cache.set(result.access_token!, result.expires_in ?? 3600);
    return result.access_token!;
  }
}
