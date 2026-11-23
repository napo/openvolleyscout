// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveClient } from './drive';
import { DropboxClient } from './dropbox';
import { OneDriveClient } from './onedrive';
import { type CloudVideoFile, VIDEO_CHUNK_BYTES, type VideoStorage, cloudVideoName, matchIdFromCloudVideoName } from './storage';
import { uploadOneVideo } from './video-upload';

vi.mock('./archive-adapter', () => ({ cloudSyncController: { status: { provider: 'google-drive' } } }));

const video = { matchId: 'm1', label: 'A - B', playedAt: '', fileName: 'match.mp4', path: '/v/match.mp4' };
const SIZE = VIDEO_CHUNK_BYTES * 2 + 5;
const read = async (offset: number, length: number) => new Uint8Array(length).fill(offset % 251);

/** A cloud that keeps the received bytes count per session and can drop the connection once. */
function fakeStorage(failAt: number | null = null) {
  const received = new Map<string, number>();
  let failed = false;
  let sessions = 0;
  const storage: VideoStorage & { starts: () => number } = {
    starts: () => sessions,
    listVideos: async () => [],
    startVideoUpload: async () => { sessions += 1; received.set(`s${sessions}`, 0); return `s${sessions}`; },
    videoUploadOffset: async (session) => received.get(session) ?? null,
    uploadVideoChunk: async (session, offset, bytes, size) => {
      if (failAt !== null && !failed && offset >= failAt) { failed = true; throw new Error('network'); }
      expect(offset).toBe(received.get(session));
      const end = offset + bytes.length;
      received.set(session, end);
      if (end < size) return { done: false, offset: end };
      return { done: true, file: { id: 'f1', matchId: 'm1', name: cloudVideoName('m1', 'match.mp4'), size } as CloudVideoFile };
    },
    canStream: true,
    videoStreamUrl: async () => '',
    videoDownloadRequest: async () => ({ url: '' }),
    trashVideo: async () => undefined,
  };
  return storage;
}

beforeEach(() => localStorage.clear());

describe('video upload', () => {
  it('names cloud files after the match', () => {
    expect(matchIdFromCloudVideoName(cloudVideoName('abc-123', 'a/b:c.mp4'))).toBe('abc-123');
    expect(cloudVideoName('m', 'a/b:c.mp4')).toBe('m__a_b_c.mp4');
  });

  it('sends the file in chunks and reports the progress', async () => {
    const progress: number[] = [];
    const file = await uploadOneVideo(fakeStorage(), 'google-drive', { video, size: SIZE, read }, (sent) => progress.push(sent));
    expect(file?.id).toBe('f1');
    expect(progress).toEqual([0, VIDEO_CHUNK_BYTES, VIDEO_CHUNK_BYTES * 2, SIZE]);
    expect(localStorage.getItem('openvolleyscout.sync.videoUploads')).toBe('{}');
  }, 20000);

  it('resumes a stopped upload from the bytes the cloud already has', async () => {
    const storage = fakeStorage();
    let chunks = 0;
    await uploadOneVideo(storage, 'google-drive', { video, size: SIZE, read }, () => undefined, () => chunks++ >= 1);
    const file = await uploadOneVideo(storage, 'google-drive', { video, size: SIZE, read }, () => undefined);
    expect(file?.id).toBe('f1');
    expect(storage.starts()).toBe(1);
  });

  it('retries a chunk after a dropped connection', async () => {
    vi.useFakeTimers();
    const promise = uploadOneVideo(fakeStorage(VIDEO_CHUNK_BYTES), 'google-drive', { video, size: SIZE, read }, () => undefined);
    await vi.runAllTimersAsync();
    expect((await promise)?.id).toBe('f1');
    vi.useRealTimers();
  });
});

describe('chunk answers of the services', () => {
  it('Google Drive: 308 with Range means more to send, 200 means done', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: 'bytes=0-9' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'g1', name: 'm1__x.mp4', size: '20' }), { status: 200 }));
    const drive = new DriveClient('t', fetchFn);
    expect(await drive.uploadVideoChunk('https://up/s', 0, new Uint8Array(10), 20)).toEqual({ done: false, offset: 10 });
    expect(await drive.uploadVideoChunk('https://up/s', 10, new Uint8Array(10), 20))
      .toEqual({ done: true, file: { id: 'g1', matchId: 'm1', name: 'm1__x.mp4', size: 20 } });
    expect(fetchFn.mock.calls[1][1].headers['Content-Range']).toBe('bytes 10-19/20');
  });

  it('OneDrive: 202 gives the next expected range, no Authorization on the upload URL', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ nextExpectedRanges: ['10-'] }), { status: 202 }));
    const onedrive = new OneDriveClient('t', fetchFn);
    expect(await onedrive.uploadVideoChunk('https://up/s', 0, new Uint8Array(10), 20)).toEqual({ done: false, offset: 10 });
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('Dropbox: a wrong offset is corrected from the error, the last chunk finishes the file', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { '.tag': 'incorrect_offset', correct_offset: 4 } }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'id:d1', name: 'm1__x.mp4', size: 20 }), { status: 200 }));
    const dropbox = new DropboxClient('t', fetchFn);
    const session = JSON.stringify({ id: 'sess', path: '/videos/m1__x.mp4' });
    expect(await dropbox.uploadVideoChunk(session, 0, new Uint8Array(10), 30)).toEqual({ done: false, offset: 4 });
    expect((await dropbox.uploadVideoChunk(session, 10, new Uint8Array(10), 20)).done).toBe(true);
    expect(fetchFn.mock.calls[1][0]).toContain('upload_session/finish');
  });
});

describe('review fixes', () => {
  it('finishes when the cloud already has every byte (lost last answer)', async () => {
    const storage = fakeStorage();
    const done = { id: 'f9', matchId: 'm1', name: 'm1__match.mp4', size: SIZE };
    storage.listVideos = async () => [done];
    storage.videoUploadOffset = async () => SIZE;
    localStorage.setItem('openvolleyscout.sync.videoUploads', JSON.stringify({ m1: { provider: 'google-drive', session: 's1', offset: SIZE, size: SIZE } }));
    const file = await uploadOneVideo(storage, 'google-drive', { video, size: SIZE, read }, () => undefined);
    expect(file).toEqual(done);
    expect(storage.starts()).toBe(0);
  });

  it('forgets a session that keeps failing', async () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    storage.uploadVideoChunk = async () => { throw new Error('gone'); };
    storage.videoUploadOffset = async (_s, _size, known) => known;
    const promise = uploadOneVideo(storage, 'dropbox', { video, size: SIZE, read }, () => undefined).catch((error) => error);
    await vi.runAllTimersAsync();
    expect(await promise).toBeInstanceOf(Error);
    expect(localStorage.getItem('openvolleyscout.sync.videoUploads')).toBe('{}');
    vi.useRealTimers();
  });

  it('Google Drive downloads with the token in the Authorization header and never streams', async () => {
    const drive = new DriveClient('tok', vi.fn());
    expect(drive.canStream).toBe(false);
    expect(await drive.videoDownloadRequest({ id: 'g1', matchId: 'm1', name: 'x', size: 1 }))
      .toEqual({ url: 'https://www.googleapis.com/drive/v3/files/g1?alt=media', headers: { Authorization: 'Bearer tok' } });
  });
});
