// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { confirmAction } from '@src/components/confirm-dialog';
import { getFilePath, getVideoSourceKey, type MatchVideoAnalysis } from '@src/domain/video/types';
import { useTranslation } from '@src/i18n';
import { cloudSyncController } from '@src/features/sync/cloud/archive-adapter';
import { downloadCloudVideo } from '@src/features/sync/cloud/video-download';
import { formatBytes } from '@src/features/sync/cloud/video-sync';
import { checkReplacedVideo, findCloudVideo } from '@src/features/sync/cloud/video-upload';
import { pickFilePath, VIDEO_FILE_DIALOG_FILTERS } from '../../../lib/utils/pick-file';
import { deleteVideoFileHandle, rememberSessionVideoFile } from './file-handle-store';
import type { RemoteVideoUrlError } from './remote-video-url';
import { isVideoResourceMissing, resolveLocalVideoUrl, type VideoPlayerHandle } from './VideoPlayerView';
import {
  fileNameOfPath,
  localVideoSourcePatch,
  MAX_CLOUD_STREAM_RENEWALS,
  pickBrowserVideoFile,
  rememberVideoFileHandle,
  remoteVideoSourcePatch,
  reopenStoredVideoFile,
  restoreLocalVideoFile,
} from './video-source-lifecycle';

/** Where the copy of the match video in the user's cloud stands for this device. */
export type CloudCopyState = 'none' | 'available' | 'download-only' | 'opening' | 'streaming' | 'failed';

export interface UseVideoSourceInput {
  /** The match whose video is on screen; null when none is (several-matches view without a pick). */
  projectId: string | null;
  videoAnalysis: MatchVideoAnalysis;
  /** Saves a change to the video analysis of that match. */
  persist: (patch: Partial<MatchVideoAnalysis>) => Promise<unknown> | void;
  playerRef: RefObject<VideoPlayerHandle | null>;
  /** The source was replaced by the same video in another form: its sync points were kept. */
  onSyncKept?: () => void;
  /** The player became playable, or stopped being so (after any cloud link renewal). */
  onPlayable?: (playable: boolean) => void;
}

/**
 * The video source of one match on this device: the playable address of its local file (found
 * again from this session or from a remembered handle), the copy in the user's cloud (streamed
 * when the file is not here, its link renewed when it expires, or downloaded), and the gestures
 * that change the source. Shared by the single-match and the several-matches video analysis.
 */
