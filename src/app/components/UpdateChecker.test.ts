// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { extractAndroidApkUpdate } from './UpdateChecker';

describe('extractAndroidApkUpdate', () => {
  const sampleRelease = {
    tag_name: 'v0.31.0',
    html_url: 'https://github.com/napo/openvolleyscout/releases/tag/v0.31.0',
    assets: [
      {
        name: 'OpenVolleyScout-0.31.0_android.apk',
        browser_download_url: 'https://github.com/napo/openvolleyscout/releases/download/v0.31.0/OpenVolleyScout-0.31.0_android.apk',
        size: 12_000_000,
      },
      {
        name: 'OpenVolleyScout_0.31.0_amd64.deb',
        browser_download_url: 'https://github.com/napo/openvolleyscout/releases/download/v0.31.0/OpenVolleyScout_0.31.0_amd64.deb',
        size: 20_000_000,
      },
    ],
  };

  it('returns the APK download URL when a newer version exists', () => {
    expect(extractAndroidApkUpdate(sampleRelease, '0.30.3')).toEqual({
      version: '0.31.0',
      url: 'https://github.com/napo/openvolleyscout/releases/download/v0.31.0/OpenVolleyScout-0.31.0_android.apk',
    });
  });

  it('returns null when already on the latest or newer version', () => {
    expect(extractAndroidApkUpdate(sampleRelease, '0.31.0')).toBeNull();
    expect(extractAndroidApkUpdate(sampleRelease, '0.32.0')).toBeNull();
  });

  it('falls back to the release page URL when no APK asset is present yet', () => {
    const withoutApk = { ...sampleRelease, assets: [sampleRelease.assets[1]] };
    expect(extractAndroidApkUpdate(withoutApk, '0.30.3')).toEqual({
      version: '0.31.0',
      url: 'https://github.com/napo/openvolleyscout/releases',
    });
  });
});
