import { describe, expect, it } from 'vitest';
import { buildYouTubePlaylistClips } from './youtube-playlist';
import { deflateSync } from 'fflate';
import {
  LONG_LINK_LENGTH,
  buildMessagePlaylistUrls,
  MESSAGE_LINK_LENGTH,
  buildSharedPlaylistUrl,
  bytesToBase64Url,
  decodeSharedPlaylist,
  getSharedPlaylistLinkStatus,
  encodeSharedPlaylist,
  extractSharedPlaylistPayload,
  isSharedPlaylistExpired,
  sharedPlaylistExpiryAfter,
  splitSharedPlaylistUrls,
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
  it('carries action descriptions and the expiry; no expiry means never', () => {
    const clips = buildYouTubePlaylistClips([
      { videoId: 'M7lc1UVf-VE', videoSeconds: 100, label: 'a05SM#', description: 'Servizio · 5 Rossi · #', caption: 'S1' },
      { videoId: 'M7lc1UVf-VE', videoSeconds: 101, label: '*10RM-', caption: 'S1' },
    ], 3, 1);
    const expiresAt = sharedPlaylistExpiryAfter(7, new Date(2026, 10, 5, 10))!;
    const decoded = decodeSharedPlaylist(encodeSharedPlaylist({ title: 'T', subtitle: '', clips, expiresAt }))!;
    expect(decoded.clips[0].labels.map((label) => label.description)).toEqual(['Servizio · 5 Rossi · #', undefined]);
    expect(decoded.expiresAt).toBe(expiresAt);
    expect(new Date(expiresAt).getDate()).toBe(12);
    expect(isSharedPlaylistExpired(decoded, expiresAt - 1)).toBe(false);
    expect(isSharedPlaylistExpired(decoded, expiresAt + 1000)).toBe(true);

    expect(sharedPlaylistExpiryAfter(null)).toBeUndefined();
    const forever = decodeSharedPlaylist(encodeSharedPlaylist({ title: 'T', subtitle: '', clips }))!;
    expect(forever.expiresAt).toBeUndefined();
    expect(isSharedPlaylistExpired(forever, Date.UTC(2100, 0, 1))).toBe(false);
  });

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

describe('link length guard', () => {
  const clip = (index: number) => ({
    videoId: 'abcdefghijk', startSeconds: index * 10, endSeconds: index * 10 + 8, caption: `Action ${index} ${'x'.repeat(40)}${index * 7919}`, labels: [],
  });
  const playlist = (count: number) => ({ title: 'T', subtitle: 'S', clips: Array.from({ length: count }, (_, index) => clip(index)) });

  it('accepts a normal playlist', () => {
    const p = playlist(5);
    expect(getSharedPlaylistLinkStatus(p, buildSharedPlaylistUrl('https://example.org/app', p))).toBe('ok');
    expect(splitSharedPlaylistUrls('https://example.org/app', p, 2900)).toHaveLength(1);
  });

  it('splits oversized playlists into two ordered links that each open', () => {
    const p = playlist(2001);
    const urls = splitSharedPlaylistUrls('https://example.org/app', p, 2900);
    expect(urls).toHaveLength(2);
    const parts = urls.map((url) => {
      const payload = extractSharedPlaylistPayload(url)!;
      const decoded = decodeSharedPlaylist(payload)!;
      expect(getSharedPlaylistLinkStatus(decoded, url)).not.toBe('too_long');
      return decoded;
    });
    expect(parts.map((part) => part.title.slice(0, 3))).toEqual(['1/2', '2/2']);
    expect(parts[0].clips.concat(parts[1].clips)).toEqual(p.clips);
  });

  it.each(['start', 'end'])('keeps both parts readable with larger captions at the %s', (largerEnd) => {
    let seed = 42;
    const randomCaption = () => Array.from({ length: 180 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String.fromCharCode(33 + seed % 90);
    }).join('');
    const p = playlist(2500);
    p.clips = p.clips.map((clip, index) => ({
      ...clip,
      caption: (largerEnd === 'start' ? index < 500 : index >= 2000) ? randomCaption() : 'S1',
    }));

    const urls = splitSharedPlaylistUrls('https://example.org/app', p, 2900);
    expect(urls).toHaveLength(2);
    const parts = urls.map((url) => decodeSharedPlaylist(extractSharedPlaylistPayload(url)!));
    expect(parts.every((part) => part !== null)).toBe(true);
    expect(parts.flatMap((part) => part!.clips)).toEqual(p.clips);
  });

  it('supports the two-part clip limit and rejects playlists beyond it', () => {
    const urls = splitSharedPlaylistUrls('https://example.org/app', playlist(4000), 2900);
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(decodeSharedPlaylist(extractSharedPlaylistPayload(url)!)?.clips).toHaveLength(2000);
    }

    const tooMany = playlist(4001);
    const refused = splitSharedPlaylistUrls('https://example.org/app', tooMany, 2900);
    expect(refused).toHaveLength(1);
    expect(getSharedPlaylistLinkStatus(tooMany, refused[0])).toBe('too_long');
    expect(decodeSharedPlaylist(extractSharedPlaylistPayload(refused[0])!)).toBeNull();
  });

  it('balances a link split to fit the requested URL size', () => {
    const p = playlist(20);
    const baseUrl = 'https://example.org/app';
    const fullUrl = buildSharedPlaylistUrl(baseUrl, p);
    const maxUrlBytes = new TextEncoder().encode(fullUrl).length - 1;
    const urls = splitSharedPlaylistUrls(baseUrl, p, maxUrlBytes);
    expect(urls).toHaveLength(2);
    expect(urls.every((url) => new TextEncoder().encode(url).length <= maxUrlBytes)).toBe(true);
  });

  it('warns when the link is long but still opens', () => {
    const p = playlist(1500);
    const url = buildSharedPlaylistUrl('https://example.org/app', p);
    expect(url.length).toBeGreaterThan(LONG_LINK_LENGTH);
    expect(getSharedPlaylistLinkStatus(p, url)).toBe('long');
    expect(decodeSharedPlaylist(extractSharedPlaylistPayload(url)!)?.clips).toHaveLength(1500);
  });

  it('refuses a playlist the player could not open', () => {
    const p = playlist(2001);
    const url = buildSharedPlaylistUrl('https://example.org/app', p);
    expect(getSharedPlaylistLinkStatus(p, url)).toBe('too_long');
    expect(decodeSharedPlaylist(extractSharedPlaylistPayload(url)!)).toBeNull();
  });

  it('refuses a link that unpacks beyond the limit', () => {
    const bomb = `1.${bytesToBase64Url(deflateSync(new Uint8Array(5 * 1024 * 1024)))}`;
    expect(decodeSharedPlaylist(bomb)).toBeNull();
  });
});

