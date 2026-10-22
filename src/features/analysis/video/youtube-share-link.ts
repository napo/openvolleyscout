/**
 * Shareable YouTube playlist links: the whole playlist (video ids, clip
 * windows, codes) travels inside the URL fragment, so the player page needs
 * no server, no account and no local OVS data, and the fragment never
 * reaches the web server. Format: `#/player/<version>.<base64url(deflate(json))>`.
 * Only the domain in front is tied to where OVS is hosted; the payload opens
 * on any OVS build, whatever domain the link was made on.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { YouTubePlaylistClip } from './youtube-playlist';

export const SHARED_PLAYLIST_ROUTE = '/player';
const FORMAT_VERSION = 1;
const MAX_PAYLOAD_LENGTH = 200_000;
const MAX_CLIPS = 2000;
const MAX_TEXT_LENGTH = 200;
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export interface SharedPlaylist {
  title: string;
  subtitle: string;
  clips: YouTubePlaylistClip[];
}

/** Version 1 wire format: times in tenths of a second, label windows relative to their clip. */
interface CompactPlaylistV1 {
  t: string;
  s: string;
  v: string[];
  /** [video index, start, end, caption, [[label offset, label duration, code], ...]] */
  c: Array<[number, number, number, string, Array<[number, number, string]>]>;
}

const toTenths = (seconds: number) => Math.round(seconds * 10);
const fromTenths = (tenths: number) => tenths / 10;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeSharedPlaylist(playlist: SharedPlaylist): string {
  const videoIds: string[] = [];
  const compact: CompactPlaylistV1 = {
    t: playlist.title,
    s: playlist.subtitle,
    v: videoIds,
    c: playlist.clips.map((clip) => {
      let videoIndex = videoIds.indexOf(clip.videoId);
      if (videoIndex < 0) videoIndex = videoIds.push(clip.videoId) - 1;
      const start = toTenths(clip.startSeconds);
      return [
        videoIndex,
        start,
        toTenths(clip.endSeconds),
        clip.caption,
        clip.labels.map((label) => [
          toTenths(label.startSeconds) - start,
          toTenths(label.endSeconds) - toTenths(label.startSeconds),
          label.text,
        ]),
      ];
    }),
  };
  return `${FORMAT_VERSION}.${bytesToBase64Url(deflateSync(strToU8(JSON.stringify(compact)), { level: 9 }))}`;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : '');

/** Parse a payload; null when it is malformed, truncated or from an unknown future version. */
export function decodeSharedPlaylist(payload: string): SharedPlaylist | null {
  const match = payload.trim().match(/^(\d+)\.([\w-]+)$/);
  if (!match || payload.length > MAX_PAYLOAD_LENGTH || Number(match[1]) !== FORMAT_VERSION) return null;

  let compact: unknown;
  try {
    compact = JSON.parse(strFromU8(inflateSync(base64UrlToBytes(match[2]))));
  } catch {
    return null;
  }
  if (!compact || typeof compact !== 'object') return null;
  const { t, s, v, c } = compact as Partial<CompactPlaylistV1>;
  if (!Array.isArray(v) || !Array.isArray(c) || c.length > MAX_CLIPS) return null;

  const clips: YouTubePlaylistClip[] = [];
  for (const row of c) {
    if (!Array.isArray(row)) return null;
    const [videoIndex, start, end, caption, labels] = row;
    const videoId = isNumber(videoIndex) ? v[videoIndex] : undefined;
    if (typeof videoId !== 'string' || !VIDEO_ID_PATTERN.test(videoId)) return null;
    if (!isNumber(start) || !isNumber(end) || start < 0 || end <= start || !Array.isArray(labels)) return null;
    clips.push({
      videoId,
      startSeconds: fromTenths(start),
      endSeconds: fromTenths(end),
      caption: text(caption),
      labels: labels.flatMap((label) => {
        if (!Array.isArray(label) || !isNumber(label[0]) || !isNumber(label[1])) return [];
        const labelStart = start + label[0];
        return [{ startSeconds: fromTenths(labelStart), endSeconds: fromTenths(labelStart + label[1]), text: text(label[2]) }];
      }),
    });
  }
  if (clips.length === 0) return null;
  return { title: text(t), subtitle: text(s), clips };
}

/** `<base>/#/player/<payload>`; `baseUrl` is where the OVS web app is served. */
export function buildSharedPlaylistUrl(baseUrl: string, playlist: SharedPlaylist): string {
  return `${baseUrl.replace(/[#?].*$/, '').replace(/\/+$/, '')}/#${SHARED_PLAYLIST_ROUTE}/${encodeSharedPlaylist(playlist)}`;
}

/**
 * The payload of a shared link pasted from anywhere: any domain (old or new
 * OVS hosting), or the bare payload itself.
 */
export function extractSharedPlaylistPayload(input: string): string | null {
  const trimmed = input.trim();
  const marker = `#${SHARED_PLAYLIST_ROUTE}/`;
  const markerIndex = trimmed.indexOf(marker);
  const candidate = markerIndex >= 0 ? trimmed.slice(markerIndex + marker.length) : trimmed;
  const payload = candidate.split(/[?#\s]/)[0];
  return /^\d+\.[\w-]+$/.test(payload) ? payload : null;
}
