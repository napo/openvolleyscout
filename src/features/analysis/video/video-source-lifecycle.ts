// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The life of a match video source, in one place: what choosing a file, typing a path or pasting a
// link does to the saved source and to its sync points, and how a local file is found again on
// this device. Video analysis (one match and several matches) and the live scouting video panel
// all read these rules, so the same gesture means the same thing everywhere.

import type { MatchVideoAnalysis, MatchVideoSource } from '@src/domain/video/types';
import { findCloudVideo } from '@src/features/sync/cloud/video-upload';
import {
  deleteVideoFileHandle,
  getSessionVideoFile,
  loadVideoFileHandle,
  saveVideoFileHandle,
  supportsFileSystemAccess,
} from './file-handle-store';
import { resolveRemoteVideoSource, type RemoteVideoUrlError } from './remote-video-url';

/** The video formats offered by the browser file picker. */
export const VIDEO_PICKER_TYPES = [{
  description: 'Video',
  accept: { 'video/*': ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v', '.ogv'] },
}];

export function fileNameOfPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** The fields that describe where playback stopped: they belong to one video, not to the next. */
const FRESH_VIDEO: Pick<MatchVideoAnalysis, 'syncPoints' | 'lastPlaybackPositionSeconds' | 'lastPlaybackAtIso'> = {
  syncPoints: [],
  lastPlaybackPositionSeconds: undefined,
  lastPlaybackAtIso: undefined,
};

export interface LocalVideoChoice {
  path: string;
  fileName?: string;
}

export interface LocalVideoOptions {
  /**
   * The file is recognised as the one already linked also by its name alone (a File picked in the
   * browser has no real path). A typed or native path is compared by path only.
   */
  matchByName?: boolean;
  /** The file is the same match video in another form (e.g. the local copy of its YouTube upload). */
  keepSync?: boolean;
  /**
   * What replacing a local file with another local file does to the sync points. The analysis
   * panels keep them (the same recording moved, renamed or re-encoded); a new video chosen while
   * scouting, or a typed path, starts from scratch.
   */
  betweenFiles?: 'keep-sync' | 'reset';
}

/**
 * The change to save when a local file becomes the match video, or null when it is the file
 * already linked (nothing to save: its sync points stay as they are).
 */
export function localVideoSourcePatch(
  videoAnalysis: Pick<MatchVideoAnalysis, 'source' | 'syncPoints'>,
  choice: LocalVideoChoice,
  options: LocalVideoOptions = {},
): Partial<MatchVideoAnalysis> | null {
  const current = videoAnalysis.source;
  const fileName = choice.fileName ?? fileNameOfPath(choice.path);
  if (current?.kind === 'file') {
    const samePath = current.path === choice.path;
    const sameName = options.matchByName === true && current.fileName !== undefined && current.fileName === fileName;
    if (samePath || sameName) return null;
  }
  const source: MatchVideoSource = { kind: 'file', path: choice.path, fileName };
  const keepsSync = options.keepSync === true || (options.betweenFiles === 'keep-sync' && current?.kind === 'file');
  return keepsSync ? { source, syncPoints: videoAnalysis.syncPoints } : { source, ...FRESH_VIDEO };
}

export type RemoteVideoPatch =
  | { ok: true; patch: Partial<MatchVideoAnalysis> }
  | { ok: false; reason: RemoteVideoUrlError };

/**
 * The change to save when a link (YouTube or a direct video address) becomes the match video.
 * The same video loaded again (e.g. a share link with another `?t=`) keeps its sync points.
 */
export function remoteVideoSourcePatch(
  videoAnalysis: Pick<MatchVideoAnalysis, 'source' | 'syncPoints'>,
  rawUrl: string,
  options: { keepSync?: boolean } = {},
): RemoteVideoPatch {
  const resolved = resolveRemoteVideoSource(rawUrl);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const current = videoAnalysis.source;
  const next = resolved.source;
  const sameRemote = (
    (next.kind === 'youtube' && current?.kind === 'youtube' && current.videoId === next.videoId)
    || (next.kind === 'url' && current?.kind === 'url' && current.url === next.url)
  );
  return {
    ok: true,
    patch: options.keepSync === true || sameRemote
      ? { source: next, syncPoints: videoAnalysis.syncPoints }
      : { source: next, ...FRESH_VIDEO },
  };
}

/**
 * Opens the browser file picker for a video. `unsupported` means the browser has no such picker:
 * the caller falls back to a plain file input. null means the picker was dismissed.
 */
export async function pickBrowserVideoFile(): Promise<{ file: File; handle: FileSystemFileHandle } | 'unsupported' | null> {
  if (!supportsFileSystemAccess() || !window.showOpenFilePicker) return 'unsupported';
  try {
    const [handle] = await window.showOpenFilePicker({ multiple: false, types: VIDEO_PICKER_TYPES });
    return { file: await handle.getFile(), handle };
  } catch {
    return null;
  }
}

/** Remembers the handle of a picked file, so a later session reopens it after one permission prompt. */
export function rememberVideoFileHandle(projectId: string, handle: FileSystemFileHandle): void {
  void saveVideoFileHandle(projectId, handle).catch(() => undefined);
}

/**
 * Reopens the file behind a remembered handle after asking the browser for permission. `denied`
 * when the user refuses; null when the file moved or was deleted, and the stale handle is then
 * forgotten so the banner stops offering it.
 */
export async function reopenStoredVideoFile(projectId: string, handle: FileSystemFileHandle): Promise<File | 'denied' | null> {
  const permission = await handle.requestPermission?.({ mode: 'read' }) ?? 'denied';
  if (permission !== 'granted') return 'denied';
  try {
    return await handle.getFile();
  } catch {
    void deleteVideoFileHandle(projectId).catch(() => undefined);
    return null;
  }
}

export type RestoredLocalVideo =
  /** The file itself: chosen earlier in this session, or behind a handle the browser still trusts. */
  | { kind: 'file'; file: File }
  /** A remembered handle that needs one click (a permission prompt) to be read again. */
  | { kind: 'needs-permission'; handle: FileSystemFileHandle }
  | null;

/**
 * Looks for the local video of a match on this device without asking anything: the file chosen
 * earlier in this session, then the handle remembered from a previous one.
 */
export async function restoreLocalVideoFile(projectId: string, fileName?: string): Promise<RestoredLocalVideo> {
  const sessionFile = getSessionVideoFile(projectId, fileName);
  if (sessionFile) return { kind: 'file', file: sessionFile };
  const handle = await loadVideoFileHandle(projectId).catch(() => null);
  if (!handle) return null;
  const permission = await handle.queryPermission?.({ mode: 'read' }) ?? 'prompt';
  if (permission !== 'granted') return { kind: 'needs-permission', handle };
  const file = await handle.getFile().catch(() => null);
  return file ? { kind: 'file', file } : null;
}

/** A fresh streaming address for the copy of the match video in the user's cloud, when it can be streamed. */
export async function cloudVideoStreamUrl(projectId: string): Promise<string | null> {
  const found = await findCloudVideo(projectId);
  if (!found || !found.storage.canStream) return null;
  return found.storage.videoStreamUrl(found.file);
}

/** How many times in a row an expired cloud link is renewed before the video is declared unplayable. */
export const MAX_CLOUD_STREAM_RENEWALS = 3;