export function useVideoSource({ projectId, videoAnalysis, persist, playerRef, onSyncKept, onPlayable }: UseVideoSourceInput) {
  const { t, locale } = useTranslation();
  const source = videoAnalysis.source;
  const sourceKey = getVideoSourceKey(source);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [isPlayable, setIsPlayable] = useState(false);
  const isPlayableRef = useRef(false);
  const [videoError, setVideoError] = useState(false);
  const [youtubeErrorCode, setYoutubeErrorCode] = useState<number | null>(null);
  const [storedHandle, setStoredHandle] = useState<FileSystemFileHandle | null>(null);
  const [cloudCopy, setCloudCopy] = useState<CloudCopyState>('none');
  const [cloudDownload, setCloudDownload] = useState<{ received: number; size: number } | null>(null);
  const [cloudDownloadMessage, setCloudDownloadMessage] = useState<'browser' | 'failed' | null>(null);
  const streamingFromCloudRef = useRef(false);
  const cloudRenewalsRef = useRef(0);
  const cloudAutoTriedRef = useRef<string | null>(null);
  const renewCloudStreamRef = useRef<() => void>(() => undefined);
  const keepSyncOnNextFileRef = useRef(false);

  // Latest values for the callbacks that must stay stable.
  const latest = useRef({ projectId, videoAnalysis, persist, onSyncKept, onPlayable });
  latest.current = { projectId, videoAnalysis, persist, onSyncKept, onPlayable };

  const markPlayable = (playable: boolean) => {
    isPlayableRef.current = playable;
    setIsPlayable(playable);
    setVideoError(false);
  };

  // Another video (or another match): whatever was known about playing the previous one is void.
  const videoKey = `${projectId ?? ''}|${sourceKey}`;
  const prevVideoKeyRef = useRef(videoKey);
  if (prevVideoKeyRef.current !== videoKey) {
    prevVideoKeyRef.current = videoKey;
    isPlayableRef.current = false;
    setIsPlayable(false);
    setVideoError(false);
  }

  // Another match: its video is not the address held for the previous one.
  const prevProjectIdRef = useRef(projectId);
  if (prevProjectIdRef.current !== projectId) {
    prevProjectIdRef.current = projectId;
    setFileObjectUrl(null);
    setStoredHandle(null);
    // Coming back to a match streamed from the cloud opens its stream again.
    cloudAutoTriedRef.current = null;
  }

  // A local address made here is released when it is replaced and when the panel closes.
  useEffect(() => () => {
    if (fileObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(fileObjectUrl);
  }, [fileObjectUrl]);

  const handlePlayable = useCallback((playable: boolean, errorCode?: number) => {
    // A cloud link expires (about an hour on Drive and OneDrive): ask for a fresh one and carry on.
    if (!playable && streamingFromCloudRef.current && cloudRenewalsRef.current < MAX_CLOUD_STREAM_RENEWALS) {
      cloudRenewalsRef.current += 1;
      renewCloudStreamRef.current();
      return;
    }
    if (playable && streamingFromCloudRef.current) cloudRenewalsRef.current = 0;
    isPlayableRef.current = playable;
    setIsPlayable(playable);
    setVideoError(!playable);
    setYoutubeErrorCode(playable ? null : errorCode ?? null);
    latest.current.onPlayable?.(playable);
  }, []);

  /** Saves a new source, then drops a cloud copy that no longer is the same video. */
  const saveSource = (patch: Partial<MatchVideoAnalysis>, replaced?: { size?: number | null; path?: string }) => {
    const { projectId: id, persist: save } = latest.current;
    if (!id) return;
    void Promise.resolve(save(patch)).then(() => (replaced ? checkReplacedVideo(id, replaced.size ?? null, replaced.path) : undefined));
  };

  const takeKeepSync = () => {
    const keepSync = keepSyncOnNextFileRef.current;
    keepSyncOnNextFileRef.current = false;
    return keepSync;
  };

  /** A file chosen in the browser becomes the match video. */
  const handleFileSelected = (file: File | null) => {
    const id = latest.current.projectId;
    if (!file || !id) return;
    rememberSessionVideoFile(id, file);
    streamingFromCloudRef.current = false;
    setFileObjectUrl(URL.createObjectURL(file));
    markPlayable(true);

    const keepSync = takeKeepSync();
    const patch = localVideoSourcePatch(
      latest.current.videoAnalysis,
      { path: getFilePath(file), fileName: file.name },
      { matchByName: true, keepSync, betweenFiles: 'keep-sync' },
    );
    // Re-linking the same video: nothing to save, its sync points stay.
    if (!patch) return;
    saveSource(patch, { size: file.size });
    if (keepSync) latest.current.onSyncKept?.();
  };

  /**
   * Desktop only: a real absolute path from the native dialog, not a File object - sidesteps the
   * browser input / blob address entirely, which never carries a resolvable path under Tauri.
   */
  const handleFilePathSelected = (path: string) => {
    if (!latest.current.projectId) return;
    streamingFromCloudRef.current = false;
    setFileObjectUrl(null);
    markPlayable(true);

    const keepSync = takeKeepSync();
    const patch = localVideoSourcePatch(latest.current.videoAnalysis, { path }, { keepSync, betweenFiles: 'keep-sync' });
    if (!patch) return;
    saveSource(patch, { path });
    if (keepSync) latest.current.onSyncKept?.();
  };

  /** keepSync: the file replaces another source of the same match video (e.g. its YouTube upload). */
  const openVideoFilePicker = async (keepSync = false) => {
    const id = latest.current.projectId;
    if (!id) return;
    keepSyncOnNextFileRef.current = keepSync;
    if (isTauri()) {
      const path = await pickFilePath(VIDEO_FILE_DIALOG_FILTERS);
      if (!path) return; // user cancelled
      handleFilePathSelected(path);
      return;
    }
    const picked = await pickBrowserVideoFile();
    if (picked === 'unsupported') {
      fileInputRef.current?.click();
      return;
    }
    if (!picked) return; // picker dismissed
    rememberVideoFileHandle(id, picked.handle);
    setStoredHandle(null);
    handleFileSelected(picked.file);
  };

  /** One click on the banner: the browser asks again for the file remembered from a previous session. */
  const reopenStoredVideo = async () => {
    const id = latest.current.projectId;
    if (!storedHandle || !id) return;
    const file = await reopenStoredVideoFile(id, storedHandle);
    if (file === 'denied') return;
    setStoredHandle(null);
    // null: the file moved or was deleted, the manual re-link stays.
    if (file) handleFileSelected(file);
  };

  // A local file missing here may be in the user's cloud, sent from another device.
  useEffect(() => {
    setCloudCopy('none');
    streamingFromCloudRef.current = false;
    cloudRenewalsRef.current = 0;
    setCloudDownload(null);
    setCloudDownloadMessage(null);
    if (!projectId || source?.kind !== 'file' || cloudSyncController.status.state === 'off') return undefined;
    let cancelled = false;
    void findCloudVideo(projectId)
      .then((found) => {
        if (cancelled || !found) return;
        setCloudCopy(found.storage.canStream ? 'available' : 'download-only');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, projectId]);

  /** Streams the cloud copy; `resumeAt` keeps the position when a link is renewed. */
  const openCloudCopy = async (resumeAt?: number | null) => {
    const id = latest.current.projectId;
    if (!id) return;
    setCloudCopy('opening');
    try {
      const found = await findCloudVideo(id);
      if (!found) throw new Error('no cloud video');
      const url = await found.storage.videoStreamUrl(found.file);
      if (latest.current.projectId !== id) return; // another match was opened meanwhile
      streamingFromCloudRef.current = true;
      setFileObjectUrl(url);
      markPlayable(true);
      setCloudCopy('streaming');
      if (typeof resumeAt === 'number') {
        window.setTimeout(() => playerRef.current?.seekTo(resumeAt, true), 800);
      }
    } catch {
      streamingFromCloudRef.current = false;
      setCloudCopy('failed');
    }
  };
  renewCloudStreamRef.current = () => {
    void openCloudCopy(playerRef.current?.getCurrentTime() ?? null);
  };

  const downloadCloudCopy = async () => {
    const id = latest.current.projectId;
    if (!id) return;
    setCloudDownloadMessage(null);
    try {
      const found = await findCloudVideo(id);
      if (!found) throw new Error('no cloud video');
      const size = found.file.size;
      if (!(await confirmAction(t('videoDownloadFromCloudConfirm', { size: formatBytes(size, locale) })))) return;
      const current = latest.current.videoAnalysis.source;
      const fileName = (current?.kind === 'file' && current.fileName) || found.file.name.replace(/^[^_]*__/, '');
      const request = await found.storage.videoDownloadRequest(found.file);
      setCloudDownload({ received: 0, size });
      const result = await downloadCloudVideo(request, fileName, (received) => setCloudDownload({ received, size }));
      setCloudDownload(null);
      if (result.kind === 'path') {
        setCloudCopy('available');
        handleFilePathSelected(result.path);
      } else if (result.kind === 'handle') {
        setCloudCopy('available');
        rememberVideoFileHandle(id, result.handle);
        handleFileSelected(await result.handle.getFile());
      } else if (result.kind === 'browser') {
        setCloudDownloadMessage('browser');
      }
    } catch {
      setCloudDownload(null);
      setCloudDownloadMessage('failed');
    }
  };

  // When the stored path is not directly resolvable (plain browser), look for the file on this
  // device: the one chosen earlier in this session, then the handle remembered from a previous
  // one - reopened silently if the browser still trusts it, else offered as a one-click button.
  useEffect(() => {
    if (!projectId || source?.kind !== 'file' || resolveLocalVideoUrl(source.path, null)) {
      setStoredHandle(null);
      return undefined;
    }
    let cancelled = false;
    void restoreLocalVideoFile(projectId, source.fileName).then((restored) => {
      if (cancelled || !restored) return;
      if (restored.kind === 'needs-permission') {
        setStoredHandle(restored.handle);
        return;
      }
      setFileObjectUrl(URL.createObjectURL(restored.file));
      markPlayable(true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, projectId]);

  const showMissingResource = isVideoResourceMissing(source, fileObjectUrl, videoError);

  // The local file is not here but the cloud has the video: stream it at once (once per video).
  useEffect(() => {
    if (!showMissingResource || cloudCopy !== 'available' || cloudAutoTriedRef.current === videoKey) return;
    cloudAutoTriedRef.current = videoKey;
    void openCloudCopy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMissingResource, cloudCopy, videoKey]);

  /** A path typed by hand: the same path keeps its sync points, another one is another video. */
  const loadFromPath = (rawPath: string): boolean => {
    const path = rawPath.trim();
    if (!path || !latest.current.projectId) return false;
    const patch = localVideoSourcePatch(latest.current.videoAnalysis, { path, fileName: fileNameOfPath(path) }, { betweenFiles: 'reset' });
    if (patch) saveSource(patch, { path });
    return true;
  };

  /**
   * A YouTube or direct video link becomes the match video; the reason is returned when the link
   * cannot be used. keepSync: the link replaces a local file of the same match video.
   */
  const loadRemote = (rawUrl: string, keepSync = false): RemoteVideoUrlError | null => {
    if (!latest.current.projectId) return null;
    const result = remoteVideoSourcePatch(latest.current.videoAnalysis, rawUrl, { keepSync });
    if (!result.ok) return result.reason;
    saveSource(result.patch);
    if (keepSync) latest.current.onSyncKept?.();
    return null;
  };

  const removeSource = async () => {
    const id = latest.current.projectId;
    if (!id || !(await confirmAction(t('videoRemoveSourceConfirm')))) return;
    streamingFromCloudRef.current = false;
    setFileObjectUrl(null);
    isPlayableRef.current = false;
    setIsPlayable(false);
    setStoredHandle(null);
    void deleteVideoFileHandle(id).catch(() => undefined);
    saveSource({ source: undefined, syncPoints: [], lastPlaybackPositionSeconds: undefined, lastPlaybackAtIso: undefined });
  };

  return {
    source,
    sourceKey,
    fileInputRef,
    fileObjectUrl,
    isPlayable,
    isPlayableRef,
    videoError,
    youtubeErrorCode,
    storedHandle,
    cloudCopy,
    cloudDownload,
    cloudDownloadMessage,
    showMissingResource,
    handlePlayable,
    handleFileSelected,
    handleFilePathSelected,
    openVideoFilePicker,
    reopenStoredVideo,
    openCloudCopy,
    downloadCloudCopy,
    loadFromPath,
    loadRemote,
    removeSource,
  };
}

export type VideoSourceController = ReturnType<typeof useVideoSource>;
