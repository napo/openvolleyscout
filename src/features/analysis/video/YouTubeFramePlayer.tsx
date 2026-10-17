import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { VideoPlayerHandle } from './VideoPlayerView';

interface YouTubeFramePlayerProps {
  videoId: string;
  onPlayable?: (playable: boolean) => void;
}

type FrameMessage =
  | { ovsYoutube: true; type: 'ready' | 'error' }
  | { ovsYoutube: true; type: 'state'; time: number; paused: boolean };

/**
 * A YouTube player hosted by public/youtube-pip.html and driven through
 * postMessage. Used in the picture-in-picture window, whose about:blank
 * document gives an embedded player no Referer (YouTube error 153). Time
 * and play state are the page's latest report, a fraction of a second old.
 */
export const YouTubeFramePlayer = forwardRef<VideoPlayerHandle, YouTubeFramePlayerProps>(
  function YouTubeFramePlayer({ videoId, onPlayable }, ref) {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const stateRef = useRef<{ ready: boolean; time: number; paused: boolean }>({ ready: false, time: 0, paused: true });
    const onPlayableRef = useRef(onPlayable);
    onPlayableRef.current = onPlayable;

    const post = (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ ovsYoutube: true, ...message }, window.location.origin);
    };

    useEffect(() => {
      const frame = frameRef.current;
      const frameWindow = frame?.ownerDocument.defaultView;
      if (!frame || !frameWindow) return undefined;
      stateRef.current = { ready: false, time: 0, paused: true };

      const onMessage = (event: MessageEvent<FrameMessage>) => {
        if (event.source !== frame.contentWindow || event.data?.ovsYoutube !== true) return;
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
      // Already loaded before this effect ran.
      if (frame.contentDocument?.readyState === 'complete' && frame.contentWindow?.location.href !== 'about:blank') onLoad();
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
        src={`${import.meta.env.BASE_URL}youtube-pip.html`}
        title="YouTube"
        allow="autoplay; encrypted-media; picture-in-picture"
        style={{ border: 0 }}
      />
    );
  },
);
