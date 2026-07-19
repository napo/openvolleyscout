import { useEffect, useRef } from 'react';
import type { VideoPlayerHandle } from '@src/features/analysis/video/VideoPlayerView';

const POLL_INTERVAL_MS = 250;

export interface VideoClockHandle {
  getCurrentTime(): number | undefined;
}

/**
 * Polls a VideoPlayerHandle's position into a ref (not React state) so the
 * live scouting screen can read "what second is the video at" when a touch
 * is confirmed, without re-rendering at poll rate.
 */
export function useVideoClock(
  playerRef: React.RefObject<VideoPlayerHandle | null>,
  active: boolean,
): { current: VideoClockHandle } {
  const currentTimeRef = useRef<number | undefined>(undefined);
  const clockRef = useRef<VideoClockHandle>({
    getCurrentTime: () => currentTimeRef.current,
  });

  useEffect(() => {
    if (!active) {
      currentTimeRef.current = undefined;
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const time = playerRef.current?.getCurrentTime();
      currentTimeRef.current = typeof time === 'number' ? time : undefined;
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [active, playerRef]);

  return clockRef;
}
