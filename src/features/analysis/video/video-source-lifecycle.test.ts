// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import type { MatchVideoAnalysis, VideoSyncPoint } from '@src/domain/video/types';

vi.mock('@src/features/sync/cloud/video-upload', () => ({ findCloudVideo: vi.fn(async () => null) }));
const deleteVideoFileHandle = vi.fn(async () => undefined);
vi.mock('./file-handle-store', () => ({
  deleteVideoFileHandle: (...args: unknown[]) => deleteVideoFileHandle(...(args as [])),
  getSessionVideoFile: vi.fn(() => null),
  loadVideoFileHandle: vi.fn(async () => null),
  saveVideoFileHandle: vi.fn(async () => undefined),
  supportsFileSystemAccess: vi.fn(() => false),
}));

const { localVideoSourcePatch, remoteVideoSourcePatch, reopenStoredVideoFile, pickBrowserVideoFile } = await import('./video-source-lifecycle');

const syncPoints = [{ id: 's1' }] as unknown as VideoSyncPoint[];
const withFile: Pick<MatchVideoAnalysis, 'source' | 'syncPoints'> = {
  source: { kind: 'file', path: '/videos/match.mp4', fileName: 'match.mp4' },
  syncPoints,
};
const withYoutube: Pick<MatchVideoAnalysis, 'source' | 'syncPoints'> = {
  source: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', videoId: 'dQw4w9WgXcQ' },
  syncPoints,
};

describe('a local file becomes the match video', () => {
  it('the file already linked changes nothing: its sync points stay', () => {
    expect(localVideoSourcePatch(withFile, { path: '/videos/match.mp4' })).toBeNull();
    // A file picked in the browser has no real path: it is recognised by its name.
    expect(localVideoSourcePatch(withFile, { path: 'match.mp4', fileName: 'match.mp4' }, { matchByName: true })).toBeNull();
    expect(localVideoSourcePatch(withFile, { path: 'match.mp4', fileName: 'match.mp4' })).not.toBeNull();
  });

  it('another file keeps the sync points in the analysis panels, starts from scratch elsewhere', () => {
    const kept = localVideoSourcePatch(withFile, { path: '/videos/match-720p.mp4' }, { betweenFiles: 'keep-sync' });
    expect(kept).toEqual({ source: { kind: 'file', path: '/videos/match-720p.mp4', fileName: 'match-720p.mp4' }, syncPoints });
    const reset = localVideoSourcePatch(withFile, { path: '/videos/other.mp4' }, { betweenFiles: 'reset' });
    expect(reset).toMatchObject({ syncPoints: [] });
    expect(reset && 'lastPlaybackPositionSeconds' in reset).toBe(true);
  });

  it('replacing a link with a file is another video, unless it is the same match video (keepSync)', () => {
    expect(localVideoSourcePatch(withYoutube, { path: '/videos/match.mp4' }, { betweenFiles: 'keep-sync' })).toMatchObject({ syncPoints: [] });
    expect(localVideoSourcePatch(withYoutube, { path: '/videos/match.mp4' }, { keepSync: true })).toMatchObject({ syncPoints });
  });
});

describe('a link becomes the match video', () => {
  it('the same video loaded again keeps its sync points', () => {
    const result = remoteVideoSourcePatch(withYoutube, 'https://youtu.be/dQw4w9WgXcQ?t=120');
    expect(result.ok && result.patch.syncPoints).toBe(syncPoints);
  });

  it('another video starts from scratch, unless it replaces the same match video', () => {
    const other = remoteVideoSourcePatch(withYoutube, 'https://youtu.be/aaaaaaaaaaa');
    expect(other.ok && other.patch.syncPoints).toEqual([]);
    const replacing = remoteVideoSourcePatch(withFile, 'https://youtu.be/aaaaaaaaaaa', { keepSync: true });
    expect(replacing.ok && replacing.patch.syncPoints).toBe(syncPoints);
  });

  it('says why a link cannot be used', () => {
    expect(remoteVideoSourcePatch(withFile, 'not a link')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('the file remembered from a previous session', () => {
  const handle = (permission: string, file: File | Error) => ({
    requestPermission: async () => permission,
    getFile: async () => { if (file instanceof Error) throw file; return file; },
  }) as unknown as FileSystemFileHandle;

  it('is reopened once the browser grants the permission', async () => {
    const file = new File(['x'], 'match.mp4');
    expect(await reopenStoredVideoFile('m1', handle('granted', file))).toBe(file);
  });

  it('is left alone when the user refuses', async () => {
    expect(await reopenStoredVideoFile('m1', handle('denied', new File(['x'], 'match.mp4')))).toBe('denied');
    expect(deleteVideoFileHandle).not.toHaveBeenCalled();
  });

  it('is forgotten when the file moved or was deleted', async () => {
    expect(await reopenStoredVideoFile('m1', handle('granted', new Error('gone')))).toBeNull();
    expect(deleteVideoFileHandle).toHaveBeenCalledWith('m1');
  });

  it('a browser without a file picker is told apart from a dismissed picker', async () => {
    expect(await pickBrowserVideoFile()).toBe('unsupported');
  });
});
