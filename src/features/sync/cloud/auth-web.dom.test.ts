// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Answer = (response: { access_token?: string; expires_in?: number; error?: string }) => void;

/** Google's token client: every requestAccessToken() opens a window whose answer the test gives. */
const windows: { answer: Answer; fail: (type: string) => void; hint?: string; prompt?: string }[] = [];

function installGoogle() {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => ({
          requestAccessToken: (options) => {
            windows.push({
              answer: config.callback,
              fail: (type) => config.error_callback?.({ type }),
              hint: config.login_hint,
              prompt: options?.prompt,
            });
          },
        }),
        revoke: () => undefined,
      },
    },
  };
}

async function makeAuth() {
  const { WebGoogleAuth } = await import('./auth-web');
  return new WebGoogleAuth('client');
}

/** Lets the microtasks of a request run (the window opens after Google's script promise). */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  windows.length = 0;
  localStorage.clear();
  localStorage.setItem('openvolleyscout.google.consented', '1');
  installGoogle();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: { emailAddress: 'scout@example.org' } }))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Google sign-in on the web', () => {
  it('shares one window between the renewal and a Sync now of the same tap', async () => {
    const auth = await makeAuth();
    const renewal = auth.renew();
    const syncNow = auth.token(true);
    await settle();
    expect(windows).toHaveLength(1);
    expect(windows[0].prompt).toBe('');
    windows[0].answer({ access_token: 'tok', expires_in: 3600 });
    expect(await renewal).toBe('tok');
    expect(await syncNow).toBe('tok');
  });

  it('opens a new window on a later tap when the first one was left open, and ignores the old one closing', async () => {
    const auth = await makeAuth();
    const forgotten = auth.renew();
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    const reconnect = auth.token(true);
    await settle();
    expect(windows).toHaveLength(2);
    windows[0].fail('popup_closed');
    await settle();
    windows[1].answer({ access_token: 'tok', expires_in: 3600 });
    expect(await reconnect).toBe('tok');
    expect(await forgotten).toBe('tok');
  });

  it('gives up a window without an answer after two minutes, and keeps a token that comes later', async () => {
    const auth = await makeAuth();
    const renewal = auth.renew();
    await settle();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(await renewal).toBeNull();
    expect(await auth.token(false)).toBeNull();
    windows[0].answer({ access_token: 'late', expires_in: 3600 });
    expect(await auth.token(false)).toBe('late');
    expect(auth.needsRenewal()).toBe(false);
  });

  it('ends at once when the sign-in is cancelled', async () => {
    const auth = await makeAuth();
    const request = auth.token(true);
    await settle();
    auth.cancel();
    expect(await request).toBeNull();
  });

  it('passes the account of the first connection as a hint to later windows', async () => {
    const auth = await makeAuth();
    const first = auth.token(true);
    await settle();
    expect(windows[0].hint).toBeUndefined();
    windows[0].answer({ access_token: 'tok', expires_in: 1 });
    expect(await first).toBe('tok');
    await settle();
    expect(localStorage.getItem('openvolleyscout.google.account')).toBe('scout@example.org');

    const renewal = auth.renew();
    await settle();
    expect(windows[1].hint).toBe('scout@example.org');
    windows[1].answer({ access_token: 'tok2', expires_in: 3600 });
    expect(await renewal).toBe('tok2');
  });
});
