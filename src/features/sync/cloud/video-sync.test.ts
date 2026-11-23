// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DriveClient } from './drive';
import { DropboxClient } from './dropbox';
import { OneDriveClient } from './onedrive';
import { defaultVideoSync, estimateVideoSpace, formatBytes, isMobileDevice } from './video-sync';

const GB = 1_000_000_000;

describe('video sync per device', () => {
  it('starts off on phones and tablets, on for computers', () => {
    expect(isMobileDevice('android')).toBe(true);
    expect(isMobileDevice('desktop')).toBe(false);
    expect(isMobileDevice('web', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile')).toBe(true);
    expect(isMobileDevice('web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe(false);
    expect(defaultVideoSync(true)).toBe(false);
    expect(defaultVideoSync(false)).toBe(true);
  });

  it('adds up the known sizes and compares them with the free cloud space', () => {
    const estimate = estimateVideoSpace([4 * GB, 3.4 * GB, null, 'missing'], { used: 12 * GB, total: 15 * GB });
    expect(estimate).toEqual({ needed: 7.4 * GB, known: 2, unknown: 1, free: 3 * GB, missing: 4.4 * GB });
    expect(estimateVideoSpace([1 * GB], { used: 0, total: 15 * GB }).missing).toBe(0);
    expect(estimateVideoSpace([1 * GB], null)).toMatchObject({ free: null, missing: null });
    expect(estimateVideoSpace([1 * GB], { used: 5 * GB, total: null })).toMatchObject({ free: null, missing: null });
  });

  it('formats sizes', () => {
    expect(formatBytes(7.4 * GB, 'en')).toBe('7.4 GB');
    expect(formatBytes(7.4 * GB, 'it')).toBe('7,4 GB');
    expect(formatBytes(512 * 1_000_000, 'en')).toBe('512 MB');
  });
});

describe('cloud space of the account', () => {
  const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

  it('reads the Google Drive quota', async () => {
    const client = new DriveClient('t', answer({ storageQuota: { limit: String(15 * GB), usage: String(12 * GB) } }));
    expect(await client.spaceUsage()).toEqual({ used: 12 * GB, total: 15 * GB });
  });

  it('reads the Dropbox and OneDrive quota, or null when refused', async () => {
    expect(await new DropboxClient('t', answer({ used: 2 * GB, allocation: { allocated: 2 * GB * 1 } })).spaceUsage())
      .toEqual({ used: 2 * GB, total: 2 * GB });
    expect(await new DropboxClient('t', answer({ error_summary: 'missing_scope/' }, 401)).spaceUsage()).toBeNull();
    expect(await new OneDriveClient('t', answer({ quota: { used: GB, total: 5 * GB } })).spaceUsage())
      .toEqual({ used: GB, total: 5 * GB });
    expect(await new OneDriveClient('t', answer({ error: { code: 'accessDenied' } }, 403)).spaceUsage()).toBeNull();
  });
});
