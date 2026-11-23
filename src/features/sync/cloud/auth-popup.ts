// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Web PKCE popup redirect: opens a blank popup synchronously on the user's tap
 * (so browsers do not block it), then navigates to the provider's login page.
 * The provider redirects to public/oauth-callback.html which posts the URL back
 * on a same-origin BroadcastChannel.
 */

import { type Redirect, SignInError } from './auth-pkce';

const CHANNEL = 'openvolleyscout-oauth';
const TIMEOUT_MS = 5 * 60_000;

export function popupSignIn(): { redirect: () => Promise<Redirect>; openBrowser: (url: string) => Promise<void> } {
  let popup: Window | null = null;
  let stop: (() => void) | null = null;
  return {
    async redirect() {
      popup = window.open('about:blank', 'openvolleyscout-oauth', 'popup,width=520,height=720');
      if (!popup) throw new SignInError('popup blocked');
      const rawBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
      return {
        uri: `${location.origin}${base}oauth-callback.html`,
        wait: () =>
          new Promise<string>((resolve, reject) => {
            const channel = new BroadcastChannel(CHANNEL);
            const end = () => {
              clearTimeout(timer);
              channel.close();
              stop = null;
            };
            const timer = setTimeout(() => {
              end();
              reject(new SignInError('timeout'));
            }, TIMEOUT_MS);
            channel.onmessage = (event) => {
              end();
              resolve(String(event.data));
            };
            stop = () => {
              end();
              reject(new SignInError('cancelled'));
            };
          }),
        cancel: () => {
          stop?.();
          popup?.close();
        },
      };
    },
    async openBrowser(url) {
      if (popup) popup.location.href = url;
    },
  };
}
