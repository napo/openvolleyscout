/**
 * Shareable YouTube playlist links: the whole playlist (video ids, clip
 * windows, codes) travels inside the URL fragment, so the player page needs
 * no server, no account and no local OVS data, and the fragment never
 * reaches the web server. Format: `#/player/<version>.<base64url(deflate(json))>`.
 * Only the domain in front is tied to where OVS is hosted; the payload opens
 * on any OVS build, whatever domain the link was made on.
 *
 * Optional fields added later (an expiry, action descriptions) keep the
 * format at version 1: older builds simply ignore them.
 */
import { Inflate, deflateSync, strFromU8, strToU8 } from 'fflate';
import type { YouTubePlaylistClip } from './youtube-playlist';

export const SHARED_PLAYLIST_ROUTE = '/player';
const FORMAT_VERSION = 1;
const MAX_PAYLOAD_LENGTH = 200_000;
const MAX_CLIPS = 2000;
/** Most bytes a link may unpack to: far above any real playlist. */
const MAX_UNPACKED_BYTES = 4 * 1024 * 1024;
/** Above this length some messaging and mail apps cut a link. */
export const LONG_LINK_LENGTH = 8000;
/** A usability budget for individual messaging links, not a WhatsApp protocol limit. */
export const MESSAGE_LINK_LENGTH = 1800;

/**
 * Unpacks, stopping as soon as the content goes beyond the limit, so a link
 * made to fill the memory is refused (same guard as VolleyReport's links).
 */
function inflateLimited(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const inflate = new Inflate((chunk) => {
    size += chunk.length;
    if (size > MAX_UNPACKED_BYTES) throw new Error('share: too large');
    chunks.push(chunk);
  });
  inflate.push(data, true);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export type SharedPlaylistLinkStatus = 'ok' | 'long' | 'too_long';

/**
 * Whether a playlist can travel in a link: 'too_long' links would be refused
 * by the player (payload or clip limit), 'long' ones open but may be cut by
 * the app they are sent through.
 */
export function getSharedPlaylistLinkStatus(playlist: SharedPlaylist, url: string): SharedPlaylistLinkStatus {
  const payload = extractSharedPlaylistPayload(url) ?? '';
  if (playlist.clips.length > MAX_CLIPS || payload.length > MAX_PAYLOAD_LENGTH) return 'too_long';
  return url.length > LONG_LINK_LENGTH ? 'long' : 'ok';
}
const MAX_TEXT_LENGTH = 200;
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export interface SharedPlaylist {
  title: string;
  subtitle: string;
  clips: YouTubePlaylistClip[];
  /** Epoch milliseconds after which the player refuses the link; absent = never expires. */
  expiresAt?: number;
}

/**
 * True once the link's expiry has passed. The link carries its own expiry,
 * so this is a courtesy shown by the player, not access control: whoever has
 * the link and can edit it could remove the date.
 */
export function isSharedPlaylistExpired(playlist: Pick<SharedPlaylist, 'expiresAt'>, now = Date.now()): boolean {
  return playlist.expiresAt !== undefined && now > playlist.expiresAt;
}

/** End of the day `days` days from now; null = never expires. */
export function sharedPlaylistExpiryAfter(days: number | null, now = new Date()): number | undefined {
  if (days === null) return undefined;
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 0);
  return end.getTime();
}

/** Version 1 wire format: times in tenths of a second, label windows relative to their clip. */
interface CompactPlaylistV1 {
  t: string;
  s: string;
  v: string[];
  /** [video index, start, end, caption, [[label offset, label duration, code, description?], ...]] */
  c: Array<[number, number, number, string, Array<[number, number, string, string?]>]>;
  /** Expiry in epoch seconds; absent = never. */
  x?: number;
}

const toTenths = (seconds: number) => Math.round(seconds * 10);
const fromTenths = (tenths: number) => tenths / 10;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
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
    ...(playlist.expiresAt !== undefined ? { x: Math.round(playlist.expiresAt / 1000) } : {}),
    c: playlist.clips.map((clip) => {
      let videoIndex = videoIds.indexOf(clip.videoId);
      if (videoIndex < 0) videoIndex = videoIds.push(clip.videoId) - 1;
      const start = toTenths(clip.startSeconds);
      return [
        videoIndex,
        start,
        toTenths(clip.endSeconds),
        clip.caption,
        clip.labels.map((label): [number, number, string, string?] => {
          const row: [number, number, string, string?] = [
            toTenths(label.startSeconds) - start,
            toTenths(label.endSeconds) - toTenths(label.startSeconds),
            label.text,
          ];
          if (label.description) row.push(label.description);
          return row;
        }),
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
    compact = JSON.parse(strFromU8(inflateLimited(base64UrlToBytes(match[2]))));
  } catch {
    return null;
  }
  if (!compact || typeof compact !== 'object') return null;
  const { t, s, v, c, x } = compact as Partial<CompactPlaylistV1>;
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
        const description = text(label[3]);
        return [{
          startSeconds: fromTenths(labelStart),
          endSeconds: fromTenths(labelStart + label[1]),
          text: text(label[2]),
          ...(description ? { description } : {}),
        }];
      }),
    });
  }
  if (clips.length === 0) return null;
  return { title: text(t), subtitle: text(s), clips, ...(isNumber(x) ? { expiresAt: x * 1000 } : {}) };
}

