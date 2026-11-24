// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { remoteVideoErrorKeys } from './RemoteVideoErrorHelp';

const youtube = { kind: 'youtube' as const, url: 'https://youtu.be/abc', videoId: 'abc' };

describe('help for videos that cannot be opened', () => {
  it('tells private YouTube videos from ones the owner does not allow outside YouTube', () => {
    expect(remoteVideoErrorKeys(youtube, 100).title).toBe('videoYouTubePrivateError');
    expect(remoteVideoErrorKeys(youtube, 150).title).toBe('videoYouTubeEmbedError');
    expect(remoteVideoErrorKeys(youtube, 101).tips).toContain('videoYouTubeTipEmbedding');
    expect(remoteVideoErrorKeys(youtube, null).tips).toEqual(['videoYouTubeTipUnlisted', 'videoTipDownload']);
  });

  it('suggests the Dropbox alternatives only for Dropbox links', () => {
    const dropbox = remoteVideoErrorKeys({ kind: 'url', url: 'https://www.dropbox.com/scl/fi/x/m.mp4?raw=1' }, null);
    expect(dropbox.title).toBe('videoDropboxLoadError');
    expect(dropbox.tips).toHaveLength(3);
    expect(remoteVideoErrorKeys({ kind: 'url', url: 'https://example.com/m.mp4' }, null)).toEqual({ title: 'videoRemoteLoadError', tips: [] });
  });

  it('explains Google Drive failures by sharing when the Drive API key is configured', () => {
    const drive = { kind: 'url' as const, url: 'https://drive.usercontent.google.com/download?id=abc&export=download&confirm=t' };
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY_WEB', '');
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY_APP', '');
    expect(remoteVideoErrorKeys(drive, null).title).toBe('videoGoogleDriveLoadError');
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY_APP', 'KEY');
    expect(remoteVideoErrorKeys(drive, null).title).toBe('videoGoogleDriveApiLoadError');
    expect(remoteVideoErrorKeys(drive, null).tips).toContain('videoCloudTipAnyone');
    vi.unstubAllEnvs();
  });
});
