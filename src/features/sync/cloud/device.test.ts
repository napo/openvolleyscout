// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { osFromUserAgent } from './device';

describe('device information', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('reads the operating system from the user agent', () => {
    expect(osFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120')).toBe('Android 14');
    expect(osFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X)')).toBe('iOS 17.2');
    expect(osFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows');
  });

  it('works where there is no navigator (older Node, workers)', async () => {
    vi.stubGlobal('navigator', undefined);
    const { currentDevice } = await import('./device');
    const device = await currentDevice();
    expect(device.os).toBe('');
    expect(device.appVersion).toMatch(/\d+\.\d+\.\d+/);
  });
});
