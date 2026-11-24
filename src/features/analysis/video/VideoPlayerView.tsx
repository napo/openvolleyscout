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
import { YouTubeFramePlayer } from './YouTubeFramePlayer';
import { toPlayableVideoUrl } from './google-drive-video';

export interface VideoPlayerHandle {
  seekTo(seconds: number, autoplay: boolean): void;
  getCurrentTime(): number | null;
  /** Length of the loaded video in seconds; null while unknown (or a live stream). */
  getDuration?(): number | null;
  play(): void;
  pause(): void;
  isPaused(): boolean;
  getPlaybackRate?(): number;
  setPlaybackRate(rate: number): void;
  /** True when the picture can be read (local file): frame stepping and frame capture. */
  hasFrameAccess?(): boolean;
  /** The current frame as a JPEG at the video's own resolution; null when unavailable. */
  captureFrame?(): Promise<Blob | null>;
  /** Seconds per frame measured while the video played; null until known. */
  getFrameDuration?(): number | null;
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** A real frame lasts between 1/120 s and 1/10 s. */
const MIN_FRAME_SECONDS = 1 / 120;
const MAX_FRAME_SECONDS = 1 / 10;

/** The frame duration seen most often among consecutive presented frames. */
export function estimateFrameDuration(samples: readonly number[]): number | null {
  const valid = samples.filter((value) => value >= MIN_FRAME_SECONDS && value <= MAX_FRAME_SECONDS);
  if (valid.length < 5) return null;
  const sorted = [...valid].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Play when paused, pause when playing - also in sync with the native controls. */
export function togglePlayerPlayback(player: VideoPlayerHandle | null) {
  if (!player) return;
  if (player.isPaused()) {
    player.play();
  } else {
    player.pause();
  }
}

interface VideoPlayerViewProps {
  source: MatchVideoSource;
  /** Object URL of a re-linked local file (browser picker). */
  fileObjectUrl?: string | null;
  /** Live camera stream for a webcam source: shown in live-monitor mode, or while actively recording. */
  mediaStream?: MediaStream | null;
  /** Show the native <video> transport controls. Defaults to true; set false when a caller renders its own transport bar. */
  controls?: boolean;
  /** `errorCode`: YouTube player error when the video cannot be played (100 private or removed, 101/150 embedding not allowed). */
  onPlayable?: (playable: boolean, errorCode?: number) => void;
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

/**
 * In the desktop/Android app a YouTube player embedded in the app's own page
 * gets no usable Referer (YouTube error 153): YouTube is played through the
 * hosted player page instead.
 */
export const VideoPlayerView = forwardRef<VideoPlayerHandle, VideoPlayerViewProps>(
  function VideoPlayerView(props, ref) {
    if (props.source.kind === 'youtube' && isTauri()) {
      return (
        <YouTubeFramePlayer
          key={props.source.videoId}
          ref={ref}
          videoId={props.source.videoId}
          onPlayable={props.onPlayable}
        />
      );
    }
    return <EmbeddedVideoPlayerView {...props} ref={ref} />;
  },
);

const EmbeddedVideoPlayerView = forwardRef<VideoPlayerHandle, VideoPlayerViewProps>(
  function EmbeddedVideoPlayerView({ source, fileObjectUrl, mediaStream, controls = true, onPlayable }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    // Frame duration, measured from consecutive frames while the video plays.
    const frameSamplesRef = useRef<number[]>([]);
    const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
    const youtubePlayerRef = useRef<YouTubePlayerLike | null>(null);
    const [youtubeReady, setYoutubeReady] = useState(false);
    const [assetUrlFailed, setAssetUrlFailed] = useState(false);
    const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
    const onPlayableRef = useRef(onPlayable);
    onPlayableRef.current = onPlayable;

    const isLiveStream = (source.kind === 'webcam' || source.kind === 'rtsp') && Boolean(mediaStream);
    // Live-monitor/RTSP have no seekable position, only "now" - never feed a game clock.
    const suppressPosition = (source.kind === 'webcam' && source.mode === 'live-monitor') || source.kind === 'rtsp';
    const rawFilePath = source.kind === 'file'
      ? source.path
      : source.kind === 'webcam' && !isLiveStream && source.recordingPath
        ? source.recordingPath
        : null;
    const assetUrl = source.kind === 'url'
      ? toPlayableVideoUrl(source.url)
      : rawFilePath
        ? resolveLocalVideoUrl(rawFilePath, fileObjectUrl)
        : null;
    const fileUrl = assetUrlFailed ? fallbackBlobUrl : assetUrl;
    useEffect(() => {
      const video = videoRef.current as FrameCallbackVideo | null;
      if (!video?.requestVideoFrameCallback) return undefined;
      frameSamplesRef.current = [];
      let last: { mediaTime: number; presentedFrames: number } | null = null;
      let handle = 0;
      let stopped = false;
      const onFrame = (_now: number, metadata: { mediaTime: number; presentedFrames: number }) => {
        if (stopped) return;
        if (last && metadata.presentedFrames === last.presentedFrames + 1) {
          const samples = frameSamplesRef.current;
          samples.push(metadata.mediaTime - last.mediaTime);
          if (samples.length > 120) samples.shift();
        }
        last = metadata;
        handle = video.requestVideoFrameCallback!(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
      return () => {
        stopped = true;
        video.cancelVideoFrameCallback?.(handle);
      };
    // A new source is a new <video>: measure again.
    }, [fileUrl, isLiveStream]);
    const youtubeVideoId = source.kind === 'youtube' ? source.videoId : null;

    useEffect(() => {
      setAssetUrlFailed(false);
      setFallbackBlobUrl(null);
    }, [rawFilePath]);

    // Slow-path fallback, only engaged once the fast asset:// URL has
    // actually failed to load - confirmed on WebKitGTK/Linux: the request
    // that reaches Tauri's own asset-protocol scope check ends up with just
    // the bare filename, never the full path (traced into Tauri's source;
    // exact point where WebKitGTK/GStreamer drops the directory not pinned
    // down further). Reading the whole file via plugin-fs and handing the
    // <video> a blob: URL always works, but is much slower for large files
    // (no streaming/range-request support, unlike asset://) - so it's a
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
          // Leave fallbackBlobUrl null - the <video> onError handler below
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
      // The container may live in a picture-in-picture window's document.
      const mount = container.ownerDocument.createElement('div');
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
            onError: (event) => {
              if (cancelled) return;
              onPlayableRef.current?.(false, event.data);
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
      // read not resolved yet) - fileUrl is momentarily null; don't report
      // that as a failure, or the missing-resource banner would flash on
      // during every fallback.
      if (assetUrlFailed && !fallbackBlobUrl) return;
      if (source.kind === 'file' || source.kind === 'url') {
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
      getDuration() {
        if (suppressPosition) return null;
        if (videoRef.current) {
          const duration = videoRef.current.duration;
          return Number.isFinite(duration) && duration > 0 ? duration : null;
        }
        if (youtubePlayerRef.current && youtubeReady) {
          const duration = youtubePlayerRef.current.getDuration?.();
          return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null;
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
      isPaused() {
        if (videoRef.current) return videoRef.current.paused;
        if (youtubePlayerRef.current && youtubeReady) {
          const state = youtubePlayerRef.current.getPlayerState();
          return state !== 1 && state !== 3;
        }
        return true;
      },
      getPlaybackRate() {
        if (suppressPosition) return 1;
        if (videoRef.current) return Number.isFinite(videoRef.current.playbackRate) && videoRef.current.playbackRate > 0 ? videoRef.current.playbackRate : 1;
        if (youtubePlayerRef.current && youtubeReady) {
          const rate = youtubePlayerRef.current.getPlaybackRate?.();
          return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1;
        }
        return 1;
      },
      setPlaybackRate(rate: number) {
        if (suppressPosition) return;
        if (videoRef.current) {
          videoRef.current.playbackRate = rate;
        }
        if (youtubeReady) youtubePlayerRef.current?.setPlaybackRate(rate);
      },
      getFrameDuration() {
        return estimateFrameDuration(frameSamplesRef.current);
      },
      hasFrameAccess() {
        return Boolean(videoRef.current) && !isLiveStream;
      },
      captureFrame() {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) return Promise.resolve(null);
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return Promise.resolve(null);
        try {
          context.drawImage(video, 0, 0);
        } catch {
          return Promise.resolve(null);
        }
        return new Promise((resolve) => {
          try {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
          } catch {
            resolve(null);
          }
        });
      },
    }), [youtubeReady, suppressPosition, isLiveStream]);

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
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          onPlayableRef.current?.(true);
        }}
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
