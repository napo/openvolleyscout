// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Uploads the chosen match videos to the connected cloud, one at a time, in
 * chunks. An interrupted upload resumes from the bytes the service already
 * has (the session is kept on this device). Uploads only run on computers:
 * phones and tablets can watch the videos from the cloud but never send them.
 */

import { useEffect, useState } from 'react';
import { loadVideoFileHandle } from '@src/features/analysis/video/file-handle-store';
import { cloudSyncController } from './archive-adapter';
import { isTauriRuntime, syncPlatform } from './platform';
import { type CloudVideoFile, VIDEO_CHUNK_BYTES, type VideoStorage } from './storage';
import { isMobileDevice, type LocalVideoMatch } from './video-sync';

const SESSIONS_KEY = 'openvolleyscout.sync.videoUploads';
const RETRIES = 3;

export type VideoUploadStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface VideoUploadState {
  readonly status: VideoUploadStatus;
  readonly sent: number;
  readonly size: number;
}

interface StoredSession {
  readonly provider: string;
  readonly session: string;
  readonly offset: number;
  readonly size: number;
}

/** Reads a part of the local video file. */
export type ChunkReader = (offset: number, length: number) => Promise<Uint8Array>;

function readSessions(): Record<string, StoredSession> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, StoredSession> : {};
  } catch {
    return {};
  }
}

function writeSession(matchId: string, session: StoredSession | null): void {
  try {
    const sessions = readSessions();
    if (session) sessions[matchId] = session;
    else delete sessions[matchId];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // Without storage the upload simply restarts next time.
  }
}

/** True when this device may send videos to the cloud. */
export function canUploadVideos(): boolean {
  return !isMobileDevice();
}

/**
 * A reader for the local file: from the path in the desktop app, from the
 * remembered file in the browser (permission must already be granted), or
 * from a file the user has just chosen. Null when the file cannot be read.
 */
export async function createChunkReader(video: LocalVideoMatch, chosen?: File): Promise<ChunkReader | null> {
  if (chosen) {
    return async (offset, length) => new Uint8Array(await chosen.slice(offset, offset + length).arrayBuffer());
  }
  if (isTauriRuntime() && syncPlatform() === 'desktop') {
    const { invoke } = await import('@tauri-apps/api/core');
    return async (offset, length) => new Uint8Array(
      await invoke<ArrayBuffer>('read_video_chunk', { path: video.path, offset, length }),
    );
  }
  const handle = await loadVideoFileHandle(video.matchId).catch(() => null);
  if (!handle || (await handle.queryPermission?.({ mode: 'read' })) !== 'granted') return null;
  const file = await handle.getFile().catch(() => null);
  if (!file) return null;
  return async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}

export interface VideoUploadJob {
  readonly video: LocalVideoMatch;
  readonly size: number;
  readonly read: ChunkReader;
}

type Listener = (states: ReadonlyMap<string, VideoUploadState>) => void;

/** Sends one video, resuming a kept session; returns the cloud file. */
export async function uploadOneVideo(
  storage: VideoStorage,
  provider: string,
  job: VideoUploadJob,
  onProgress: (sent: number) => void,
  shouldStop: () => boolean = () => false,
): Promise<CloudVideoFile | null> {
  const { video, size, read } = job;
  const kept = readSessions()[video.matchId];
  let session = kept && kept.provider === provider && kept.size === size ? kept.session : null;
  let offset = 0;
  if (session) {
    const confirmed = await storage.videoUploadOffset(session, size, kept!.offset).catch(() => null);
    if (confirmed === null) session = null;
    else offset = confirmed;
  }
  if (!session) {
    session = await storage.startVideoUpload(video.matchId, video.fileName, size);
    offset = 0;
  }
  writeSession(video.matchId, { provider, session, offset, size });
  onProgress(offset);

  let failures = 0;
  while (!shouldStop()) {
    try {
      const bytes = await read(offset, Math.min(VIDEO_CHUNK_BYTES, size - offset));
      const result = await storage.uploadVideoChunk(session, offset, bytes, size);
      failures = 0;
      if (result.done) {
        writeSession(video.matchId, null);
        onProgress(size);
        return result.file;
      }
      offset = result.offset;
      writeSession(video.matchId, { provider, session, offset, size });
      onProgress(offset);
    } catch (error) {
      failures += 1;
      if (failures > RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * failures));
      const confirmed = await storage.videoUploadOffset(session, size, offset).catch(() => offset);
      if (confirmed === null) throw error;
      offset = confirmed;
    }
  }
  return null;
}

class VideoUploadQueue {
  private states = new Map<string, VideoUploadState>();
  private readonly listeners = new Set<Listener>();
  private queue: VideoUploadJob[] = [];
  private running = false;
  private stopRequested = false;

  get current(): ReadonlyMap<string, VideoUploadState> {
    return this.states;
  }

  get isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(matchId: string, state: VideoUploadState) {
    this.states = new Map(this.states).set(matchId, state);
    for (const listener of this.listeners) listener(this.states);
  }

  /** Adds videos to the queue and starts sending them if it is not already. */
  enqueue(jobs: readonly VideoUploadJob[]): void {
    if (!canUploadVideos()) return;
    for (const job of jobs) {
      if (this.queue.some((queued) => queued.video.matchId === job.video.matchId)) continue;
      this.queue.push(job);
      this.set(job.video.matchId, { status: 'queued', sent: 0, size: job.size });
    }
    void this.run();
  }

  /** Stops after the chunk being sent; what was sent is kept for the next start. */
  stop(): void {
    this.stopRequested = true;
    for (const job of this.queue) this.states.delete(job.video.matchId);
    this.queue = [];
    for (const listener of this.listeners) listener(this.states);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    try {
      while (this.queue.length > 0 && !this.stopRequested) {
        const job = this.queue[0];
        const storage = await cloudSyncController.videoStorage();
        if (!storage) {
          this.set(job.video.matchId, { status: 'error', sent: 0, size: job.size });
          this.queue.shift();
          continue;
        }
        const provider = cloudSyncController.status.provider;
        this.set(job.video.matchId, { status: 'uploading', sent: 0, size: job.size });
        try {
          const file = await uploadOneVideo(
            storage,
            provider,
            job,
            (sent) => this.set(job.video.matchId, { status: 'uploading', sent, size: job.size }),
            () => this.stopRequested,
          );
          if (file) this.set(job.video.matchId, { status: 'done', sent: job.size, size: job.size });
          else this.states.delete(job.video.matchId);
        } catch (error) {
          console.warn('Could not upload the video', error);
          this.set(job.video.matchId, { status: 'error', sent: 0, size: job.size });
        }
        this.queue.shift();
      }
    } finally {
      this.running = false;
      for (const listener of this.listeners) listener(this.states);
    }
  }
}

export const videoUploadQueue = new VideoUploadQueue();

export function useVideoUploads(): ReadonlyMap<string, VideoUploadState> {
  const [states, setStates] = useState(() => videoUploadQueue.current);
  useEffect(() => videoUploadQueue.subscribe((next) => setStates(next)), []);
  return states;
}

/** The video of a match in the connected cloud, if any (largest copy when there are several). */
export async function findCloudVideo(matchId: string): Promise<{ storage: VideoStorage; file: CloudVideoFile } | null> {
  const storage = await cloudSyncController.videoStorage();
  if (!storage) return null;
  const files = (await storage.listVideos()).filter((file) => file.matchId === matchId);
  if (files.length === 0) return null;
  const file = files.reduce((best, next) => (next.size > best.size ? next : best));
  return { storage, file };
}
