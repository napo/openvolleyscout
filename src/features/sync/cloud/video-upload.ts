// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Uploads the chosen match videos to the connected cloud, one at a time, in
 * chunks. An interrupted upload resumes from the bytes the service already
 * has (the session is kept on this device). Uploads only run on computers:
 * phones and tablets can watch the videos from the cloud but never send them.
 */

import { useEffect, useState } from 'react';
import { getSessionVideoFile, loadVideoFileHandle } from '@src/features/analysis/video/file-handle-store';
import { useAppStore } from '@src/app/store/app-store';
import { createDefaultMatchVideoAnalysis } from '@src/domain/video/types';
import { matchRepository } from '@src/infrastructure/repositories';
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
  const sessionFile = getSessionVideoFile(video.matchId, video.fileName);
  if (sessionFile) {
    return async (offset, length) => new Uint8Array(await sessionFile.slice(offset, offset + length).arrayBuffer());
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

  // The service already has every byte (the last answer was lost): find the file.
  const finishIfComplete = async (): Promise<CloudVideoFile | null> => {
    if (offset < size) return null;
    const files = await storage.listVideos();
    const file = files.find((entry) => entry.matchId === video.matchId && entry.size === size)
      ?? files.find((entry) => entry.matchId === video.matchId);
    if (!file) return null;
    writeSession(video.matchId, null);
    onProgress(size);
    return file;
  };

  let failures = 0;
  while (!shouldStop()) {
    const complete = await finishIfComplete();
    if (complete) return complete;
    if (offset >= size) {
      // Every byte sent but no file: the session is unusable, start again next time.
      writeSession(video.matchId, null);
      throw new Error('upload: no file after the last byte');
    }
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
      if (failures > RETRIES) {
        // A session that keeps failing (expired, unknown) must not be resumed again.
        writeSession(video.matchId, null);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * failures));
      const confirmed = await storage.videoUploadOffset(session, size, offset).catch(() => offset);
      if (confirmed === null) throw error;
      offset = confirmed;
    }
  }
  return null;
}

/** Notes in the match that its video is now in the cloud, so every device shows it. */
export async function recordCloudCopy(matchId: string, provider: string, file: CloudVideoFile): Promise<void> {
  const store = useAppStore.getState();
  const open = store.activeProject?.metadata.id === matchId ? store.activeProject : null;
  const project = open ?? await matchRepository.getById(matchId);
  if (!project) return;
  const videoAnalysis = project.videoAnalysis ?? createDefaultMatchVideoAnalysis();
  const saved = await matchRepository.update({
    ...project,
    videoAnalysis: {
      ...videoAnalysis,
      cloudCopy: { provider, name: file.name, size: file.size, uploadedAt: new Date().toISOString() },
      updatedAt: Date.now(),
    },
    updatedAt: Date.now(),
  });
  if (useAppStore.getState().activeProject?.metadata.id === matchId) useAppStore.getState().setActiveProject(saved);
}

/** The video of a match is no longer in the cloud (removed, or replaced by another file). */
export async function clearCloudCopy(matchId: string): Promise<void> {
  const store = useAppStore.getState();
  const open = store.activeProject?.metadata.id === matchId ? store.activeProject : null;
  const project = open ?? await matchRepository.getById(matchId);
  if (!project?.videoAnalysis?.cloudCopy) return;
  const { cloudCopy: _removed, ...videoAnalysis } = project.videoAnalysis;
  const saved = await matchRepository.update({
    ...project,
    videoAnalysis: { ...videoAnalysis, updatedAt: Date.now() },
    updatedAt: Date.now(),
  });
  if (useAppStore.getState().activeProject?.metadata.id === matchId) useAppStore.getState().setActiveProject(saved);
}

/**
 * The match now points to another local file. If its size differs from the
 * video in the cloud, it is a different video: the cloud copy would play with
 * the new sync points, so it is removed and the match no longer says "in the
 * cloud". Same size (a moved or renamed copy, or the downloaded copy): kept.
 */
export async function checkReplacedVideo(matchId: string, newSize?: number | null, newPath?: string): Promise<void> {
  try {
    let size = newSize ?? null;
    if (size === null && newPath && isTauriRuntime() && syncPlatform() === 'desktop') {
      const { invoke } = await import('@tauri-apps/api/core');
      size = await invoke<number | null>('video_file_size', { path: newPath }).catch(() => null);
    }
    if (size === null) return;
    const store = useAppStore.getState();
    const project = store.activeProject?.metadata.id === matchId ? store.activeProject : await matchRepository.getById(matchId);
    const cloudCopy = project?.videoAnalysis?.cloudCopy;
    if (!cloudCopy || cloudCopy.size === size) return;
    await deleteCloudVideoOfMatch(matchId);
    await clearCloudCopy(matchId);
  } catch (error) {
    console.warn('Could not check the replaced video against the cloud copy', error);
  }
}

class VideoUploadQueue {
  private states = new Map<string, VideoUploadState>();
  private readonly listeners = new Set<Listener>();
  private queue: VideoUploadJob[] = [];
  private running = false;
  /** Bumped by Stop: a job started before it stops after its chunk. */
  private generation = 0;

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

  private emit() {
    for (const listener of this.listeners) listener(this.states);
  }

  private set(matchId: string, state: VideoUploadState) {
    this.states = new Map(this.states).set(matchId, state);
    this.emit();
  }

  private remove(matchIds: readonly string[]) {
    const next = new Map(this.states);
    for (const matchId of matchIds) next.delete(matchId);
    this.states = next;
    this.emit();
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
    this.generation += 1;
    const dropped = this.queue.map((job) => job.video.matchId);
    this.queue = [];
    this.remove(dropped);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        const generation = this.generation;
        const storage = await cloudSyncController.videoStorage();
        if (!storage) {
          this.set(job.video.matchId, { status: 'error', sent: 0, size: job.size });
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
            () => this.generation !== generation,
          );
          if (file) {
            await recordCloudCopy(job.video.matchId, provider, file).catch((error) => console.warn('Could not mark the video as uploaded', error));
            this.set(job.video.matchId, { status: 'done', sent: job.size, size: job.size });
          } else {
            this.remove([job.video.matchId]);
          }
        } catch (error) {
          console.warn('Could not upload the video', error);
          this.set(job.video.matchId, { status: 'error', sent: 0, size: job.size });
        }
      }
    } finally {
      this.running = false;
      this.emit();
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

/** Removes the cloud copy of a deleted match's video and any unfinished upload. */
export async function deleteCloudVideoOfMatch(matchId: string): Promise<void> {
  writeSession(matchId, null);
  const storage = await cloudSyncController.videoStorage();
  if (!storage) return;
  const files = (await storage.listVideos()).filter((file) => file.matchId === matchId);
  for (const file of files) await storage.trashVideo(file);
}
