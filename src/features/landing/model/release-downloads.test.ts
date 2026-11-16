import { describe, expect, it } from 'vitest';
import { parseReleaseDownloads } from './release-downloads';

const asset = (name: string) => ({
  name,
  browser_download_url: `https://github.com/napo/openvolleyscout/releases/download/v1.0.0/${name}`,
});

describe('release downloads', () => {
  it('groups installers and prefers friendly aliases over updater duplicates', () => {
    const result = parseReleaseDownloads({
      tag_name: 'v1.0.0',
      assets: [
        asset('openvolleyscout_1.0.0_x64_en-US.msi'),
        asset('OpenVolleyScout-1.0.0_x64.msi'),
        asset('OpenVolleyScout-1.0.0_x64-setup.exe'),
        asset('OpenVolleyScout-1.0.0_amd64.deb'),
        asset('OpenVolleyScout-1.0.0_amd64.AppImage'),
        asset('openvolleyscout-1.0.0-1.x86_64.rpm'),
        asset('OpenVolleyScout-1.0.0_x86_64.rpm'),
        asset('OpenVolleyScout-1.0.0_aarch64.dmg'),
        asset('OpenVolleyScout-1.0.0_x64.dmg'),
        asset('OpenVolleyScout-1.0.0_android.apk'),
        asset('openvolleyscout_aarch64.app.tar.gz'),
        asset('OpenVolleyScout-1.0.0_amd64.AppImage.sig'),
        asset('latest.json'),
      ],
    });
    expect(result?.version).toBe('1.0.0');
    expect(result?.groups.map((group) => group.platform)).toEqual(['Android', 'Windows', 'macOS', 'Linux']);
    const files = result!.groups.flatMap((group) => group.files);
    expect(files).toHaveLength(8);
    expect(files.every((file) => file.name.startsWith('OpenVolleyScout-'))).toBe(true);
    expect(result?.groups[2].files.map((file) => file.label)).toEqual(['DMG · Apple Silicon', 'DMG · Intel']);
  });

  it('supports original filenames when friendly aliases are not yet uploaded', () => {
    const result = parseReleaseDownloads({tag_name: 'v1.0.0', assets: [asset('openvolleyscout_1.0.0_amd64.deb')]});
    expect(result?.groups[0].files[0].label).toBe('DEB · x64');
  });

  it('handles malformed responses and ignores unrelated download URLs', () => {
    expect(parseReleaseDownloads(null)).toBeNull();
    expect(parseReleaseDownloads({tag_name: 'v1.0.0'})).toBeNull();
    expect(parseReleaseDownloads({tag_name: 'v1.0.0',assets: [null, {}, {
      name: 'installer.exe', browser_download_url: 'https://example.org/installer.exe',
    }]})).toEqual({version: '1.0.0',groups: []});
  });
});
