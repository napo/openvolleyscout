import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { APP_METADATA } from '@src/lib/constants/app';
import type { VideoPlayerHandle } from './VideoPlayerView';

/**
 * Where the player page lives: next to the app on the web; in the desktop and
 * Android app, on the hosted web app, because pages served from tauri:// or
 * tauri.localhost give YouTube no usable Referer (error 153).
 */
function getPlayerPageUrl(): string {
  if (isTauri()) return `${APP_METADATA.urls.webApp.replace(/\/+$/, '')}/youtube-pip.html`;
  return new URL(`${import.meta.env.BASE_URL}youtube-pip.html`, window.location.href).href;
}

interface YouTubeFramePlayerProps {
  videoId: string;
  /** `errorCode`: the YouTube player error (100 private or removed, 101/150 embedding not allowed). */
  onPlayable?: (playable: boolean, errorCode?: number) => void;
}

type FrameMessage =
  | { ovsYoutube: true; type: 'ready' }
  | { ovsYoutube: true; type: 'error'; code?: number }
  | { ovsYoutube: true; type: 'state'; time: number; paused: boolean; rate?: number };

/**
 * A YouTube player hosted by public/youtube-pip.html and driven through
 * postMessage. Used where an embedded player would get no Referer (YouTube
 * error 153): the picture-in-picture window (about:blank) and the native app.
 * Time and play state are the page's latest report, a fraction of a second old.
 */
export const YouTubeFramePlayer = forwardRef<VideoPlayerHandle, YouTubeFramePlayerProps>(
  function YouTubeFramePlayer({ videoId, onPlayable }, ref) {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const stateRef = useRef<{ ready: boolean; time: number; paused: boolean; rate: number; updatedAtMs: number }>({
      ready: false,
      time: 0,
      paused: true,
      rate: 1,
      updatedAtMs: 0,
    });
    const onPlayableRef = useRef(onPlayable);
    onPlayableRef.current = onPlayable;
    const pageUrlRef = useRef(getPlayerPageUrl());
    const pageOrigin = new URL(pageUrlRef.current).origin;

    const post = (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ ovsYoutube: true, ...message }, pageOrigin);
    };

    useEffect(() => {
      const frame = frameRef.current;
      const frameWindow = frame?.ownerDocument.defaultView;
      if (!frame || !frameWindow) return undefined;
      stateRef.current = { ready: false, time: 0, paused: true, rate: 1, updatedAtMs: 0 };

      const onMessage = (event: MessageEvent<FrameMessage>) => {
        if (event.source !== frame.contentWindow || event.origin !== pageOrigin || event.data?.ovsYoutube !== true) return;
        const data = event.data;
        if (data.type === 'ready') {
          stateRef.current.ready = true;
          onPlayableRef.current?.(true);
        } else if (data.type === 'error') {
          onPlayableRef.current?.(false, typeof data.code === 'number' ? data.code : undefined);
        } else if (data.type === 'state') {
          stateRef.current.time = data.time;
          stateRef.current.paused = data.paused;
          if (typeof data.rate === 'number' && Number.isFinite(data.rate) && data.rate > 0) {
            stateRef.current.rate = data.rate;
          }
          stateRef.current.updatedAtMs = Date.now();
        }
      };
      const onLoad = () => post({ type: 'init', videoId });
      // The page posts to the window that contains the iframe.
      frameWindow.addEventListener('message', onMessage);
      frame.addEventListener('load', onLoad);
      // Already loaded before this effect ran (same-origin page only: a
      // cross-origin one is still loading here and fires 'load').
      try {
        if (frame.contentDocument?.readyState === 'complete' && frame.contentWindow?.location.href !== 'about:blank') onLoad();
      } catch {
        // Cross-origin page: its document cannot be inspected.
      }
      return () => {
        frameWindow.removeEventListener('message', onMessage);
        frame.removeEventListener('load', onLoad);
      };
    }, [videoId]);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number, autoplay: boolean) {
        stateRef.current.time = Math.max(0, seconds);
        stateRef.current.updatedAtMs = Date.now();
        if (autoplay) stateRef.current.paused = false;
        post({ type: 'seek', seconds, autoplay });
      },
      getCurrentTime() {
        if (!stateRef.current.ready) return null;
        if (stateRef.current.paused || stateRef.current.updatedAtMs <= 0) return stateRef.current.time;
        const elapsedSeconds = Math.min(0.3, Math.max(0, (Date.now() - stateRef.current.updatedAtMs) / 1000));
        return stateRef.current.time + elapsedSeconds * stateRef.current.rate;
      },
      play() {
        stateRef.current.paused = false;
        stateRef.current.updatedAtMs = Date.now();
        post({ type: 'play' });
      },
      pause() {
        stateRef.current.paused = true;
        post({ type: 'pause' });
      },
      isPaused() {
        return stateRef.current.paused;
      },
      getPlaybackRate() {
        return stateRef.current.rate;
      },
      setPlaybackRate(rate: number) {
        if (Number.isFinite(rate) && rate > 0) stateRef.current.rate = rate;
        post({ type: 'rate', rate });
      },
    }), []);

    return (
      <iframe
        ref={frameRef}
        className="video-analysis__player-frame"
        src={pageUrlRef.current}
        title="YouTube"
        allow="autoplay; encrypted-media; picture-in-picture"
        style={{ border: 0 }}
      />
    );
  },
);