/** `<base>/#/player/<payload>`; `baseUrl` is where the OVS web app is served. */
export function buildSharedPlaylistUrl(baseUrl: string, playlist: SharedPlaylist): string {
  return `${baseUrl.replace(/[#?].*$/, '').replace(/\/+$/, '')}/#${SHARED_PLAYLIST_ROUTE}/${encodeSharedPlaylist(playlist)}`;
}

/**
 * Splits oversized playlists into two ordered player links, balancing their
 * encoded sizes while respecting the player's clip limit for each part.
 * A single clip or a playlist too large for two players remains unsplit.
 */
export function splitSharedPlaylistUrls(
  baseUrl: string,
  playlist: SharedPlaylist,
  maxUrlBytes: number,
): string[] {
  const fullUrl = buildSharedPlaylistUrl(baseUrl, playlist);
  const fullPayload = extractSharedPlaylistPayload(fullUrl);
  const byteLength = (url: string) => new TextEncoder().encode(url).length;
  if (
    playlist.clips.length <= MAX_CLIPS
    && fullPayload !== null
    && fullPayload.length <= MAX_PAYLOAD_LENGTH
    && byteLength(fullUrl) <= maxUrlBytes
  ) {
    return [fullUrl];
  }
  if (playlist.clips.length < 2) return [fullUrl];

  const buildParts = (splitIndex: number) => [1, 2].map((part) => {
    const marker = `${part}/2 · `;
    const title = `${marker}${Array.from(playlist.title).slice(0, MAX_TEXT_LENGTH - marker.length).join('')}`;
    const clips = part === 1 ? playlist.clips.slice(0, splitIndex) : playlist.clips.slice(splitIndex);
    return buildSharedPlaylistUrl(baseUrl, { ...playlist, title, clips });
  });

  let low = Math.max(1, playlist.clips.length - MAX_CLIPS);
  let high = Math.min(MAX_CLIPS, playlist.clips.length - 1);
  if (low > high) return [fullUrl];
  let bestUrls = buildParts(Math.floor((low + high) / 2));
  let bestSize = Math.max(...bestUrls.map(byteLength));
  while (low <= high) {
    const splitIndex = Math.floor((low + high) / 2);
    const urls = buildParts(splitIndex);
    const [leftSize, rightSize] = urls.map(byteLength);
    const size = Math.max(leftSize, rightSize);
    if (size < bestSize) {
      bestUrls = urls;
      bestSize = size;
    }
    if (leftSize < rightSize) low = splitIndex + 1;
    else high = splitIndex - 1;
  }
  return bestUrls;
}

/** Ordered parts that each fit the messaging budget. Never silently drops an oversized action. */
export function buildMessagePlaylistUrls(baseUrl: string, playlist: SharedPlaylist, maxLength = MESSAGE_LINK_LENGTH): string[] {
  const fits = (url: string) => new TextEncoder().encode(url).length <= maxLength;
  const full = buildSharedPlaylistUrl(baseUrl, playlist);
  if (playlist.clips.length <= MAX_CLIPS && fits(full)) return [full];
  const chunks: YouTubePlaylistClip[][] = [];
  const buildPart = (clips: YouTubePlaylistClip[], part: number, total: number) => buildSharedPlaylistUrl(baseUrl, {
    ...playlist, title: `${part}/${total} · ${playlist.title}`.slice(0, MAX_TEXT_LENGTH), clips,
  });
  let start = 0;
  while (start < playlist.clips.length) {
    let low = 1, high = Math.min(MAX_CLIPS, playlist.clips.length - start), best = 0;
    // Reserve the largest possible part marker before the final total is known.
    const marker = playlist.clips.length;
    while (low <= high) {
      const count = Math.floor((low + high) / 2);
      if (fits(buildPart(playlist.clips.slice(start, start + count), marker, marker))) {
        best = count; low = count + 1;
      } else high = count - 1;
    }
    if (!best) return [];
    chunks.push(playlist.clips.slice(start, start + best));
    start += best;
  }
  // Compression sizes are not strictly monotonic, including when the title changes.
  // Split further if a final marker happens to encode less efficiently.
  for (let index = 0; index < chunks.length; index++) {
    if (fits(buildPart(chunks[index], index + 1, chunks.length))) continue;
    if (chunks[index].length === 1) return [];
    const half = Math.ceil(chunks[index].length / 2);
    chunks.splice(index, 1, chunks[index].slice(0, half), chunks[index].slice(half));
    index = -1;
  }
  return chunks.map((clips, index) => buildPart(clips, index + 1, chunks.length));
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
