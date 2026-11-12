import { decodeSharedPlaylist, encodeSharedPlaylist, type SharedPlaylist } from './youtube-share-link';
import { buildYouTubePlaylistClips, type YouTubePlaylistClip, type YouTubePlaylistSource } from './youtube-playlist';

export type LocalPlaylistClip = Omit<YouTubePlaylistClip, 'videoId'>;
export interface LocalPlaylist {
  title: string;
  subtitle: string;
  expiresAt?: number;
  source: { kind: 'file'; fileName?: string };
  clips: LocalPlaylistClip[];
}
export type PlaylistDocument = SharedPlaylist | LocalPlaylist;
export const isLocalPlaylist = (playlist: PlaylistDocument): playlist is LocalPlaylist => 'source' in playlist && playlist.source?.kind === 'file';
const fileNameOnly = (name: string) => name.split(/[\\/]/).pop()!.slice(0, 200);

/** Reuse interval merging and padding; the grouping key is never included in a local playlist. */
export function buildLocalPlaylistClips(sources: Omit<YouTubePlaylistSource, 'videoId'>[], before: number, after: number): LocalPlaylistClip[] {
  return buildYouTubePlaylistClips(sources.map(source => ({ ...source, videoId: 'local-video' })), before, after)
    .map(({ videoId: _videoId, ...clip }) => clip);
}

export const PLAYLIST_FILE_EXTENSION = '.ovsp';
export const MAX_PLAYLIST_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_CLIPS = 20_000;
const CLIPS_PER_PART = 500;
const FORMAT = 'openvolleyscout-playlist';

/** Versioned playlist document. Parts reuse the validated player format without putting it in a URL. */
export function encodePlaylistFile(playlist: PlaylistDocument): string {
  if (!playlist.clips.length || playlist.clips.length > MAX_FILE_CLIPS) throw new Error('Invalid playlist size');
  if (isLocalPlaylist(playlist)) {
    const file = JSON.stringify({ format: FORMAT, version: 2, playlist: {
      title: playlist.title, subtitle: playlist.subtitle,
      ...(playlist.expiresAt !== undefined ? { expiresAt: playlist.expiresAt } : {}),
      source: { kind: 'file', ...(playlist.source.fileName ? { fileName: fileNameOnly(playlist.source.fileName) } : {}) },
      clips: playlist.clips.map(({ startSeconds, endSeconds, caption, labels }) => ({ startSeconds, endSeconds, caption, labels })),
    } });
    if (!decodePlaylistFile(file)) throw new Error('Invalid local playlist data');
    return file;
  }
  const parts: string[] = [];
  for (let index = 0; index < playlist.clips.length; index += CLIPS_PER_PART) {
    const part = encodeSharedPlaylist({ ...playlist, clips: playlist.clips.slice(index, index + CLIPS_PER_PART) });
    if (!decodeSharedPlaylist(part)) throw new Error('Invalid playlist data');
    parts.push(part);
  }
  const file = JSON.stringify({ format: FORMAT, version: 1, parts });
  if (new TextEncoder().encode(file).length > MAX_PLAYLIST_FILE_BYTES) throw new Error('Playlist file too large');
  return file;
}

export function decodePlaylistFile(source: string): PlaylistDocument | null {
  if (source.length > MAX_PLAYLIST_FILE_BYTES || new TextEncoder().encode(source).length > MAX_PLAYLIST_FILE_BYTES) return null;
  try {
    const file = JSON.parse(source.replace(/^\uFEFF/, ''));
    if (file?.format === FORMAT && file.version === 2) return decodeLocalPlaylist(file.playlist);
    if (!file || file.format !== FORMAT || file.version !== 1 || !Array.isArray(file.parts)
      || !file.parts.length || file.parts.length > MAX_FILE_CLIPS / CLIPS_PER_PART) return null;
    let result: SharedPlaylist | null = null;
    for (const payload of file.parts) {
      if (typeof payload !== 'string') return null;
      const part = decodeSharedPlaylist(payload);
      if (!part) return null;
      if (!result) result = { ...part, clips: [] };
      if (result.title !== part.title || result.subtitle !== part.subtitle || result.expiresAt !== part.expiresAt) return null;
      result.clips.push(...part.clips);
      if (result.clips.length > MAX_FILE_CLIPS) return null;
    }
    return result;
  } catch {
    return null;
  }
}

function decodeLocalPlaylist(value: unknown): LocalPlaylist | null {
  if (!value || typeof value !== 'object') return null;
  const playlist = value as LocalPlaylist;
  if (playlist.source?.kind !== 'file' || typeof playlist.title !== 'string' || typeof playlist.subtitle !== 'string'
    || (playlist.expiresAt !== undefined && !Number.isFinite(playlist.expiresAt))
    || !Array.isArray(playlist.clips) || !playlist.clips.length || playlist.clips.length > MAX_FILE_CLIPS) return null;
  const finiteTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  let labelCount = 0;
  const clips: LocalPlaylistClip[] = [];
  for (const clip of playlist.clips) {
    if (!clip || !finiteTime(clip.startSeconds) || !finiteTime(clip.endSeconds) || clip.endSeconds <= clip.startSeconds
      || typeof clip.caption !== 'string' || !Array.isArray(clip.labels)) return null;
    labelCount += clip.labels.length;
    if (labelCount > 100_000) return null;
    const labels = [];
    for (const label of clip.labels) {
      if (!label || !finiteTime(label.startSeconds) || !finiteTime(label.endSeconds) || label.endSeconds <= label.startSeconds
        || typeof label.text !== 'string' || (label.description !== undefined && typeof label.description !== 'string')) return null;
      labels.push({ startSeconds: label.startSeconds, endSeconds: label.endSeconds, text: label.text.slice(0, 200),
        ...(label.description ? { description: label.description.slice(0, 200) } : {}) });
    }
    clips.push({ startSeconds: clip.startSeconds, endSeconds: clip.endSeconds, caption: clip.caption.slice(0, 200), labels });
  }
  return { title: playlist.title.slice(0, 200), subtitle: playlist.subtitle.slice(0, 200), source: {
    kind: 'file', ...(typeof playlist.source.fileName === 'string' ? { fileName: fileNameOnly(playlist.source.fileName) } : {}),
  }, clips, ...(playlist.expiresAt !== undefined ? { expiresAt: playlist.expiresAt } : {}) };
}
