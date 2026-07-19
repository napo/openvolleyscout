import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import type { MatchVideoSource } from '@src/domain/video/types';
import { loadYouTubeIframeApi, type YouTubePlayerLike } from './youtube';

export interface VideoPlayerHandle {
  seekTo(seconds: number, autoplay: boolean): void;
  getCurrentTime(): number | null;
  play(): void;
  pause(): void;
  setPlaybackRate(rate: number): void;
}

interface VideoPlayerViewProps {
  source: MatchVideoSource;
  /** Object URL of a re-linked local file (browser picker). */
  fileObjectUrl?: string | null;
  /** Live camera stream for a webcam source: shown in live-monitor mode, or while actively recording. */
  mediaStream?: MediaStream | null;
  /** Show the native <video> transport controls. Defaults to true; set false when a caller renders its own transport bar. */
  controls?: boolean;
  onPlayable?: (playable: boolean) => void;
}

/** Resolve a playable URL for a local-file source, or null when unavailable. */
export function resolveLocalVideoUrl(path: string, fileObjectUrl?: string | null): string | null {
  if (fileObjectUrl) return fileObjectUrl;
  if (path && isTauri()) {
    try {
      return convertFileSrc(path);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * True when a video source has no playable resource behind it right now: a
 * moved/missing local file, a webcam without a finished recording, a
 * live-monitor webcam (never has a replayable resource, only "now"), or an
 * RTSP source (always live-only, never recorded). Drives the "missing
 * resource" banner shared by the single- and multi-video analysis panels.
 */
export function isVideoResourceMissing(
  source: MatchVideoSource | undefined,
  fileObjectUrl: string | null | undefined,
  videoError: boolean,
): boolean {
  if (source?.kind === 'file') {
    return !resolveLocalVideoUrl(source.path, fileObjectUrl) || videoError;
  }
  if (source?.kind === 'webcam') {
    const recordedResolvable = source.mode === 'recorded'
      && Boolean(source.recordingPath && resolveLocalVideoUrl(source.recordingPath, fileObjectUrl));
    return source.mode === 'live-monitor' || !recordedResolvable || videoError;
  }
  return source?.kind === 'rtsp';
}

export const VideoPlayerView = forwardRef<VideoPlayerHandle, VideoPlayerViewProps>(
  function VideoPlayerView({ source, fileObjectUrl, mediaStream, controls = true, onPlayable }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
    const youtubePlayerRef = useRef<YouTubePlayerLike | null>(null);
    const [youtubeReady, setYoutubeReady] = useState(false);
    const [assetUrlFailed, setAssetUrlFailed] = useState(false);
    const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
    const onPlayableRef = useRef(onPlayable);
    onPlayableRef.current = onPlayable;

    const isLiveStream = (source.kind === 'webcam' || source.kind === 'rtsp') && Boolean(mediaStream);
    // Live-monitor/RTSP have no seekable position, only "now" — never feed a game clock.
    const suppressPosition = (source.kind === 'webcam' && source.mode === 'live-monitor') || source.kind === 'rtsp';
    const rawFilePath = source.kind === 'file'
      ? source.path
      : source.kind === 'webcam' && !isLiveStream && source.recordingPath
        ? source.recordingPath
        : null;
    const assetUrl = rawFilePath ? resolveLocalVideoUrl(rawFilePath, fileObjectUrl) : null;
    const fileUrl = assetUrlFailed ? fallbackBlobUrl : assetUrl;
    const youtubeVideoId = source.kind === 'youtube' ? source.videoId : null;

    useEffect(() => {
      setAssetUrlFailed(false);
      setFallbackBlobUrl(null);
    }, [rawFilePath]);

    // Slow-path fallback, only engaged once the fast asset:// URL has
    // actually failed to load — confirmed on WebKitGTK/Linux: the request
    // that reaches Tauri's own asset-protocol scope check ends up with just
    // the bare filename, never the full path (traced into Tauri's source;
    // exact point where WebKitGTK/GStreamer drops the directory not pinned
    // down further). Reading the whole file via plugin-fs and handing the
    // <video> a blob: URL always works, but is much slower for large files
    // (no streaming/range-request support, unlike asset://) — so it's a
    // fallback, not the default.
    useEffect(() => {
      if (!assetUrlFailed || !rawFilePath || fileObjectUrl || !isTauri()) return undefined;

      let cancelled = false;
      let objectUrl: string | null = null;

      void (async () => {
        try {
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const bytes = await readFile(rawFilePath);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart]));
          setFallbackBlobUrl(objectUrl);
        } catch {
          // Leave fallbackBlobUrl null — the <video> onError handler below
          // already reports failure once there's nothing left to try.
        }
      })();

      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [assetUrlFailed, rawFilePath, fileObjectUrl]);

    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream ?? null;
      }
    }, [mediaStream]);

    useEffect(() => {
      if (!youtubeVideoId || !youtubeContainerRef.current) {
        return undefined;
      }

      let cancelled = false;
      const container = youtubeContainerRef.current;
      const mount = document.createElement('div');
      container.appendChild(mount);
      setYoutubeReady(false);

      void loadYouTubeIframeApi().then((yt) => {
        if (cancelled) return;
        youtubePlayerRef.current = new yt.Player(mount, {
          videoId: youtubeVideoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, playsinline: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              setYoutubeReady(true);
              onPlayableRef.current?.(true);
            },
            onError: () => {
              if (cancelled) return;
              onPlayableRef.current?.(false);
            },
          },
        });
      }).catch(() => {
        if (!cancelled) onPlayableRef.current?.(false);
      });

      return () => {
        cancelled = true;
        youtubePlayerRef.current?.destroy();
        youtubePlayerRef.current = null;
        setYoutubeReady(false);
        container.replaceChildren();
      };
    }, [youtubeVideoId]);

    useEffect(() => {
      // The slow fallback is in flight (asset:// just failed, plugin-fs
      // read not resolved yet) — fileUrl is momentarily null; don't report
      // that as a failure, or the missing-resource banner would flash on
      // during every fallback.
      if (assetUrlFailed && !fallbackBlobUrl) return;
      if (source.kind === 'file') {
        onPlayableRef.current?.(Boolean(fileUrl));
      } else if (source.kind === 'webcam' || source.kind === 'rtsp') {
        onPlayableRef.current?.(Boolean(fileUrl) || isLiveStream);
      }
    }, [source.kind, fileUrl, isLiveStream, assetUrlFailed, fallbackBlobUrl]);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number, autoplay: boolean) {
        if (suppressPosition) return;
        const target = Math.max(0, seconds);
        if (videoRef.current) {
          videoRef.current.currentTime = target;
          if (autoplay) void videoRef.current.play();
          return;
        }
        if (youtubePlayerRef.current && youtubeReady) {
          youtubePlayerRef.current.seekTo(target, true);
          if (autoplay) youtubePlayerRef.current.playVideo();
        }
      },
      getCurrentTime() {
        if (suppressPosition) return null;
        if (videoRef.current) {
          return Number.isFinite(videoRef.current.currentTime) ? videoRef.current.currentTime : null;
        }
        if (youtubePlayerRef.current && youtubeReady) {
          const time = youtubePlayerRef.current.getCurrentTime();
          return Number.isFinite(time) ? time : null;
        }
        return null;
      },
      play() {
        if (suppressPosition) return;
        void videoRef.current?.play();
        if (youtubeReady) youtubePlayerRef.current?.playVideo();
      },
      pause() {
        videoRef.current?.pause();
        if (youtubeReady) youtubePlayerRef.current?.pauseVideo();
      },
      setPlaybackRate(rate: number) {
        if (suppressPosition) return;
        if (videoRef.current) {
          videoRef.current.playbackRate = rate;
        }
        if (youtubeReady) youtubePlayerRef.current?.setPlaybackRate(rate);
      },
    }), [youtubeReady, suppressPosition]);

    if (source.kind === 'youtube') {
      return <div className="video-analysis__player-frame" ref={youtubeContainerRef} />;
    }

    if (!fileUrl && !isLiveStream) {
      return null;
    }

    return (
      <video
        ref={videoRef}
        className="video-analysis__player-frame"
        src={isLiveStream ? undefined : fileUrl ?? undefined}
        autoPlay={isLiveStream}
        muted={isLiveStream}
        controls={!isLiveStream && controls}
        preload="metadata"
        onError={() => {
          // First failure on a Tauri-resolved local path: try the slow
          // plugin-fs fallback before giving up. A failure of the fallback
          // itself (assetUrlFailed already true) falls through to reporting
          // real failure below.
          if (rawFilePath && !fileObjectUrl && isTauri() && !assetUrlFailed) {
            setAssetUrlFailed(true);
            return;
          }
          onPlayableRef.current?.(false);
        }}
      />
    );
  },
);
