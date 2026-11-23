// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Videos and cloud sync, per device: whether this device includes the match
 * videos, which matches it includes, and how much space their local files
 * take. Video files can be several GB each, so the choice is made on each
 * device (off on phones and tablets) and never travels with the archive.
 */

import type { MatchVideoSource } from '@src/domain/video/types';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { getSessionVideoFile, loadVideoFileHandle } from '@src/features/analysis/video/file-handle-store';
import { isTauriRuntime, syncPlatform, type SyncPlatform } from './platform';

const ENABLED_KEY = 'openvolleyscout.sync.videos';
const SELECTED_KEY = 'openvolleyscout.sync.videoMatchIds';

/** True on phones and tablets, installed app or browser. */
export function isMobileDevice(platform: SyncPlatform = syncPlatform(), ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  if (platform === 'android' || platform === 'ios') return true;
  if (platform === 'desktop') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/** Default: on for computers, off for phones and tablets. */
export function defaultVideoSync(mobile = isMobileDevice()): boolean {
  return !mobile;
}

export function readVideoSyncEnabled(): boolean {
  try {
    const value = localStorage.getItem(ENABLED_KEY);
    if (value === 'on') return true;
    if (value === 'off') return false;
  } catch {
    // Use the default.
  }
  return defaultVideoSync();
}

export function writeVideoSyncEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? 'on' : 'off');
  } catch {
    // Ignore storage errors.
  }
}

/** Matches whose video this device includes; null when the user has not chosen yet (all of them). */
export function readSelectedVideoMatchIds(): string[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? 'null') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

export function writeSelectedVideoMatchIds(ids: readonly string[]): void {
  try {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage errors.
  }
}

export interface LocalVideoMatch {
  readonly matchId: string;
  readonly label: string;
  readonly playedAt: string;
  readonly fileName: string;
  readonly path: string;
}

/** Matches with a local video file linked (YouTube and other links are already online). */
export async function listLocalVideoMatches(): Promise<LocalVideoMatch[]> {
  const result: LocalVideoMatch[] = [];
  await matchProjectDb.matchProjects.each((project) => {
    const source = project.videoAnalysis?.source as MatchVideoSource | undefined;
    if (source?.kind !== 'file' || !source.path) return;
    const home = project.homeSelection?.teamName || project.homeTeam?.name || '';
    const away = project.awaySelection?.teamName || project.awayTeam?.name || '';
    result.push({
      matchId: project.metadata.id,
      label: home && away ? `${home} - ${away}` : project.metadata.title || project.metadata.id,
      playedAt: project.metadata.playedAt ?? '',
      fileName: source.fileName || source.path.split(/[\\/]/).pop() || source.path,
      path: source.path,
    });
  });
  return result.sort((left, right) => right.playedAt.localeCompare(left.playedAt));
}

/**
 * Size of the video file: 'missing' when the file is no longer there, null
 * when this device cannot read it without the user (browser without a
 * remembered file, or a permission still to confirm when `ask` is false).
 */
export async function measureVideoFile(video: LocalVideoMatch, ask = false): Promise<number | 'missing' | null> {
  if (isTauriRuntime() && syncPlatform() === 'desktop') {
    const { invoke } = await import('@tauri-apps/api/core');
    const size = await invoke<number | null>('video_file_size', { path: video.path }).catch(() => null);
    return typeof size === 'number' ? size : 'missing';
  }
  const sessionFile = getSessionVideoFile(video.matchId, video.fileName);
  if (sessionFile) return sessionFile.size;
  const handle = await loadVideoFileHandle(video.matchId).catch(() => null);
  if (!handle) return null;
  let permission = await handle.queryPermission?.({ mode: 'read' }) ?? 'prompt';
  if (permission !== 'granted' && ask) {
    permission = await handle.requestPermission?.({ mode: 'read' }) ?? 'denied';
  }
  if (permission !== 'granted') return null;
  try {
    return (await handle.getFile()).size;
  } catch {
    return 'missing';
  }
}

export interface VideoSpaceEstimate {
  /** Bytes of the selected videos whose size is known. */
  readonly needed: number;
  readonly known: number;
  /** Selected videos whose size is not known (not counted in `needed`). */
  readonly unknown: number;
  /** Free bytes in the cloud, null when the service does not tell. */
  readonly free: number | null;
  /** Bytes missing in the cloud, 0 when the space is enough, null when not known. */
  readonly missing: number | null;
}

export function estimateVideoSpace(
  sizes: ReadonlyArray<number | 'missing' | null | undefined>,
  cloud: { used: number; total: number | null } | null,
): VideoSpaceEstimate {
  let needed = 0;
  let known = 0;
  let unknown = 0;
  for (const size of sizes) {
    if (typeof size === 'number') {
      needed += size;
      known += 1;
    } else if (size !== 'missing') {
      unknown += 1;
    }
  }
  const free = cloud && cloud.total !== null ? Math.max(0, cloud.total - cloud.used) : null;
  return { needed, known, unknown, free, missing: free === null ? null : Math.max(0, needed - free) };
}

/** "3.2 GB" style size in the user's language. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`;
}
