import { describe, expect, it } from 'vitest';
import { buildYouTubePlaylistClips } from './youtube-playlist';
import {
  buildSharedPlaylistUrl,
  decodeSharedPlaylist,
  encodeSharedPlaylist,
  extractSharedPlaylistPayload,
  type SharedPlaylist,
} from './youtube-share-link';

const playlist: SharedPlaylist = {
  title: 'Trento – Verona',
  subtitle: 'Serie A · 2026-10-20',
  clips: buildYouTubePlaylistClips([
    { videoId: 'M7lc1UVf-VE', videoSeconds: 612.34, label: 'a05SM#', caption: 'S1 · 1-0' },
    { videoId: 'M7lc1UVf-VE', videoSeconds: 614.1, label: '*10RM-', caption: 'S1 · 1-0' },
    { videoId: 'dQw4w9WgXcQ', videoSeconds: 30, label: 'a12AH+', caption: 'vs X · S2 · 4-3' },
  ], 3, 1),
};

describe('shared playlist links', () => {
  it('round-trips the playlist at tenth-of-a-second precision', () => {
    const decoded = decodeSharedPlaylist(encodeSharedPlaylist(playlist));
    expect(decoded?.title).toBe(playlist.title);
    expect(decoded?.subtitle).toBe(playlist.subtitle);
    expect(decoded?.clips).toHaveLength(2);
    decoded?.clips.forEach((clip, index) => {
      const original = playlist.clips[index];
      expect(clip.videoId).toBe(original.videoId);
      expect(clip.caption).toBe(original.caption);
      expect(clip.startSeconds).toBeCloseTo(original.startSeconds, 1);
      expect(clip.endSeconds).toBeCloseTo(original.endSeconds, 1);
      expect(clip.labels.map((label) => label.text)).toEqual(original.labels.map((label) => label.text));
      clip.labels.forEach((label, labelIndex) => {
        expect(label.startSeconds).toBeCloseTo(original.labels[labelIndex].startSeconds, 1);
        expect(label.endSeconds).toBeCloseTo(original.labels[labelIndex].endSeconds, 1);
      });
    });
  });

  it('builds a fragment link on any base and reads it back from any domain', () => {
    const url = buildSharedPlaylistUrl('https://napo.github.io/openvolleyscout/', playlist);
    expect(url.startsWith('https://napo.github.io/openvolleyscout/#/player/1.')).toBe(true);
    expect(buildSharedPlaylistUrl('https://example.org/ovs/#/analysis', playlist).startsWith('https://example.org/ovs/#/player/1.')).toBe(true);

    const payload = extractSharedPlaylistPayload(url.replace('napo.github.io/openvolleyscout', 'ovs.example.com'));
    expect(payload).toBe(url.split('#/player/')[1]);
    expect(extractSharedPlaylistPayload(` ${payload} `)).toBe(payload);
    expect(decodeSharedPlaylist(payload ?? '')?.clips).toHaveLength(2);
  });

  it('stays compact for a typical selection', () => {
    const many = buildYouTubePlaylistClips(Array.from({ length: 50 }, (_, index) => ({
      videoId: 'M7lc1UVf-VE',
      videoSeconds: 600 + index * 37.3,
      label: `a${String((index % 14) + 1).padStart(2, '0')}AH${'#+!-/='[index % 6]}`,
      caption: `S${1 + Math.floor(index / 15)} · ${index % 25}-${index % 23}`,
    })), 3, 1);
    expect(encodeSharedPlaylist({ title: 'Team', subtitle: '', clips: many }).length).toBeLessThan(1200);
  });

  it('rejects malformed, truncated, unsafe or future payloads', () => {
    const payload = encodeSharedPlaylist(playlist);
    expect(decodeSharedPlaylist(payload.slice(0, payload.length - 8))).toBeNull();
    expect(decodeSharedPlaylist(`2.${payload.slice(2)}`)).toBeNull();
    expect(decodeSharedPlaylist('garbage')).toBeNull();
    expect(extractSharedPlaylistPayload('https://example.org/#/analysis')).toBeNull();

    const badId = encodeSharedPlaylist({
      ...playlist,
      clips: [{ ...playlist.clips[0], videoId: '"><script>' }],
    });
    expect(decodeSharedPlaylist(badId)).toBeNull();
  });
});
