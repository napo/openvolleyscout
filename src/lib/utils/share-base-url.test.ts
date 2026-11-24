// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { shareBaseUrl } from './share-base-url';

const at = (url: string) => {
  const parsed = new URL(url);
  return { protocol: parsed.protocol, hostname: parsed.hostname, origin: parsed.origin, pathname: parsed.pathname };
};

describe('shareBaseUrl', () => {
  it('points to the official web app, also from the old address or the desktop app', () => {
    expect(shareBaseUrl(at('https://napo.github.io/openvolleyscout/'))).toBe('https://scout.volleyserve.it');
    expect(shareBaseUrl(at('https://scout.volleyserve.it/'))).toBe('https://scout.volleyserve.it');
    expect(shareBaseUrl(at('http://tauri.localhost/'))).toBe('https://scout.volleyserve.it');
  });

  it('links a local development server to itself', () => {
    expect(shareBaseUrl(at('http://localhost:5173/'))).toBe('http://localhost:5173/');
  });
});
