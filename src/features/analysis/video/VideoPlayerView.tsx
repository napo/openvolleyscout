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
  pause(): void;
}

interface VideoPlayerViewProps {
  source: MatchVideoSource;
  /** Object URL of a re-linked local file (browser picker). */
  fileObjectUrl?: string | null;
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

export const VideoPlayerView = forwardRef<VideoPlayerHandle, VideoPlayerViewProps>(
  function VideoPlayerView({ source, fileObjectUrl, onPlayable }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
    const youtubePlayerRef = useRef<YouTubePlayerLike | null>(null);
    const [youtubeReady, setYoutubeReady] = useState(false);
    const onPlayableRef = useRef(onPlayable);
    onPlayableRef.current = onPlayable;

    const fileUrl = source.kind === 'file' ? resolveLocalVideoUrl(source.path, fileObjectUrl) : null;
    const youtubeVideoId = source.kind === 'youtube' ? source.videoId : null;

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
      if (source.kind === 'file') {
        onPlayableRef.current?.(Boolean(fileUrl));
      }
    }, [source.kind, fileUrl]);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number, autoplay: boolean) {
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
        if (videoRef.current) {
          return Number.isFinite(videoRef.current.currentTime) ? videoRef.current.currentTime : null;
        }
        if (youtubePlayerRef.current && youtubeReady) {
          const time = youtubePlayerRef.current.getCurrentTime();
          return Number.isFinite(time) ? time : null;
        }
        return null;
      },
      pause() {
        videoRef.current?.pause();
        if (youtubeReady) youtubePlayerRef.current?.pauseVideo();
      },
    }), [youtubeReady]);

    if (source.kind === 'youtube') {
      return <div className="video-analysis__player-frame" ref={youtubeContainerRef} />;
    }

    if (!fileUrl) {
      return null;
    }

    return (
      <video
        ref={videoRef}
        className="video-analysis__player-frame"
        src={fileUrl}
        controls
        preload="metadata"
        onError={() => onPlayableRef.current?.(false)}
      />
    );
  },
);
