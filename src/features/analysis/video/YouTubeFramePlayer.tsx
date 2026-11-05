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
  onPlayable?: (playable: boolean) => void;
}

type FrameMessage =
  | { ovsYoutube: true; type: 'ready' | 'error' }
  | { ovsYoutube: true; type: 'state'; time: number; paused: boolean };

/**
 * A YouTube player hosted by public/youtube-pip.html and driven through
 * postMessage. Used where an embedded player would get no Referer (YouTube
 * error 153): the picture-in-picture window (about:blank) and the native app.
 * Time and play state are the page's latest report, a fraction of a second old.
 */
export const YouTubeFramePlayer = forwardRef<VideoPlayerHandle, YouTubeFramePlayerProps>(
  function YouTubeFramePlayer({ videoId, onPlayable }, ref) {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const stateRef = useRef<{ ready: boolean; time: number; paused: boolean }>({ ready: false, time: 0, paused: true });
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
      stateRef.current = { ready: false, time: 0, paused: true };

      const onMessage = (event: MessageEvent<FrameMessage>) => {
        if (event.source !== frame.contentWindow || event.origin !== pageOrigin || event.data?.ovsYoutube !== true) return;
        const data = event.data;
        if (data.type === 'ready') {
          stateRef.current.ready = true;
          onPlayableRef.current?.(true);
        } else if (data.type === 'error') {
          onPlayableRef.current?.(false);
        } else if (data.type === 'state') {
          stateRef.current.time = data.time;
          stateRef.current.paused = data.paused;
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
        if (autoplay) stateRef.current.paused = false;
        post({ type: 'seek', seconds, autoplay });
      },
      getCurrentTime() {
        return stateRef.current.ready ? stateRef.current.time : null;
      },
      play() {
        stateRef.current.paused = false;
        post({ type: 'play' });
      },
      pause() {
        stateRef.current.paused = true;
        post({ type: 'pause' });
      },
      isPaused() {
        return stateRef.current.paused;
      },
      setPlaybackRate(rate: number) {
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
