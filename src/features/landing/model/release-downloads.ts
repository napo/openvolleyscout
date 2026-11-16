import { APP_METADATA } from '@src/lib/constants/app';

export interface BuildDownload {
  name: string;
  label: string;
  url: string;
}

export interface BuildDownloadGroup {
  platform: 'Android' | 'Windows' | 'macOS' | 'Linux';
  files: BuildDownload[];
}

export interface ReleaseDownloads {
  version: string;
  groups: BuildDownloadGroup[];
}

/** Keep installer formats, skipping updater archives, signatures and duplicate aliases. */
export function parseReleaseDownloads(value: unknown): ReleaseDownloads | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as { tag_name?: unknown; assets?: unknown };
  if (typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) return null;
  const platforms: BuildDownloadGroup['platform'][] = ['Android', 'Windows', 'macOS', 'Linux'];
  const files = new Map<string, { platform: BuildDownloadGroup['platform']; file: BuildDownload }>();
  const assets = release.assets.filter((asset): asset is { name: string; browser_download_url: string } => (
    !!asset && typeof asset.name === 'string' && typeof asset.browser_download_url === 'string'
    && asset.browser_download_url.startsWith(`${APP_METADATA.urls.repository}/releases/download/`)
  ));
  // The workflows publish friendly aliases alongside the original updater files.
  assets.sort((a, b) => Number(b.name.startsWith('OpenVolleyScout-')) - Number(a.name.startsWith('OpenVolleyScout-'))
    || a.name.localeCompare(b.name));
  for (const asset of assets) {
    const name = asset.name;
    const extension = name.match(/\.(apk|exe|msi|dmg|AppImage|deb|rpm)$/i)?.[1].toLowerCase();
    if (!extension) continue;
    const arch = /aarch64|arm64/i.test(name) ? 'arm64' : /universal/i.test(name) ? 'universal' : 'x64';
    const platform = extension === 'apk' ? 'Android'
      : extension === 'exe' || extension === 'msi' ? 'Windows'
        : extension === 'dmg' ? 'macOS' : 'Linux';
    const key = `${platform}:${extension}:${extension === 'apk' ? 'universal' : arch}`;
    if (files.has(key)) continue;
    const label = platform === 'macOS' ? `DMG · ${arch === 'arm64' ? 'Apple Silicon' : arch === 'universal' ? 'Universal' : 'Intel'}`
      : platform === 'Android' ? 'APK'
        : `${extension === 'appimage' ? 'AppImage' : extension.toUpperCase()} · ${arch}`;
    files.set(key, { platform, file: { name, label, url: asset.browser_download_url } });
  }
  return {
    version: release.tag_name.replace(/^v/i, ''),
    groups: platforms.map((platform) => ({
      platform,
      files: [...files.values()].filter((entry) => entry.platform === platform).map((entry) => entry.file),
    })).filter((group) => group.files.length > 0),
  };
}
