import { describe, expect, it } from 'vitest';
import { buildLocalPlaylistClips, decodePlaylistFile, encodePlaylistFile, isLocalPlaylist, MAX_PLAYLIST_FILE_BYTES, type LocalPlaylist } from './playlist-file';
import { isSharedPlaylistExpired, type SharedPlaylist } from './youtube-share-link';

const playlist: SharedPlaylist = {
  title: 'Attacchi - squadra A', subtitle: 'Set 2 · a05', expiresAt: 1_900_000_000_000,
  clips: [{ videoId: 'M7lc1UVf-VE', startSeconds: 12.5, endSeconds: 18.5, caption: 'S2 · 10-9',
    labels: [{ startSeconds: 12.5, endSeconds: 18.5, text: 'a05AH#', description: 'Attacco vincente' }] }],
};

describe('OVS playlist files', () => {
  it('preserves the video, time windows, action descriptions, title and expiry', () => {
    expect(decodePlaylistFile(encodePlaylistFile(playlist))).toEqual(playlist);
    expect(decodePlaylistFile('\uFEFF' + encodePlaylistFile(playlist))).toEqual(playlist);
  });
  it('loads a whole playlist larger than the link clip limit without splitting the player', () => {
    const many = { ...playlist, clips: Array.from({ length: 2501 }, (_, i) => ({ ...playlist.clips[0], startSeconds: 30 * i, endSeconds: 30 * i + 10 })) };
    const decoded = decodePlaylistFile(encodePlaylistFile(many));
    expect(decoded).toEqual(many);
  });
  it('keeps an expired file expired', () => {
    const decoded = decodePlaylistFile(encodePlaylistFile({ ...playlist, expiresAt: 1000 }))!;
    expect(isSharedPlaylistExpired(decoded, 2000)).toBe(true);
  });
  it('rejects unknown versions, broken data, unrelated JSON and oversized input', () => {
    const file = JSON.parse(encodePlaylistFile(playlist));
    for (const value of ['<html>file</html>', '{}', 'null', JSON.stringify({ ...file, version: 2 }),
      JSON.stringify({ ...file, parts: ['1.invalid'] }), JSON.stringify({ ...file, parts: [] }),
      JSON.stringify({ ...file, parts: [42] }), ' '.repeat(MAX_PLAYLIST_FILE_BYTES + 1)]) {
      expect(decodePlaylistFile(value)).toBeNull();
    }
  });
  it('refuses inconsistent metadata and videos the player cannot load', () => {
    const first = JSON.parse(encodePlaylistFile(playlist));
    const second = JSON.parse(encodePlaylistFile({ ...playlist, title: 'Other match' }));
    expect(decodePlaylistFile(JSON.stringify({ ...first, parts: [...first.parts, ...second.parts] }))).toBeNull();
    expect(() => encodePlaylistFile({ ...playlist, clips: [] })).toThrow();
    expect(() => encodePlaylistFile({ ...playlist, clips: [{ ...playlist.clips[0], videoId: '<script>' }] })).toThrow();
  });
});

describe('local video playlists', () => {
  const local: LocalPlaylist = {
    title: 'Video locale', subtitle: 'Gara', source: { kind: 'file', fileName: 'gara.mp4' },
    clips: [{ startSeconds: 1, endSeconds: 3, caption: 'S1', labels: [{ startSeconds: 1, endSeconds: 3, text: 'a01AH#', description: 'Attacco' }] }],
  };
  it('preserves local clip timing without a YouTube id or an absolute path', () => {
    for (const fileName of ['/home/coach/private/gara.mp4', 'C:\\Users\\coach\\private\\gara.mp4']) {
      const encoded = encodePlaylistFile({ ...local, source: { kind: 'file', fileName } });
      expect(encoded).not.toContain('private');
      expect(encoded).not.toContain('videoId');
      const decoded = decodePlaylistFile(encoded)!;
      expect(isLocalPlaylist(decoded)).toBe(true);
      expect(decoded).toEqual(local);
    }
  });
  it('merges overlapping actions while preserving filter order and padding', () => {
    const clips = buildLocalPlaylistClips([
      { videoSeconds: 10, label: 'a01SH#', description: 'Battuta', caption: 'S1' },
      { videoSeconds: 12, label: 'b02RH#', caption: 'S1' },
      { videoSeconds: 4, label: 'a03AH#', caption: 'S1' },
      { videoSeconds: null, label: 'unsynced', caption: '' },
    ], 3, 2);
    expect(clips.map(clip => [clip.startSeconds, clip.endSeconds])).toEqual([[7, 14], [1, 6]]);
    expect(clips[0].labels.map(label => label.text)).toEqual(['a01SH#', 'b02RH#']);
    expect(clips.every(clip => !('videoId' in clip))).toBe(true);
  });
  it('rejects malformed sources, intervals and labels', () => {
    const wrap = (playlist: unknown) => JSON.stringify({ format: 'openvolleyscout-playlist', version: 2, playlist });
    expect(decodePlaylistFile(wrap({ ...local, source: { kind: 'url', url: 'file:///private/gara.mp4' } }))).toBeNull();
    expect(decodePlaylistFile(wrap({ ...local, clips: [{ ...local.clips[0], startSeconds: -1 }] }))).toBeNull();
    expect(decodePlaylistFile(wrap({ ...local, clips: [{ ...local.clips[0], endSeconds: 0 }] }))).toBeNull();
    expect(decodePlaylistFile(wrap({ ...local, clips: [{ ...local.clips[0], labels: [null] }] }))).toBeNull();
  });
  it('preserves expiry for a local file too', () => {
    expect(isSharedPlaylistExpired(decodePlaylistFile(encodePlaylistFile({ ...local, expiresAt: 1000 }))!, 2000)).toBe(true);
  });
});