describe('individual messaging links', () => {
  it('splits a large selection into as many bounded, ordered links as needed', () => {
    const clips = Array.from({ length: 600 }, (_, index) => ({
      videoId: 'M7lc1UVf-VE', startSeconds: index * 30, endSeconds: index * 30 + 10,
      caption: `S${index % 5} · ${index} – ${index * 19}`, labels: [{
        startSeconds: index * 30, endSeconds: index * 30 + 10,
        text: `a${index % 12}AH#`, description: `Attack ${index} ${index * 7919}`,
      }],
    }));
    const urls = buildMessagePlaylistUrls('https://example.org/ovs/', { ...playlist, clips });
    expect(urls.length).toBeGreaterThan(2);
    const decoded = urls.map(url => {
      expect(new TextEncoder().encode(url).length).toBeLessThanOrEqual(MESSAGE_LINK_LENGTH);
      const part = decodeSharedPlaylist(extractSharedPlaylistPayload(url)!);
      expect(part).not.toBeNull();
      return part!;
    });
    expect(decoded.flatMap(part => part.clips)).toEqual(clips);
    expect(decoded.every((part, index) => part.title.startsWith(`${index + 1}/${urls.length} · `))).toBe(true);
  });
  it('keeps normal links intact and refuses a single action that cannot fit', () => {
    expect(buildMessagePlaylistUrls('https://example.org', playlist)).toEqual([buildSharedPlaylistUrl('https://example.org', playlist)]);
    expect(buildMessagePlaylistUrls('https://example.org', { ...playlist, clips: [playlist.clips[0]] }, 40)).toEqual([]);
  });
});
